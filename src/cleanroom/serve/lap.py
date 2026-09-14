"""CLEANROOM FastAPI service with ML prediction and full pit-wall analysis."""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from cleanroom import config
from cleanroom.ingest.schemas import Decision, Posterior, SessionMeta
from cleanroom.ingest.lap_data import find_lap, row_to_state
from cleanroom.ml.analysis import analyse_state, result_dict
from cleanroom.ml.infer import get_predictor

app = FastAPI(title="CLEANROOM API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3100",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load(name: str) -> dict | list:
    for base in (config.RESULTS_DIR, config.FIXTURES_DIR):
        path: Path = base / f"{name}.json"
        if path.exists():
            return json.loads(path.read_text())
    raise HTTPException(404, f"artifact '{name}' not found")


class SessionRequest(BaseModel):
    year: int
    circuit: str
    session: str


class PredictRequest(BaseModel):
    lap: float | None = None
    compound: str | None = None
    tyre_age: float | None = None
    stint: float | None = None
    fuel_kg: float | None = None
    track_temp: float | None = None
    air_temp: float | None = None
    rainfall: bool | None = None
    fresh_tyre: bool | None = None
    circuit: str | None = None
    session_type: str | None = None
    driver: str | None = None
    team: str | None = None
    session_clock_s: float | None = None
    speed_i1: float | None = None
    speed_i2: float | None = None
    speed_fl: float | None = None
    speed_st: float | None = None

    # Optional live/simulator fields used by the analysis layer.
    traffic_gap_s: float | None = None
    track_evolution_s_per_lap: float | None = None
    throttle_mean_pct: float | None = None
    brake_mean_pct: float | None = None
    fuel_burn_kg_per_lap: float | None = None
    fuel_reference_kg: float | None = None
    tyre_pressure_psi: float | None = None
    tyre_temp_inner_c: float | None = None
    tyre_temp_middle_c: float | None = None
    tyre_temp_outer_c: float | None = None
    wheel_slip_pct: float | None = None
    vertical_load_n: float | None = None

    model_config = {"extra": "allow"}


class AnalyzeRequest(PredictRequest):
    race: str = "Unknown race"
    year: int = 2025
    lap: int = 1


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "mode": "fixtures"
        if not (config.RESULTS_DIR / "posterior.json").exists()
        else "results",
    }


@app.post("/api/session")
def submit_session(req: SessionRequest) -> dict:
    return {"job_id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{req.year}_{req.circuit}_{req.session}"))}


@app.get("/api/deg-curves/{session_id}")
def deg_curves(session_id: str) -> dict:
    posterior = _load("posterior")
    Posterior.model_validate(posterior)
    return posterior


@app.get("/api/decompose/{session_id}")
def decompose(session_id: str) -> dict:
    return _load("waterfall")


@app.get("/api/session-meta/{session_id}")
def session_meta(session_id: str) -> dict:
    meta = _load("session_meta")
    SessionMeta.model_validate(meta)
    return meta


@app.get("/api/next-run/{session_id}")
def next_run(session_id: str) -> dict:
    decision = _load("decision")
    Decision.model_validate(decision)
    return decision


@app.get("/api/strategy/{session_id}")
def strategy(session_id: str) -> dict:
    raise HTTPException(501, "Use POST /api/analyze for the current analysis layer")


@app.get("/api/sandbagging/{session_id}")
def sandbagging(session_id: str) -> dict:
    return _load("sandbagging")


@app.get("/api/validation")
def validation() -> dict:
    return _load("validation")


@app.get("/api/replay/{session_id}")
def replay(session_id: str, lap: int | None = None) -> dict:
    data = _load("replay")
    frames = data.get("frames")
    if not isinstance(frames, list) or any(
        not isinstance(frame, dict) or not isinstance(frame.get("lap"), (int, float))
        for frame in frames
    ):
        raise HTTPException(500, "replay artifact malformed")
    if lap is not None:
        kept = [frame for frame in frames if frame["lap"] <= lap]
        if not kept:
            raise HTTPException(404, f"no replay data before lap {lap}")
        return {**data, "frames": kept}
    return data


@app.get("/api/ml/status")
def ml_status() -> dict:
    predictor = get_predictor()
    meta = predictor.metadata or {}
    metrics = meta.get("val_metrics") or {}
    if metrics.get("mae") is None:
        results = meta.get("results") or {}
        metrics = (results.get(meta.get("selected") or "") or {}).get("metrics") or {}
    return {
        "available": predictor.available,
        "model_id": getattr(predictor, "model_id", None),
        "load_error": predictor.load_error,
        "trained_at": meta.get("trained_at") or meta.get("created_utc"),
        "val_mae_s": metrics.get("mae"),
    }


@app.post("/api/ml/predict")
def ml_predict(req: PredictRequest) -> dict:
    result = get_predictor().predict(req.model_dump())
    return {
        "predicted_lap_time_s": result.predicted_lap_time_s,
        "source": result.source,
        "model_id": result.model_id,
        "reason": result.reason,
        "features_used": result.features_used,
    }


@app.post("/api/analyze")
def analyze(req: AnalyzeRequest) -> dict:
    """Look up one real harvested lap and return the complete pit-wall result."""
    started = time.perf_counter()
    try:
        row = find_lap(
            year=req.year,
            circuit=req.circuit or "Barcelona",
            session_type=req.session_type or "FP2",
            driver=req.driver or "VER",
            lap=req.lap,
        )
    except (FileNotFoundError, LookupError, ValueError) as exc:
        raise HTTPException(404, str(exc)) from exc

    state = row_to_state(row)
    # Optional request values override the harvested row, which is useful for
    # what-if scenarios. Identity and lap fields remain tied to the selected row.
    overrides = req.model_dump(exclude={"race", "year", "lap"})
    for key, value in overrides.items():
        if value is not None and key not in {"driver", "circuit", "session_type"}:
            state[key] = value
    prediction = get_predictor().predict(state)
    analysis = analyse_state(state, prediction.predicted_lap_time_s)
    return {
        "race": req.race,
        "driver": state.get("driver"),
        "session": state.get("session_type"),
        "lap": state.get("lap"),
        "source_row": row,
        "prediction": {
            "predicted_lap_time_s": prediction.predicted_lap_time_s,
            "source": prediction.source,
            "model_id": prediction.model_id,
            "reason": prediction.reason,
            "features_used": prediction.features_used,
        },
        **result_dict(analysis),
        "processing_time_ms": round((time.perf_counter() - started) * 1000, 2),
        "disclaimer": "Sensor fields are estimated when live values are not supplied.",
    }