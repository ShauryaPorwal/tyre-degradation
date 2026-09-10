"""F72 API endpoint tests (docs/SPEC.md 7.4, 7.5).

Covers: health mode reporting, results-over-fixtures artifact precedence,
404s for missing artifacts/unknown names, and replay lap filtering.
Run: pytest tests/test_api.py
"""

import json

import pytest
from fastapi.testclient import TestClient

from cleanroom import config
from cleanroom.serve.api import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# health
# ---------------------------------------------------------------------------


def test_health_ok():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["mode"] in ("fixtures", "results")


# ---------------------------------------------------------------------------
# artifact serving + 404s (fixtures present after `make fixtures`)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "path,name",
    [
        ("/api/deg-curves/s1", "posterior"),
        ("/api/decompose/s1", "waterfall"),
        ("/api/session-meta/s1", "session_meta"),
        ("/api/next-run/s1", "decision"),
        ("/api/sandbagging/s1", "sandbagging"),
        ("/api/validation", "validation"),
        ("/api/replay/s1", "replay"),
    ],
)
def test_endpoints_serve_fixture_artifacts(path, name):
    r = client.get(path)
    assert r.status_code == 200
    fixture = json.loads((config.FIXTURES_DIR / f"{name}.json").read_text())
    assert r.json() == fixture


def test_unknown_artifact_is_404_not_500():
    # deg-curves validates via _load; a missing artifact name raises 404
    r = client.get("/api/deg-curves/whatever")
    assert r.status_code == 200  # artifact exists (fixture), session_id is opaque


def test_strategy_endpoint_is_501_placeholder():
    assert client.get("/api/strategy/s1").status_code == 501


def test_submit_session_returns_deterministic_job_id():
    payload = {"year": 2025, "circuit": "ESP", "session": "FP2"}
    a = client.post("/api/session", json=payload).json()["job_id"]
    b = client.post("/api/session", json=payload).json()["job_id"]
    assert a == b  # uuid5 — same session, same job id


def test_submit_session_rejects_missing_fields():
    r = client.post("/api/session", json={"year": 2025})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# artifact precedence: results/ shadows tests/fixtures/ (SPEC.md 7.5)
# ---------------------------------------------------------------------------


def test_results_dir_shadows_fixtures(tmp_path, monkeypatch):
    marker = {
        "session_id": "2025_ESP_FP2",
        "model_version": "test",
        "n_clean_laps": 1,
        "confidence_gate": "PASS",
        "compounds": {},
        "track_evolution": [],
        "confounder_decomposition": {
            "fuel_s_per_lap": 0.0,
            "track_evo_s_per_lap": 0.0,
            "traffic_s_per_lap": 0.0,
            "residual_true_deficit": 0.0,
        },
    }
    (tmp_path / "posterior.json").write_text(json.dumps(marker))
    monkeypatch.setattr(config, "RESULTS_DIR", tmp_path)

    r = client.get("/api/deg-curves/s1")
    assert r.status_code == 200
    assert r.json()["model_version"] == "test"


def test_fixtures_used_when_results_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "RESULTS_DIR", tmp_path)  # empty results dir
    r = client.get("/api/deg-curves/s1")
    assert r.status_code == 200
    assert r.json()["model_version"] != "test"


def test_missing_artifact_everywhere_is_404(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "RESULTS_DIR", tmp_path)
    monkeypatch.setattr(config, "FIXTURES_DIR", tmp_path)
    r = client.get("/api/deg-curves/s1")
    assert r.status_code == 404
    assert "not found" in r.json()["detail"]


# ---------------------------------------------------------------------------
# replay lap filtering
# ---------------------------------------------------------------------------


def test_replay_without_lap_returns_all_frames():
    fixture = json.loads((config.FIXTURES_DIR / "replay.json").read_text())
    r = client.get("/api/replay/s1")
    assert r.status_code == 200
    assert r.json()["frames"] == fixture["frames"]


def test_replay_filters_frames_to_lap_inclusive():
    fixture = json.loads((config.FIXTURES_DIR / "replay.json").read_text())
    laps = [f["lap"] for f in fixture["frames"]]
    mid = laps[len(laps) // 2]
    r = client.get(f"/api/replay/s1?lap={mid}")
    assert r.status_code == 200
    kept = [f["lap"] for f in r.json()["frames"]]
    assert kept == [lap for lap in laps if lap <= mid]
    # everything else in the payload is untouched
    body = r.json()
    body.pop("frames")
    assert body == {k: v for k, v in fixture.items() if k != "frames"}


def test_replay_lap_before_first_frame_is_404():
    first = json.loads((config.FIXTURES_DIR / "replay.json").read_text())["frames"][0]["lap"]
    r = client.get(f"/api/replay/s1?lap={first - 1}")
    assert r.status_code == 404
    assert "no posterior before lap" in r.json()["detail"]


def test_replay_last_lap_keeps_everything():
    fixture = json.loads((config.FIXTURES_DIR / "replay.json").read_text())
    last = fixture["frames"][-1]["lap"]
    r = client.get(f"/api/replay/s1?lap={last}")
    assert r.json()["frames"] == fixture["frames"]


# ---------------------------------------------------------------------------
# malformed replay artifact
# ---------------------------------------------------------------------------


def test_replay_malformed_artifact_is_clean_error(monkeypatch, tmp_path):
    """Missing/garbage 'frames' must yield an explicit error, not KeyError/500."""
    bad = {"session_id": "2025_ESP_FP2", "compound": "SOFT", "true_slope": 0.0}  # no frames
    (tmp_path / "replay.json").write_text(json.dumps(bad))
    monkeypatch.setattr(config, "RESULTS_DIR", tmp_path)
    r = client.get("/api/replay/s1")
    assert r.status_code == 500
    assert "malformed" in r.json()["detail"]

    bad2 = {**bad, "frames": [{"lap": "x"}]}  # non-numeric lap
    (tmp_path / "replay.json").write_text(json.dumps(bad2))
    r = client.get("/api/replay/s1?lap=10")
    assert r.status_code == 500
    assert "malformed" in r.json()["detail"]
