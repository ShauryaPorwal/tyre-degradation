# PROGRESS

Append-only log. One entry per phase, per docs/SPEC.md section 0.

---

## 2026-08-23 — Phase 0: foundation (recovered + completed)

**Context:** previous session's terminal died mid-Phase-0 (~20:44): `.venv` was
created but `uv sync` never finished, `tests/fixtures/` was empty and `web/`
was an empty directory. All Python source survived intact.

**Built / recovered:**
- Environment resynced (`uv sync --extra dev`); fixtures regenerated:
  520 laps, 520 feature rows, 5 exclusion-ledger rows for `2025_ESP_FP2`.
- All 5 schema/contract tests pass (`make test`).
- All 6 fixture-backed API endpoints return 200 (health, deg-curves,
  decompose, sandbagging, validation, replay).
- Added missing `src/cleanroom/series/fe.yaml` (F76 stub).
- **Built the entire `web/` dashboard from scratch** — Next.js 15 + React 19,
  no chart library (hand-rolled SVG), no CSS framework. Six screens per
  SPEC §8 Phase 7 build order: deconfounding waterfall, degradation explorer
  (naive-vs-clean toggle), sandbagging leaderboard (dumbbell), confound
  sensitivity (live client-side OLS refit vs fuel coefficient), validation
  scoreboard (table + reliability diagram + ablation + exclusion ledger),
  live replay (posterior convergence with scrub/play). Dark pitwall theme;
  compound palette CVD-validated (#d95926/#3987e5/#199e70 — F1's
  red/yellow/white convention fails colorblind-safety checks, identity
  carried by legend + direct labels instead). Every chart has tooltips and a
  table view; every screen carries a SYNTHETIC FIXTURES badge until
  `results/frozen_v1.json` exists. `npm run build` clean, 9/9 static pages.

**What broke:**
- Waterfall bars rendered off-plot (double-subtracted bar height in the
  y-mapping) — caught by screenshot review, fixed.
- The fixture session has no HARD laps (stint plan is M/S/S), so client-side
  refits silently produced slope-0 "ghost" fits for hard → fake +0.000 bar
  and a false "ordering inverted" verdict. Fixed: only compounds present in
  the data are fitted/drawn, absence is stated in the UI (rule 6: fail
  loudly). Compound ranking now uses fresh-tyre pace (intercept), not pace
  at an arbitrary age.
- Port 3000 is occupied by an unrelated project's dev server; CLEANROOM
  serves on 3100 locally.

**Not done yet (Phase 0 gate item):** `make harvest` has not been started —
it needs its multi-day run kicked off next session. Everything else in the
Phase 0 gate (schemas frozen, fixtures generated, both apps render) is met.

**Next:** start the harvest, then Phase 1 (lap gate + exclusion ledger +
broken baselines).

---
## 2026-08-25 — v2: decision layer (fixtures) + UI consolidation

