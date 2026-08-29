# CLEANROOM

Tyre degradation deconfounding for F1 practice sessions.
Full specification: **`docs/SPEC.md`** — read it before implementing anything.

## Project rules

1. **Never invent data.** If a value is not available from FastF1, OpenF1, or a
   file in `data/`, it must be estimated by a documented method or flagged as
   missing. No hardcoded magic constants without a source comment.
2. **Every physical constant carries a source comment.**
   e.g. `# 0.03 s/kg fuel effect: industry rule of thumb. We FIT this per circuit.`
3. **All randomness is seeded.** Set seeds at module level.
4. **Any function producing a number used in final results has a test** in `tests/`.
5. **Results are frozen.** Once `results/frozen_v1.json` exists it is read-only.
6. **Fail loudly on data problems.** Never silently drop rows. Every filter logs
   how many rows it removed and why, into the exclusion ledger.
7. **Prefer boring, inspectable code.** This will be judged on whether a stranger
   can verify it. No clever one-liners.
8. **Cache aggressively.** FastF1 downloads are the slowest thing here. Never
   re-download.
9. **When uncertain between two modelling choices, implement both** and compare
   on held-out data. Report the loser too.
10. **Never modify `data/raw/`.** It is immutable.

## Current phase

Phase 0 — foundation. See `docs/SPEC.md` section 8.

## Commands

```
make harvest    # FastF1 + OpenF1 ingest (resumable)
make features   # clean gate + physics estimators
make model      # fit hierarchical (falls back to mixedlm)
make validate   # backtest, calibration, ablation, leakage audit
make all
```

## Update after every phase

Append to `docs/PROGRESS.md`: what was built, the numbers, what broke.

## Reference documents

- `docs/SPEC.md` — problem statement, method (maths), data sources, contracts, phase plan
- `docs/FEATURES.md` — 100 features with IDs, sources, methods, priorities, exit tests
- `docs/STACK.md` — tech stack decisions and rationale

Reference these by path and section. Work by feature ID (e.g. "implement F27, F28").

## Build order — Day 1

1. Scaffold repo per SPEC.md §6
2. **F01 harvester first** — it runs for days, it is the critical path
3. F16 schemas + F17 fixtures while harvest runs
4. F72 API + frontend skeletons against fixtures

Before writing schemas: load one FastF1 session and print
`session.laps.columns` and `lap.get_car_data().columns`. Reconcile against
SPEC.md §7. Column names shift between versions.

## Critical implementation note

Use `scipy.signal.savgol_filter` for all derivatives (dv/dt, curvature).
**Never `np.diff`.** Telemetry is a few Hz with sensor noise; finite
differences amplify it into garbage silently and will destroy F28 and F33.

## End every session with

Append to `docs/PROGRESS.md`: what was built, numbers produced, what broke,
what's next.

## v2 — additions after feature review

- `docs/ADDITIONS.md` — F101–F107 (Value of Information, sufficiency meter,
  story mode, presets). Read before building the decision layer or frontend.
- `docs/UI.md` — UI/UX spec. **4 screens, 1 drawer, 1 story mode.** Read before
  writing any frontend code. Do not add screens beyond this spec.

Two method corrections that override the original suggestion document:
- Fuel: **estimate** mass from telemetry (F27–F31). The constant 0.03 s/kg is
  Baseline B (F40) — the thing we beat, not the method we use.
- Track evolution: estimate **inside** the joint model (F47). Never subtract a
  fitted trend in pre-processing — it biases every downstream coefficient.
