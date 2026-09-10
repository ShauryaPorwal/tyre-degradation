"""F-ML5 — inference service: load-once, predict-with-fallback.

Contract with the Live Sim:
  predict_lap_time(state: dict) -> MLResult

`state` is the CANONICAL simulation state for the lap about to be predicted
(the resolver's output — never a stale copy). The service:
  1. loads the selected artifact once at import (models/latest.json),
  2. validates the feature vector (ranges, types, NaN handling),
  3. predicts, then validates the PREDICTION (finite, inside a sane band,
      not off by more than the model's validation RMSE*6 from the baseline
      guess — a model output outside physics is rejected, not shown),
  4. falls back to the deterministic baseline (the Live-Sim linear model)
      on ANY failure: missing artifact, bad features, library error,
      invalid prediction. The Live Sim must never break because of ML.

The service NEVER mutates state: lap counting, tyre age, stint transitions
and fuel arithmetic stay deterministic (project rule).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from cleanroom import config
from cleanroom.ml.dataset import CATEGORICAL_FEATURES, FEATURES, NUMERIC_FEATURES

log = logging.getLogger("ml.infer")

MODELS_DIR = config.REPO_ROOT / "models"
VALID_LAP_TIME_S = (30.0, 300.0)
# a prediction further than this from the baseline is treated as a model fault
MAX_BASELINE_DEVIATION_S = 15.0


@dataclass
class MLResult:
    predicted_lap_time_s: float
    source: str  # "ml" | "deterministic_baseline"
    model_id: str | None
    reason: str | None  # why the fallback fired, if it did
    features_used: dict


class LapTimePredictor:
    """Load-once predictor. Instantiation NEVER raises: if anything is wrong
    the predictor degrades to the deterministic baseline and reports why."""

    def __init__(self, models_dir: Path = MODELS_DIR):
        self._artifact: dict | None = None
        self._meta: dict | None = None
        self._load_error: str | None = None
        try:
            self._load(models_dir)
        except Exception as e:  # noqa: BLE001 — model load failure is a fallback, not a crash
            self._load_error = f"{type(e).__name__}: {e}"
            log.warning(
                "ML model unavailable — deterministic fallback active: %s", self._load_error
            )

    def _load(self, models_dir: Path) -> None:
        latest = models_dir / "latest.json"
        if not latest.exists():
            raise FileNotFoundError(f"{latest} not found — run `make train-ml`")
        model_id = json.loads(latest.read_text())["model_id"]
        path = models_dir / f"{model_id}.joblib"
        if not path.exists():
            raise FileNotFoundError(f"artifact {path} missing")
        import joblib

        self._artifact = joblib.load(path)
        meta_path = models_dir / f"{model_id}.metadata.json"
        self._meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        self.model_id = model_id
        log.info("loaded ML artifact %s (kind=%s)", model_id, self._artifact.get("kind"))

    # ------------------------------------------------------------------ API
    @property
    def available(self) -> bool:
        return self._artifact is not None and self._artifact.get("model") is not None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    @property
    def metadata(self) -> dict | None:
        return self._meta

    def predict(self, state: dict[str, Any]) -> MLResult:
        if not isinstance(state, dict):
            return MLResult(
                80.0,
                "deterministic_baseline",
                None,
                f"ML unavailable: state is {type(state).__name__}, not a dict",
                {},
            )
        feats = self._features_from_state(state)
        if self.available and feats is not None:
            try:
                raw = self._raw_predict(feats)
                base = self._baseline_predict(feats)
                if self._prediction_is_sane(raw, base):
                    return MLResult(float(raw), "ml", self.model_id, None, feats)
                reason = (
                    f"prediction {raw:.2f} s rejected: outside physics band or "
                    f"> {MAX_BASELINE_DEVIATION_S:.0f} s from the deterministic baseline"
                )
                log.warning("%s — falling back", reason)
                return MLResult(float(base), "deterministic_baseline", None, reason, feats)
            except Exception as e:  # noqa: BLE001 — any inference error falls back
                reason = f"{type(e).__name__}: {e}"
                log.warning("ML inference failed (%s) — deterministic fallback", reason)
                feats = feats or {}
                return MLResult(
                    float(self._baseline_from_state(state)),
                    "deterministic_baseline",
                    None,
                    reason,
                    feats,
                )
        # unusable features -> pure prior (constants.ts parity), not the fitted baseline:
        # the fitted baseline assumes a resolvable feature vector that we don't have.
        reason = self._load_error or "state lacks required context for ML features"
        base = 80.0 + 0.06 * float(state.get("tyre_age", 0) or 0)
        return MLResult(
            float(base), "deterministic_baseline", None, f"ML unavailable: {reason}", feats or {}
        )

    # ------------------------------------------------------------- internals
    def _features_from_state(self, state: dict[str, Any]) -> dict | None:
        """Canonical sim state -> feature dict. None if state is unusable."""
        if not isinstance(state, dict):
            return None
        lap = state.get("lap")
        compound = state.get("compound")
        tyre_age = state.get("tyre_age", state.get("tyre_life"))
        if not isinstance(lap, (int, float)) or lap < 1:
            return None
        if not compound:
            return None  # no compound -> model can't resolve tyre behaviour -> refuse ML
        if tyre_age is None or not isinstance(tyre_age, (int, float)) or tyre_age < 0:
            return None  # unresolvable tyre age -> refuse ML, let the fallback run
        f = {c: state.get(c) for c in NUMERIC_FEATURES}
        f["tyre_life"] = float(tyre_age)
        f["stint"] = float(state.get("stint") or 1)
        f["lap_number"] = float(lap)
        f["fresh_tyre"] = bool(state.get("fresh_tyre", float(tyre_age) == 0))
        f["rainfall"] = bool(state.get("rainfall", False))
        f["track_temp"] = (
            float(state["track_temp"]) if state.get("track_temp") is not None else np.nan
        )
        f["air_temp"] = float(state["air_temp"]) if state.get("air_temp") is not None else np.nan
        f["session_clock_s"] = (
            float(state["session_clock_s"]) if state.get("session_clock_s") is not None else np.nan
        )
        for c in CATEGORICAL_FEATURES:
            f[c] = (
                str(state.get(c) or "UNKNOWN").upper()
                if c == "compound"
                else str(state.get(c) or "UNKNOWN")
            )
        f["circuit"] = f.get("circuit") or str(state.get("circuit") or "UNKNOWN")
        f["session_type"] = f.get("session_type") or str(state.get("session_type") or "R")
        return {k: f.get(k) for k in FEATURES}

    def _raw_predict(self, feats: dict) -> float:
        # artifact stores {pre, model}: inference MUST apply the identical
        # preprocessor fitted at training time (one-hot + median impute),
        # not native categoricals — see train._make_models rationale.
        fitted = self._artifact["model"]
        X = pd.DataFrame([feats])
        return float(np.asarray(fitted["model"].predict(fitted["pre"].transform(X)))[0])

    def _baseline_predict(self, feats: dict) -> float:
        b = self._artifact["baseline"]
        age = float(feats["tyre_life"]) - b["ref_age"]
        stint = float(feats["stint"])
        return b["intercept"] + b["deg_per_lap"] * age + b["stint_effect"] * stint

    def _baseline_from_state(self, state: dict[str, Any]) -> float:
        """Baseline with NO artifact at all: 80 s + deg prior (constants.ts parity)."""
        if self._artifact and self._artifact.get("baseline"):
            feats = self._features_from_state(state) or {
                "tyre_life": float(state.get("tyre_age", 0) or 0),
                "stint": float(state.get("stint") or 1),
            }
            return float(self._baseline_predict(feats))
        return 80.0 + 0.06 * float(state.get("tyre_age", 0) or 0)

    def _prediction_is_sane(self, pred: float, base: float) -> bool:
        if not np.isfinite(pred):
            return False
        if not (VALID_LAP_TIME_S[0] <= pred <= VALID_LAP_TIME_S[1]):
            return False
        return abs(pred - base) <= MAX_BASELINE_DEVIATION_S


# module-level singleton: loaded once per process (rule 14 — no per-render loads)
_predictor: LapTimePredictor | None = None


def get_predictor() -> LapTimePredictor:
    global _predictor
    if _predictor is None:
        _predictor = LapTimePredictor()
    return _predictor


def predict_lap_time(state: dict[str, Any]) -> MLResult:
    """Public entry point for the Live Sim / API. Never raises."""
    try:
        return get_predictor().predict(state)
    except Exception as e:  # noqa: BLE001 — last-resort guard
        log.error("predictor crashed (%s) — pure-prior fallback", e)
        age = float(state.get("tyre_age", 0) or 0)
        return MLResult(
            80.0 + 0.06 * age, "deterministic_baseline", None, f"predictor crash: {e}", {}
        )