**Context:** two review documents arrived (`docs/ADDITIONS.md`, `docs/UI.md`,
imported from the user's research). They add F101–F107, cut F68/F75/F54/F83,
and consolidate the frontend from 6 screens to **4 screens + 1 drawer +
story mode**. CLAUDE.md and FEATURES.md updated (Part I addendum).

**Built:**
- `src/cleanroom/decision/voi.py` — F101 analytic VOI update
  (`Var_after = (1/Var_before + n/σ_resid²)⁻¹`), F102 knowledge gaps,
  F104 sufficiency thresholds, F105 health formula. 10 new tests in
  `tests/test_decision.py`, including a guard on the ADDITIONS.md worked
  example (±0.061 → ±0.037 at 8 laps, σ_resid 0.13).
- Two new frozen contracts in `schemas.py` (`SessionMeta`, `Decision`) with
  fixture payloads (`session_meta.json`, `decision.json`) generated through
  the tested decision module, plus 2 contract tests. 17/17 pass.
- API: `/api/session-meta/{id}`, `/api/next-run/{id}`; CORS now allows 3100.
- **Frontend rebuilt to docs/UI.md**: top nav (Session · Deconfound · Curves
  · Next Run), validation drawer ("How do we know?"), Story Mode (6 steps,
  6 s holds, auto-drags the fuel slider, opens the drawer). Old routes
  (degradation/sandbagging/sensitivity/validation/replay) removed; sandbagging
  lives on `/browse`, live replay is a toggle on Curves. New visual tokens per
  UI.md (#0A0A0B bg, #E10600 accent); compound palette kept CVD-validated.
  System font stack kept (airplane-mode checklist) instead of webfont Inter.
  `npm run build` clean, 8/8 static pages.

**Numbers (fixture):** health 69.9 · sufficiency SOFT AMBER 216 laps ±0.021,
MEDIUM GREEN 90 ±0.014, HARD RED 0 ±0.061 (prior) · top recommendation
HARD × 12 (−48% uncertainty, one-stop 48%→76% EVSI placeholder until F65).

**What broke / notes:**
- The fixture posterior's HARD block is a prior echo with a narrow CI; using
  it for sufficiency would have shown HARD as GREEN with zero laps. Fixed:
  `compound_sigma_s_per_lap` returns the prior width when a compound has no
  clean laps — which is also what makes the RED demo honest.
- The fixture's M/S/S stint plan means the soft cliff (E≈18) is never
  reached in-session; the cliff marker code exists but draws nothing until
  a session with longer soft stints arrives. Verified intentional.
- Screenshot-reviewed all four screens, drawer, and a full Story Mode run
  in Chrome at 1556×784. Pre-existing ruff style findings (dict() literals,
  UP017) left untouched — none introduced by this session's categories.

**Next:** start `make harvest` (still the Phase 0 gate item), then Phase 1.
When real sessions exist, assign the three pending presets and replace the
EVSI placeholder with F65 output.

---
## 2026-08-26 — Live Simulation, fuel-load centrepiece, driver comparison

**What was built:**

- **Research base (`docs/RESEARCH.md`)**: three independent literature sweeps
  (tyre science · fuel/traffic/strategy · video-CV/telemetry feasibility)
  synthesised into 11 sections; every claim labelled MEASURED / MODEL /
  ASSUMPTION with URLs. Key anchors: TUM race-simulation fitted parameters
  (fuel 0.027–0.034 s/kg per circuit, t_duel 0.3 s, per-compound deg),
  published deg envelope 0.02–0.17 s/lap, Barcelona pit loss 23.8 s
  (measured), Heilmeier SC/VSC stats, FIA dirty-air CFD (−47%/−18% downforce
  at 10 m, 2021/2022), and the honest gaps: no public s/°C track-temp
  coefficient, no measured s/lap dirty-air cost, tyre wear/fuel not
  optically recoverable from video.
- **Screen 5 — Live Sim (`/sim`)**: ingest via demo race, CSV/JSON paste or
  upload (row-numbered rejection), or race video (user-marked lap crossings
  at up to 4×; limitations panel per RESEARCH §9). Engine
  (`web/src/lib/sim/engine.ts`): online Bayesian regression (Kalman form)
  over the Heilmeier additive decomposition; priors in
  `lib/sim/constants.ts`, all cited. Live outputs per lap: quotable
  attribution sentence, signed component bars ±1σ with HIGH/MED/LOW +
  PRIOR-DOMINATED flags, one-step-ahead pace prediction with band, tyre
  wear vs measured stint norms, pit window + P(optimal ≤ 3 laps) from
  seeded posterior draws. Pit/VSC/event laps excluded with stated reasons.
- **Demo race fixture** (`scripts/generate_race_fixture.py` +
  `tests/test_race_fixture.py`, 6 tests): 66-lap synthetic Barcelona race,
  per-lap ground truth stored, every constant inside a published band. The
  recovery test proved plain OLS CANNOT separate fuel from deg (exact
  collinearity with one car + steady burn — the project's thesis in
  miniature) → engine + test use the informative fuel prior instead, and
  the UI labels the coefficient PRIOR.
- **Fuel-load planner (Screen 2 centrepiece)**: `lib/runplan.ts` shared
  store + `FuelPlanner.tsx`. One slider (10–110 kg) drives pace (fitted
  0.032 s/kg), tyre-energy multiplier (mass scaling, RESEARCH §3), fuel-
  limited run length, soft-cliff lap, and the F101 VOI recommendation with
  per-lap information scaled by the energy ratio². Screen 4 reads the same
  store (recommendation + consequence line + fuel note). Story Mode gained
  auto-drag (fuel) and auto-run (sim) steps.
- **Screen 4 consequence line**: "Without this run, N% chance of choosing
  the wrong pit strategy" — N = min(p, 1−p) from the EVSI anchors, live.
- **Screen 3 driver comparison**: third view toggle; two drivers, same
  compound, fuel-corrected OLS: deg rate, drop-off, consistency, laps-per-
  second yardstick; refuses <6 clean laps; single-session caveat stated.

**Numbers:** engine on demo race — deg HARD 0.044±0.010 (truth 0.038),
decomposition identity exact (components+residual ≡ Δ), pit call converges
pit-L44 → stay-out as posterior tightens, 1σ coverage 0.76. Fuel coupling:
12 kg → HARD×3 (−22%, one-stop 61%) ··· 110 kg → HARD×12 (−51%, 76%).
23/23 pytest · `npm run build` clean, 9/9 pages · zero console errors.

**What broke:**
- First fixture draft was unlearnable: track temp collinear with lap
  (and thus fuel/age). Caught by the recovery test; fixed with a
  non-monotone cloud-band temp profile.
- Decomposition identity initially off by ~0.2 s (reference residual used a
  stale posterior); fixed by recomputing both residuals under the current μ.
- Strategy P(pit ≤ 3 laps) counted "stay to the flag" as a stop at race end
  (100% at lap 64); fixed.

**Next:** real FastF1 race data through the sim ingest once the harvest
runs; replace the wear-vs-typical-stint yardstick with the fitted cliff
when a session shows one; full-covariance posterior draws in the strategy
sampler (diagonal approximation noted in-code).

---
