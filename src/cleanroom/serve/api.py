"""F72 — FastAPI service. Endpoints per docs/SPEC.md section 7.4.

Phase 0: serves synthetic fixtures so the frontend is buildable before real
data exists. From Phase 4 onward, results/ artifacts take precedence over
fixtures automatically — same contract, no frontend change (SPEC.md 7.5).
"""

import json
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from cleanroom import config
from cleanroom.ingest.schemas import Decision, Posterior, SessionMeta

app = FastAPI(title="CLEANROOM API", version="0.1.0")

# Local dashboard only; tighten before any public deploy.
app.add_middleware(
    CORSMiddleware,
    # 3000 is the Next.js default; 3100 is where CLEANROOM actually runs
    # locally (3000 is occupied by an unrelated project — see PROGRESS.md).
    allow_origins=["http://localhost:3000", "http://localhost:3100"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load(name: str) -> dict | list:
    """results/ first (real artifacts), tests/fixtures/ as Phase-0 fallback."""
    for base in (config.RESULTS_DIR, config.FIXTURES_DIR):
        path: Path = base / f"{name}.json"
        if path.exists():
            return json.loads(path.read_text())
    raise HTTPException(404, f"artifact '{name}' not found — run `make fixtures`")


class SessionRequest(BaseModel):
    year: int
    circuit: str
    session: str


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "mode": "fixtures" if not (config.RESULTS_DIR / "posterior.json").exists() else "results"}


@app.post("/api/session")
def submit_session(req: SessionRequest) -> dict:
    # Phase 0 stub: job queue (F73) arrives in Phase 7.
    return {"job_id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{req.year}_{req.circuit}_{req.session}"))}


@app.get("/api/deg-curves/{session_id}")
def deg_curves(session_id: str) -> dict:
    posterior = _load("posterior")
    Posterior.model_validate(posterior)  # contract enforced at the boundary
    return posterior


@app.get("/api/decompose/{session_id}")
def decompose(session_id: str) -> dict:
    return _load("waterfall")


@app.get("/api/session-meta/{session_id}")
def session_meta(session_id: str) -> dict:
    """F104 sufficiency + F105 health + F107 presets (docs/ADDITIONS.md)."""
    meta = _load("session_meta")
    SessionMeta.model_validate(meta)
    return meta


@app.get("/api/next-run/{session_id}")
def next_run(session_id: str) -> dict:
    """F101 VOI recommendation + F102 knowledge gaps (docs/ADDITIONS.md)."""
    decision = _load("decision")
    Decision.model_validate(decision)
    return decision


@app.get("/api/strategy/{session_id}")
def strategy(session_id: str) -> dict:
    # Stint simulator (F65-F67) lands Phase 6; fixture shape not yet frozen.
    raise HTTPException(501, "strategy layer arrives in Phase 6")


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
        not isinstance(f, dict) or not isinstance(f.get("lap"), (int, float))
        for f in frames
    ):
        raise HTTPException(
            500,
            "replay artifact malformed: 'frames' must be a list of objects with numeric 'lap'",
        )
    if lap is not None:
        kept = [f for f in frames if f["lap"] <= lap]
        if not kept:
            raise HTTPException(404, f"no posterior before lap {lap}")
        return {**data, "frames": kept}
    return data
