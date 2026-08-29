# CLEANROOM

**Isolating true tyre degradation from confounded F1 practice-session data.**

Practice lap times are contaminated by fuel load, track evolution, traffic and
push level — none of which are published. Every public tool *assumes* a fuel
correction; CLEANROOM *estimates* the confounders from public telemetry.
Full specification: [`docs/SPEC.md`](docs/SPEC.md).

## One-command reproduction

```bash
# Python (uv manages the venv)
uv sync
make fixtures        # synthetic data matching every frozen contract
make test            # schema + contract tests
make serve           # FastAPI on :8000  (docs at /docs)

# Dashboard
cd web && npm install && npm run dev   # Next.js on :3000
```

`make harvest` starts the multi-day FastF1 ingest (resumable — re-run it any
time; nothing is ever re-downloaded).

## Repository map

| Path | What |
|---|---|
| `docs/SPEC.md` | Problem, method, contracts, 15-day phase plan |
| `docs/FEATURES.md` | 100 features by ID (work is referenced as e.g. "F28") |
| `docs/STACK.md` | Every tech choice and what was rejected |
| `src/cleanroom/` | Python package — ingest → clean → physics → model → validate → serve |
| `tests/fixtures/` | Synthetic data, known ground truth, matches every schema |
| `web/` | Next.js dashboard (runs standalone on fixtures) |
| `results/` | `frozen_v1.json` is write-once after Phase 5 |

## Current phase

**Phase 0 — foundation.** Schemas frozen, fixtures generated, API + dashboard
render against fixtures. See `docs/PROGRESS.md`.
