"""F01 — FastF1 session harvester. Resumable, failure-ledgered, never re-downloads.

Critical path: this runs for days (CLAUDE.md build order). Start it first.

Design per docs/SPEC.md sections 5.5 and 8 Phase 0:
- lap-level + weather + messages for ALL sessions 2023-2026 (cheap)
- telemetry only for the priority weekends, FP2 + R (heavy)
- one try/except per session; failures logged to the ledger, run continues
- FastF1's own cache makes completed sessions free to re-request, so resuming
  is simply re-running the script; a manifest records what finished.
"""

import json
import logging
import sys
import time
from datetime import datetime, timezone

from cleanroom import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("harvest")

MANIFEST = config.RAW_DIR / "harvest_manifest.json"
FAILURES = config.RAW_DIR / "harvest_failures.jsonl"


def _load_manifest() -> dict:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text())
    return {"done": {}}


def _save_manifest(m: dict) -> None:
    MANIFEST.write_text(json.dumps(m, indent=2))


def _log_failure(year: int, rnd: int, session: str, err: Exception) -> None:
    """Never let one failure kill the run (SPEC.md Phase 0 skeleton)."""
    rec = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "year": year, "round": rnd, "session": session,
        "error": f"{type(err).__name__}: {err}",
    }
    with FAILURES.open("a") as f:
        f.write(json.dumps(rec) + "\n")
    log.warning("FAILED %s %s %s: %s", year, rnd, session, err)


def harvest_session(fastf1, year: int, rnd: int, session: str, with_telemetry: bool):
    try:
        s = fastf1.get_session(year, rnd, session)
        s.load(telemetry=with_telemetry, weather=True, messages=True)
        return s
    except Exception as e:  # noqa: BLE001 — any failure is ledgered, run continues
        _log_failure(year, rnd, session, e)
        return None


def main() -> None:
    import fastf1  # imported here so `--help`/tests don't need the package resolved

    config.FASTF1_CACHE.mkdir(parents=True, exist_ok=True)
    # Cache BEFORE any other fastf1 call (F01 / SPEC.md 5.1).
    fastf1.Cache.enable_cache(str(config.FASTF1_CACHE))

    manifest = _load_manifest()
    telem_weekends = list(dict.fromkeys(config.TELEM_PRIORITY + config.TELEM_REST))[:25]

    # Pass 1 — priority telemetry weekends first (feeds Phase 2 early).
    jobs: list[tuple[int, int, str, bool]] = []
    for year, rnd in config.TELEM_PRIORITY:
        for sess in config.TELEM_SESSIONS:
            jobs.append((year, rnd, sess, True))
    # Pass 2 — lap-level for everything.
    for year in config.LAP_SEASONS:
        for rnd in range(1, config.MAX_ROUNDS + 1):
            for sess in config.LAP_SESSIONS:
                jobs.append((year, rnd, sess, False))
    # Pass 3 — remaining telemetry weekends.
    for year, rnd in telem_weekends:
        if (year, rnd) in config.TELEM_PRIORITY:
            continue
        for sess in config.TELEM_SESSIONS:
            jobs.append((year, rnd, sess, True))

    for year, rnd, sess, telem in jobs:
        key = f"{year}_{rnd}_{sess}_{'telem' if telem else 'laps'}"
        if manifest["done"].get(key):
            continue  # resumable: skip what already finished
        log.info("harvest %s", key)
        s = harvest_session(fastf1, year, rnd, sess, with_telemetry=telem)
        if s is not None:
            manifest["done"][key] = datetime.now(timezone.utc).isoformat()
            _save_manifest(manifest)
        time.sleep(1.0)  # be polite to the upstream API; cache absorbs re-runs

    log.info("harvest complete: %d sessions done", len(manifest["done"]))


if __name__ == "__main__":
    sys.exit(main())
