"""F-ML5 tests: inference service, validation, deterministic fallback, e2e.

Covers:
  - artifact present + metadata sane (F-ML4 output contract)
  - predict returns ML for a good state
  - predict NEVER raises and falls back for garbage / missing features
  - prediction sanity band + baseline-deviation gate
  - fallback matches the Live-Sim linear model arithmetic
  - API endpoints /api/ml/status + /api/ml/predict
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from cleanroom.config import REPO_ROOT
from cleanroom.ml.infer import LapTimePredictor, MLResult, predict_lap_time

MODELS_DIR = REPO_ROOT / "models"
ARTIFACT_DIR = REPO_ROOT / "models"

GOOD_STATE = {
    "lap": 12,
    "compound": "MEDIUM",
    "tyre_age": 6,
    "stint": 2,
    "fuel_kg": 55.0,
    "track_temp": 38.0,
    "air_temp": 24.0,
    "rainfall": False,
    "fresh_tyre": False,
    "circuit": "MONZA",
    "session_type": "R",
    "session_clock_s": 2400.0,
}


def _meta() -> dict:
    mid = json.loads((MODELS_DIR / "latest.json").read_text())["model_id"]
    return json.loads((MODELS_DIR / f"{mid}.metadata.json").read_text())


@pytest.fixture(scope="module")
def predictor() -> LapTimePredictor:
    return LapTimePredictor(MODELS_DIR)


# ------------------------------------------------------------- F-ML4 contract
def test_artifact_and_metadata_present():
    latest = MODELS_DIR / "latest.json"
    assert latest.exists(), "models/latest.json missing — run training"
    mid = json.loads(latest.read_text())["model_id"]
    art = MODELS_DIR / f"{mid}.joblib"
    meta = MODELS_DIR / f"{mid}.metadata.json"
    assert art.exists() and meta.exists()
    m = _meta()
    assert m["selected"] in {"CatBoost", "XGBoost", "LightGBM", "deterministic_baseline"}
    # F-ML4 metadata schema: per-model metrics under results.<name>.metrics
    results = m["results"]
    assert "deterministic_baseline" in results
    sel = results[m["selected"]]["metrics"]
    for k in ("mae", "rmse"):
        assert k in sel and np.isfinite(sel[k])
    assert sel["rmse"] >= 0
    # selection rule: chosen model must not be worse than the baseline
    base_rmse = results["deterministic_baseline"]["metrics"]["rmse"]
    assert sel["rmse"] <= base_rmse * 1.05 + 1e-9


# --------------------------------------------------------------- happy path
def test_predict_returns_ml_for_good_state(predictor: LapTimePredictor):
    r = predictor.predict(GOOD_STATE)
    assert isinstance(r, MLResult)
    assert 30.0 <= r.predicted_lap_time_s <= 300.0
    assert r.source == "ml"
    assert r.reason is None
    assert r.model_id is not None
    assert r.features_used.get("tyre_life") == 6.0


def test_predict_repeated_calls_are_deterministic(predictor: LapTimePredictor):
    a = predictor.predict(GOOD_STATE)
    b = predictor.predict(dict(GOOD_STATE))
    assert a.predicted_lap_time_s == b.predicted_lap_time_s
    assert a.source == b.source


def test_public_entry_point_never_raises():
    r = predict_lap_time(GOOD_STATE)
    assert 30.0 <= r.predicted_lap_time_s <= 300.0


# ---------------------------------------------------------------- validation
@pytest.mark.parametrize(
    "bad",
    [
        {},
        {"lap": 0, "tyre_age": 1},
        {"lap": 3, "tyre_age": -2},
        {"lap": None, "tyre_age": 2},
        "not-a-dict",
    ],
)
def test_unusable_state_falls_back(bad, predictor: LapTimePredictor):
    r = predictor.predict(bad)
    assert r.source == "deterministic_baseline"
    assert r.reason
    assert 30.0 <= r.predicted_lap_time_s <= 300.0


def test_baseline_fallback_matches_linear_model(predictor: LapTimePredictor):
    """Fallback arithmetic = Live-Sim linear model (constants parity)."""
    r = predictor.predict({"lap": 5, "tyre_age": 10})
    assert r.source == "deterministic_baseline"
    assert r.predicted_lap_time_s == pytest.approx(80.0 + 0.06 * 10)


def test_unknown_compound_falls_back_or_is_clamped(predictor: LapTimePredictor):
    r = predictor.predict({**GOOD_STATE, "compound": "UNOBTANIUM"})
    assert 30.0 <= r.predicted_lap_time_s <= 300.0


def test_sanity_gate_rejects_insane_prediction(monkeypatch):
    p = LapTimePredictor(MODELS_DIR)
    if not p.available:
        pytest.skip("no artifact")
    monkeypatch.setattr(p, "_raw_predict", lambda feats: 9999.0)
    r = p.predict(GOOD_STATE)
    assert r.source == "deterministic_baseline"
    assert "rejected" in r.reason


def test_baseline_deviation_gate(monkeypatch):
    p = LapTimePredictor(MODELS_DIR)
    if not p.available:
        pytest.skip("no artifact")
    monkeypatch.setattr(p, "_raw_predict", lambda feats: 45.0)  # far off but inside band
    r = p.predict(GOOD_STATE)
    assert r.source == "deterministic_baseline"
    assert "from the deterministic baseline" in r.reason


def test_missing_artifact_falls_back(tmp_path: Path):
    p = LapTimePredictor(tmp_path)
    assert not p.available
    assert p.load_error and "latest.json" in p.load_error
    r = p.predict(GOOD_STATE)
    assert r.source == "deterministic_baseline"
    assert "ML unavailable" in r.reason
    assert r.predicted_lap_time_s == pytest.approx(80.0 + 0.06 * 6)


def test_load_crash_falls_back(tmp_path: Path, monkeypatch):
    # corrupt latest.json -> constructor must not raise
    (tmp_path / "latest.json").write_text("{bad json")
    p = LapTimePredictor(tmp_path)
    assert not p.available and p.load_error


def test_inference_crash_falls_back(predictor: LapTimePredictor, monkeypatch):
    if not predictor.available:
        pytest.skip("no artifact")

    def boom(feats):
        raise RuntimeError("boom")

    monkeypatch.setattr(predictor, "_raw_predict", boom)
    r = predictor.predict(GOOD_STATE)
    assert r.source == "deterministic_baseline"
    assert "RuntimeError" in r.reason


# ------------------------------------------------------------------ e2e: API
def test_api_ml_endpoints():
    from cleanroom.serve.api import app

    client = TestClient(app)
    st = client.get("/api/ml/status")
    assert st.status_code == 200
    body = st.json()
    assert body["available"] is True
    assert body["model_id"]
    assert isinstance(body["val_mae_s"], (int, float))

    pr = client.post("/api/ml/predict", json=GOOD_STATE)
    assert pr.status_code == 200
    d = pr.json()
    assert d["source"] == "ml"
    assert 30.0 <= d["predicted_lap_time_s"] <= 300.0

    bad = client.post("/api/ml/predict", json={})
    assert bad.status_code == 200  # never 500 — falls back instead
    assert bad.json()["source"] == "deterministic_baseline"
