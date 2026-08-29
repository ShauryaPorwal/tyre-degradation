# CLEANROOM — Feature Register & A-to-Z Implementation Roadmap

Companion document to `CLEANROOM_Project_Spec.pdf`
Every feature. Where the data comes from. How to build it. How to know it works.

---

## How to read this document

Every feature has an ID (`F##`), a **source** (exactly where the data comes from), a **method** (how it's computed), a **phase** (when to build it), and an **exit test** (how you know it works).

**Priority codes:**

| Code | Meaning | Rule |
|---|---|---|
| **P0** | Core. Project fails without it. | Must ship. |
| **P1** | Differentiator. This is why you win. | Ship unless the schedule collapses. |
| **P2** | Depth. Impresses technical judges. | Ship if on schedule. |
| **P3** | Polish / scale story. | Cut first if behind. |

Total: 84 features across 11 modules. **P0 + P1 = 47 features = the minimum winning build.**

---

# PART A — FEATURE REGISTER

## Module 1 — Ingest & Data Layer

| ID | Feature | Source | Method | Pri | Phase |
|---|---|---|---|---|---|
| F01 | FastF1 session harvester | FastF1 `get_session(year, rnd, sess)` | Resumable loop, per-session try/except, failure ledger. `Cache.enable_cache()` **before** any other call. | P0 | 0 |
| F02 | Lap-level extractor | `session.laps` | LapTime, Sector1/2/3Time, SpeedI1/I2/FL/ST, Compound, TyreLife, FreshTyre, Stint, PitInTime, PitOutTime, TrackStatus, IsAccurate, LapStartTime | P0 | 0 |
| F03 | Car telemetry extractor | `lap.get_car_data().add_distance()` | Speed, Throttle, Brake, nGear, RPM, DRS, Time, Distance | P0 | 0 |
| F04 | Position telemetry extractor | `lap.get_pos_data()` | X, Y, Z. Origin is arbitrary — fine, curvature is translation-invariant. | P0 | 0 |
| F05 | Weather joiner | `session.weather_data` | AirTemp, TrackTemp, Humidity, Pressure, Rainfall, WindSpeed/Direction. Joined to laps on nearest timestamp. | P0 | 0 |
| F06 | Race-control / flag parser | `session.race_control_messages` | SC, VSC, yellow, red, chequered → per-lap track status flags | P0 | 1 |
| F07 | Circuit geometry loader | `session.get_circuit_info()` | Corner numbers, positions, distances. Validates curvature detection (F19). | P0 | 3 |
| F08 | OpenF1 client | `api.openf1.org/v1/` | Free, no auth, 2023+. Rate limit 3 req/s, 30 req/min — implement backoff. `?csv=true` for bulk. | P1 | 0 |
| F09 | OpenF1 cross-validator | `/laps`, `/stints`, `/weather` | Reconcile FastF1 vs OpenF1 on overlapping fields. Discrepancies logged, not silently resolved. | P2 | 2 |
| F10 | Mini-sector extractor | OpenF1 `/laps` `segments_sector_1/2/3` | 8 mini-sectors per sector. **Not available during races** — practice/quali only. Feeds F31. | P2 | 3 |
| F11 | Interval / gap ingest | OpenF1 `/intervals` | `gap_to_leader`, `interval`, ~4s cadence. Race-only. Secondary traffic signal. | P2 | 2 |
| F12 | **Pirelli preview parser** | `press.pirelli.com` race previews | Scrape per-race: nominated compounds (C1–C5), lateral/longitudinal tyre demand ratings, narrative degradation notes ("graining resistance", "thermal degradation prompted two stops"). **This is your external ground truth.** | P1 | 3 |
| F13 | Compound allocation table | Pirelli press releases | Map SOFT/MEDIUM/HARD → actual C1–C5 per weekend. Without this, "soft" means different rubber at different races. Almost nobody does this. | P1 | 1 |
| F14 | Season rules config | `src/cleanroom/series/*.yaml` | Min car weight, max fuel, compound range, session structure. 2026: C1–C5 only, C6 dropped, fronts 25mm narrower, rears 30mm narrower. | P1 | 0 |
| F15 | Immutable raw store + manifest | local `data/raw/` | Content-hash manifest. Nothing in `raw/` is ever modified. | P1 | 0 |
| F16 | Parquet warehouse + pandera schemas | local | Enforce every contract at write time. Fail loudly. | P0 | 0 |
| F17 | Synthetic fixture generator | — | Matches every schema. **Lets frontend + API be built before data exists.** Buys you 3 days. | P0 | 0 |

---

## Module 2 — Cleaning & Confounder Inputs

| ID | Feature | Source | Method | Pri | Phase |
|---|---|---|---|---|---|
| F18 | In/out lap filter | F02 | `PitInTime` / `PitOutTime` non-null | P0 | 1 |
| F19 | Neutralisation filter | F06 | Drop laps under SC/VSC/yellow/red | P0 | 1 |
| F20 | Accuracy filter | F02 | `IsAccurate == False` | P0 | 1 |
| F21 | Outlier filter | F02 | Outside 107% of driver's stint median | P0 | 1 |
| F22 | **Traffic exposure** | FastF1 `Telemetry.add_driver_ahead()` | `DistanceToDriverAhead` in metres → fraction of lap within dirty-air threshold. **Apply per lap and concatenate** — integration error accumulates otherwise. Pit-lane cars are not excluded; filter them. | P0 | 1 |
| F23 | **Exclusion ledger** | — | Every filter logs rows removed + reason to `data/interim/exclusions.parquet`. Never drop silently. Goes in the deck as evidence of rigour. | P0 | 1 |
| F24 | Out-lap / warm-up handling | F02, F03 | First lap of a stint is a warm-up lap, not a degradation observation. Either exclude or model explicitly as a separate tyre-prep term. | P1 | 2 |
| F25 | Wet/mixed session detector | F05 `Rainfall` + lap-time variance | Route wet sessions to `INSUFFICIENT_DATA`. Do not guess. Declared limitation. | P1 | 2 |
| F26 | Red-flag session splitter | F06 | Track evolution resets partially after a red flag. Split the session clock. | P2 | 3 |

---

## Module 3 — Physics Estimators (the technical contribution)

| ID | Feature | Source | Method | Pri | Phase |
|---|---|---|---|---|---|
| F27 | **Reference-segment picker** | F03 | Per circuit, from fastest lap: longest continuous run of `Throttle==100 AND Brake==0`. Record the `Distance` window. Cached per circuit. | P0 | 2 |
| F28 | **Fuel mass estimator** | F03, F27 | `m·dv/dt = F(v)` → at fixed reference speed `v*`, `a ∝ 1/m`. Robust-regress `1/a(v*)` vs lap within stint. Outputs `m_hat_kg` **and** `m_hat_se`. | P0 | 2 |
| F29 | Absolute mass anchoring | F14 + regulation | Three constraints: end-of-race fuel ≈ 1–2 kg (sample rule); total ≥ season min weight; burn rate in [2.2, 3.2] kg/lap by circuit class. | P0 | 2 |
| F30 | Engine-mode filter | F02 `SpeedST` | Restrict mass regression to laps whose speed-trap speed sits in a narrow band. Controls for `F_traction(v)` shifts. | P1 | 2 |
| F31 | Burn-rate validator | Published per-circuit consumption | Must land in range for ≥15/20 circuits **without being fitted to it**. This is the proof the estimator is real. | P0 | 2 |
| F32 | **Curvature computation** | F04 | Spline-fit X,Y → second derivative → `kappa(s)`. Validate against F07 corner positions. | P0 | 3 |
| F33 | **Tyre energy integrator** | F03, F32, F05 | `a_lat = v²·kappa`, `a_lon = dv/dt`, `E_lap = ∫(|a_lat|+|a_lon|)·v·dt`, thermally weighted. Cumulative `E_cum` per tyre set. | P0 | 3 |
| F34 | Front/rear energy split | F32, F03 | Braking + slow-corner load → front-biased. Traction zones + high-speed corners → rear-biased. Enables axle-limitation inference (F45). | P2 | 3 |
| F35 | Tyre-energy validator | F12 Pirelli demand ratings | Rank circuits by mean `E_lap`; compare to Pirelli's published lateral/longitudinal demand. Barcelona/Suzuka high, Monza low. | P1 | 3 |
| F36 | **Lift-and-coast detector** | F03, F07 | Throttle < ~95% before the braking point, per corner, per lap. Count + magnitude → `lac_index`. | P1 | 3 |
| F37 | Push-residual signal | F28 | Leftover from mass fit after mass is explained. Second push proxy. Turns F28's known contaminant into a feature. | P1 | 3 |
| F38 | Effective grip proxy | F03 | Min corner speed per corner, normalised by session-best. Direct grip measure independent of straight-line power. | P2 | 3 |

---

## Module 4 — Modelling

| ID | Feature | Source | Method | Pri | Phase |
|---|---|---|---|---|---|
| F39 | Baseline A — naive | F02 | `lap_time ~ tyre_age` per compound. **Must break.** Find negative slopes. | P0 | 1 |
| F40 | Baseline B — industry standard | F02 | Fixed 0.03 s/kg, assumed 110 kg linear decay. Exactly what the published paper does. | P0 | 1 |
| F41 | Baseline C — clamped SOTA | F02 | Fuel added back, wear clamped to [0, 0.22] s/lap. The Pitwall approach. | P0 | 1 |
| F42 | Baseline D — ARIMA | F02 | Time-series comparator. | P2 | 5 |
| F43 | Baseline E — gradient boosting | all features | LightGBM on identical features. Honest ML challenger. **Report it even if it wins on some metric.** | P2 | 5 |
| F44 | **MixedLM fallback model** | all | `statsmodels.MixedLM` + bootstrap CIs. **Build this FIRST, Day 9 morning.** Insurance policy. | P0 | 4 |
| F45 | **Hierarchical Bayesian model** | all | NumPyro. Partial pooling by team/driver, compound-specific energy slopes, shared monotone track-evo spline, latent push, skew-t noise. | P1 | 4 |
| F46 | Skew-t observation noise | — | Driver errors are asymmetric — a lap can be much slower than intended, never much faster. Gaussian mis-weights the tails. | P1 | 4 |
| F47 | Shared track-evolution latent | F02 session clock | Monotone spline shared across all 20 cars. **Identifiable because every car observes the same track simultaneously.** The strongest sentence in your pitch. | P0 | 4 |
| F48 | **Cliff mining with evidence gate** | F33 | Hinge fit on `E_cum`. Accept a knot only if SSE reduction exceeds threshold AND minimum lap count is met. Mined, never assumed. | P1 | 4 |
| F49 | **Degradation mechanism classifier** | F02, F05, F34 | Classify the residual signature: monotone linear → chemical/abrasion; knee with no recovery → thermal cliff or blistering; bump then partial recovery after a cooling lap → graining. Graining correlates with **low** track temp and front-load circuits; blistering with high-speed corner circuits. **Nobody in public tooling does this.** | P1 | 4 |
| F50 | Grip-recovery detector | F02, F36 | Thermal degradation partially recovers when the tyre is cooled (lifting, off-line running); wear does not. Detect recovery after a low-push lap → discriminates mechanism. | P2 | 4 |
| F51 | Compound-ladder validator | F13 | Fitted base paces must produce a monotone C1 > C2 > ... > C5 ladder with plausible deltas. Pirelli explicitly targets consistent lap-time deltas between compounds. **The reference SOTA inverts this ordering in 18 of 24 races.** | P1 | 4 |
| F52 | Confidence gate | — | Below N clean laps or above a posterior-width threshold → emit `INSUFFICIENT_DATA`. Refusing to answer is a feature, not a limitation. | P1 | 4 |
| F53 | Driver tyre-management index | F45 posteriors | Per-driver random effect on the slope, not just the intercept. Some drivers genuinely degrade tyres slower. | P2 | 4 |
| F54 | Cross-circuit compound priors | F45 | Partial pooling across circuits so a low-data session borrows strength. Enables early-FP1 predictions. | P2 | 5 |

---

## Module 5 — Validation (the module that wins)

| ID | Feature | Source | Method | Pri | Phase |
|---|---|---|---|---|---|
| F55 | **Practice → race backtest** | F02 | Train on FP1+FP2+FP3 only. Predict race stint pace. Held-out races. MAE + RMSE in s/lap. **The headline number.** | P0 | 5 |
| F56 | Baseline comparison table | F39–F43 | Six-row table, four metrics. Slide 5 of the pitch. | P0 | 5 |
| F57 | **Reliability diagram + ECE** | F45 | Bin predicted intervals, check empirical coverage. Do the 90% intervals cover 90%? Almost nobody does this at hackathons. | P1 | 5 |
| F58 | **Ablation grid** | all | Remove each correction one at a time, measure MAE degradation. Proves every component earns its place. | P1 | 5 |
| F59 | **Leakage audit** | F05 | Deliberately include track/air temp; show suspiciously perfect accuracy; explain it's a per-weekend fingerprint — the model learns *which race this is*. Document trap and fix. | P1 | 5 |
| F60 | Infeasible-stint rate | F02 history | % of recommendations exceeding the longest stint anyone actually completed on that compound at that circuit. Reference system: **90.5% unconstrained.** | P1 | 5 |
| F61 | Compound-order accuracy | F51 | % of sessions where the fitted ordering is physically correct. Beat the published SOTA here. | P1 | 5 |
| F62 | Pirelli narrative cross-check | F12 | Where Pirelli's preview says "thermal degradation prompted two stops", does F49 classify it as thermal? Qualitative external validation. | P2 | 5 |
| F63 | Frozen results artifact | — | `results/frozen_v1.json`, write-once with an overwrite guard. Never regenerate under pressure. | P0 | 5 |
| F64 | Reproducibility harness | — | `make all` from a clean clone reproduces every number. Worth real points in a repo-judged competition. | P1 | 8 |

---

## Module 6 — Decision Layer

| ID | Feature | Source | Method | Pri | Phase |
|---|---|---|---|---|---|
| F65 | Monte Carlo stint simulator | F45 posteriors | Sample from the degradation posterior, not point estimates. Outputs distributions. | P1 | 6 |
| F66 | Feasibility caps | F02 history | No recommended stint exceeds the demonstrated maximum for that compound/circuit. Without it, the optimiser recommends impossible 50-lap soft stints. | P1 | 6 |
| F67 | Optimal stop-window finder | F65 | Stop laps with credible intervals, not a single number. | P1 | 6 |
| F68 | Undercut/overcut evaluator | F65, F11 | Box-now vs +1 vs +2 vs stay, under **common random numbers** so the delta reflects strategy, not sampling noise. | P2 | 6 |
| F69 | Counterfactual query | F45 | "Same stint on mediums instead of hards?" Answered from clean curves, with intervals. | P1 | 6 |
| F70 | Circuit atlas | F45 across seasons | Precomputed degradation priors, all circuits × compounds. Turns a model into a shippable artifact. | P2 | 6 |
| F71 | **Sandbagging index** | F28, F36, F45 | True pace vs timing-sheet pace after FP2, with CIs. Journalists write this story by hand every weekend. You automate it. | P1 | 6 |

---

## Module 7 — Serving

| ID | Feature | Source | Method | Pri | Phase |
|---|---|---|---|---|---|
| F72 | FastAPI service | — | Endpoints per spec §7.4. Built against fixtures from Day 1. | P1 | 0 |
| F73 | Job queue + progress | — | Model fits take time. Async job + status polling. | P2 | 7 |
| F74 | **Live replay endpoint** | F45 | `GET /api/replay/{id}?lap=N` — posterior as of lap N. Powers the best demo moment. | P1 | 7 |
| F75 | Incremental refit (Kalman) | F45 | Two-state filter over pace offset + residual slope. Inflate measurement noise in dirty air; exclude out-laps; reset slope variance on compound change. | P2 | 7 |
| F76 | Series config layer | F14 | F1 / F2 / F3 / FE YAML. Ten minutes of work, large in the pitch. | P2 | 7 |

---

## Module 8 — Frontend

| ID | Feature | Source | Method | Pri | Phase |
|---|---|---|---|---|---|
| F77 | **Deconfounding Waterfall** | F45 decomposition | Apparent gap → fuel / track-evo / traffic / true deficit. **The money shot. Build this first.** | P0 | 7 |
| F78 | Degradation explorer | F45 | Compound curves with credible bands. Naive-vs-clean toggle. | P0 | 7 |
| F79 | **Confound sensitivity slider** | F45 | Drag the fuel coefficient live, watch compound ranking invert on stage. | P1 | 7 |
| F80 | Sandbagging leaderboard | F71 | True pace vs timing sheet, with intervals. | P1 | 7 |
| F81 | Validation scoreboard | F63 | Frozen numbers + reliability diagram. | P0 | 7 |
| F82 | **Live replay view** | F74 | Stream FP2 lap-by-lap; watch the posterior converge and bands narrow. | P1 | 7 |
| F83 | Mechanism panel | F49 | Which degradation mechanism is active, with the evidence. | P2 | 7 |
| F84 | Strategy panel | F65–F69 | Stop windows, outcome distributions, counterfactuals. | P2 | 7 |

---

## Module 9 — Intelligence Layer

| ID | Feature | Source | Method | Pri | Phase |
|---|---|---|---|---|---|
| F85 | Typed claim schema | F45 | Fixed JSON schema the LLM must emit against. No free-text numbers, ever. | P1 | 7 |
| F86 | **Claim verifier** | F85 | Every numeric claim checked against model state before rendering. Unverified → template fallback. The SOTA found generators fabricate drivers, gaps, and compounds precisely when the grounding state is sparse. You are immune by construction. | P1 | 7 |
| F87 | Race-engineer briefing | F85, F86 | "Medium showing 0.09 s/lap on energy clock, cliff mined at lap 22 ±3, confidence high." | P1 | 7 |
| F88 | Anomaly narrator | F49, F52 | Flags the interesting thing without being asked. | P3 | 7 |

---

## Module 10 — Ops & Quality

| ID | Feature | Source | Method | Pri | Phase |
|---|---|---|---|---|---|
| F89 | Test suite | — | Every function producing a final number has a test. Synthetic fixtures where truth is known by construction. | P1 | all |
| F90 | CI pipeline | — | Lint, test, schema-validate on push. | P2 | 8 |
| F91 | Seeded determinism | — | Module-level seeds. Same input → same output. | P1 | all |
| F92 | Offline demo mode | — | Everything pre-cached. Zero network calls on stage. **Non-negotiable.** | P0 | 8 |
| F93 | Structured logging | — | Every stage logs row counts in/out. | P2 | all |

---

## Module 11 — Judge Pack

| ID | Feature | Pri | Phase |
|---|---|---|---|
| F94 | README with one-command reproduction | P0 | 8 |
| F95 | Architecture diagram | P1 | 8 |
| F96 | Technical report, 6–8 pages, **with a limitations section** | P1 | 8 |
| F97 | 3-minute demo video | P0 | 7 |
| F98 | 5-minute live demo script | P0 | 8 |
| F99 | Q&A crib sheet — 5 questions, 1-sentence answers | P1 | 8 |
| F100 | Fallback video if live demo dies | P0 | 7 |

---

# PART B — DATA SOURCE MAP

Exactly where every input comes from.

| What you need | Source | Field / endpoint | Free? |
|---|---|---|---|
| Lap times, sectors | FastF1 | `session.laps` | Yes |
| Tyre compound, age, stint | FastF1 | `Compound`, `TyreLife`, `Stint`, `FreshTyre` | Yes |
| Speed / throttle / brake / gear / RPM | FastF1 | `lap.get_car_data()` | Yes |
| Car position X,Y,Z | FastF1 | `lap.get_pos_data()` | Yes |
| Distance along lap | FastF1 | `.add_distance()` | Yes |
| Distance to car ahead | FastF1 | `.add_driver_ahead()` → `DistanceToDriverAhead` | Yes |
| Track & air temperature | FastF1 | `session.weather_data` | Yes |
| Corner positions | FastF1 | `session.get_circuit_info()` | Yes |
| Flags, SC, VSC | FastF1 | `session.race_control_messages` | Yes |
| Same, as REST | OpenF1 | `/laps`, `/car_data`, `/location`, `/weather`, `/race_control` | Yes, 2023+ |
| Mini-sectors | OpenF1 | `/laps` → `segments_sector_*` (not in races) | Yes |
| Gaps / intervals | OpenF1 | `/intervals` (races only) | Yes |
| Pit stop durations | OpenF1 | `/pit` → `stop_duration` (2024 US GP onward) | Yes |
| Live streaming | OpenF1 | MQTT / WebSocket | **Paid** |
| Compound allocation C1–C5 | Pirelli press releases | `press.pirelli.com` | Yes, scrape |
| Circuit tyre-demand ratings | Pirelli race previews | Lateral/longitudinal demand text | Yes, scrape |
| Historical results 1950+ | Jolpica-F1 | Ergast-compatible REST | Yes |
| Bulk reference DB | F1DB | JSON / CSV / SQL dumps | Yes |
| Track maps | MultiViewer API | Linked from OpenF1 `circuit_info_url` | Yes |
| **Fuel load** | — | **Does not exist. F28 estimates it.** | — |
| **Tyre temps / pressures** | — | **Does not exist. Declared limitation.** | — |
| **Actual wear measurement** | — | **Does not exist.** | — |

---

# PART C — BUILD ORDER & DEPENDENCIES

```
F01 F02 F03 F04 F05          ingest
      │
      ├── F16 F17            schemas + fixtures ──► F72 API ──► F77-F84 frontend
      │                                              (built on fixtures from day 1)
      ▼
F18-F23  clean gate + traffic
      │
      ├──────────────┬──────────────┐
      ▼              ▼              ▼
F27 F28 F29        F32 F33        F36 F37
fuel mass        tyre energy    push level
      │              │              │
      └──────────────┴──────────────┘
                     │
                     ▼
              F44 MixedLM ◄── build this FIRST
                     │
                     ▼
              F45 Hierarchical + F46-F54
                     │
                     ▼
              F55-F64 VALIDATION ◄── the module that wins
                     │
                     ├──► F63 frozen_v1.json (write-once)
                     ▼
              F65-F71 decision layer
                     │
                     ▼
              F85-F87 LLM layer
                     │
                     ▼
              F94-F100 judge pack
```

**The critical path is:** F01 (harvest) → F18-23 (clean) → F28 (fuel) → F33 (energy) → F44/F45 (model) → F55 (backtest).

Everything else is parallel or optional. **F01 starts on Day 1 hour 1 and runs for days.**

---

# PART D — A-TO-Z IMPLEMENTATION SCHEDULE

### Day 1 — Phase 0: Foundation
Build: F01, F02, F14, F15, F16, F17, F72 (skeleton)
- Start the harvest **before writing anything else**. It runs for days.
- Freeze all schemas. Generate fixtures.
- Scaffold FastAPI + Next.js against fixtures.
**Gate:** harvest running, fixtures generated, both apps render.

### Day 2 — Cleaning
Build: F06, F18, F19, F20, F21, F22, F23
**Gate:** exclusion ledger written; contamination stats printed by reason.

### Day 3 — Baselines
Build: F13, F39, F40, F41
- Find and screenshot every session where A or B produces a **negative** slope.
**Gate:** you can demonstrate on real data that both standard methods produce physically impossible degradation. Save to `results/broken_baseline/`.

### Day 4 — Fuel estimator I
Build: F27, plus telemetry slicing and distance-grid resampling.
**Gate:** reference segment picked and cached for all circuits.

### Day 5 — Fuel estimator II
Build: F28, F30
**Gate:** per-lap `m_hat_kg` and `m_hat_se` for one full weekend.

### Day 6 — Fuel estimator III
Build: F29, F31
**Gate:** burn rate inside published range for ≥15/20 circuits, unfitted.
**Fallback:** per-circuit fitted coefficients. Still beats every public tool. **Move on regardless.**

### Day 7 — Tyre energy I
Build: F07, F32
**Gate:** curvature peaks align with `get_circuit_info()` corners.

### Day 8 — Tyre energy II + push
Build: F33, F34, F35, F36, F37, F24
**Gate:** chart of two drivers, identical tyre age, materially different `E_cum`. Every model term now has a column.

### Day 9 — Model I
Build: **F44 first (one hour)**, then start F45.
**Gate:** MixedLM produces a valid `posterior.json`. The project can now ship no matter what.

### Day 10 — Model II
Build: F45, F46, F47
**Hard checkpoint at end of day:** if NumPyro still diverges, switch to F44 permanently. Cost: one hour.
**Gate:** positive tyre slope, sensible compound ordering.

### Day 11 — Model III
Build: F48, F49, F51, F52, F53
**Gate:** cliffs mined with evidence gate; mechanism classifier labelling stints; confidence gate firing on thin sessions.

### Day 12 — Validation
Build: F42, F43, F55, F56, F57, F58, F59, F60, F61, F63
**Gate:** filled results table. **Freeze `frozen_v1.json`. Read-only from here.**

### Day 13 — Decision layer
Build: F65, F66, F67, F69, F70, F71
**Gate:** curves → stop recommendation → position delta, end to end.

### Day 14 — Frontend + serving
Build: F74, F76, F77, F78, F79, F80, F81, F82, F85, F86, F87
- Cut over from fixtures to real data. **Expect breakage — that's why the day exists.**
- Deploy. **Record the video (F97, F100).**
**Gate:** deployed URL works from a phone on a different network.

### Day 15 — Judge pack
Build: F64, F92, F94, F95, F96, F98, F99
Five timed rehearsals. **No code after 12:00.**

---

# PART E — TOOLING

| Layer | Library | Why |
|---|---|---|
| Ingest | `fastf1`, `httpx` | Primary + REST |
| Storage | `pyarrow`, `pandas` | Parquet |
| Validation | `pandera` | Schema enforcement at write time |
| Numerics | `numpy`, `scipy` | Splines, curvature, integration |
| Robust regression | `statsmodels` (RLM) | Fuel estimator — outlier resistant |
| Fallback model | `statsmodels` (MixedLM) | F44. Insurance. |
| Bayesian model | `numpyro` + `jax` | F45. Fast NUTS, real posteriors. |
| ML challenger | `lightgbm` | F43 |
| API | `fastapi`, `uvicorn` | F72 |
| Frontend | Next.js, Recharts or visx | F77–F84 |
| LLM | Claude API, JSON-schema constrained | F85–F87 |
| Testing | `pytest`, `hypothesis` | F89 |
| Orchestration | `make` | Keep it simple |

---

# PART F — ACCEPTANCE TESTS

| Module | Test | Pass condition |
|---|---|---|
| Ingest | Harvest 3 weekends, kill mid-run, resume | No duplicates, no re-downloads |
| Clean | Exclusion ledger row count | `in − out == sum(exclusions)` exactly |
| Traffic | Synthetic two-car scenario | Exposure rises as gap closes |
| Fuel | Synthetic constant-mass telemetry | Estimator returns constant mass ±2% |
| Fuel | Real data burn rate | In published range, ≥15/20 circuits |
| Energy | Monza vs Barcelona `E_lap` | Barcelona materially higher |
| Energy | Corner detection | Curvature peaks match `circuit_info` |
| Model | Tyre slope sign | Positive in ≥90% of dry sessions |
| Model | Compound ladder | Monotone in ≥80% of sessions |
| Model | Confidence gate | Fires on sessions with <N clean laps |
| Validation | Backtest determinism | Same seed → identical MAE |
| Validation | Frozen file guard | Overwrite attempt raises |
| API | Cold start on fixtures | All endpoints 200 with no real data |
| Demo | Airplane mode | Full flow completes offline |

---

# PART G — CUT LIST

If you fall behind, cut in this order. Never cut upward.

**Cut first (P3):** F88 anomaly narrator.

**Cut second (P2):** F09 cross-validator · F10 mini-sectors · F11 intervals · F26 red-flag splitter · F34 axle split · F38 grip proxy · F42 ARIMA · F43 LightGBM · F50 recovery detector · F53 driver index · F54 cross-circuit priors · F62 Pirelli narrative check · F68 undercut evaluator · F70 atlas · F73 job queue · F75 Kalman · F76 series config · F83 mechanism panel · F84 strategy panel · F90 CI · F93 logging.

**Cut third, and only in a genuine emergency (P1):** F45 hierarchical model → fall back to F44 MixedLM. F49 mechanism classifier. F82 live replay. F85–F87 LLM layer.

**Never cut (P0):** F01–F05, F16–F23, F27–F29, F31–F33, F39–F41, F44, F47, F52, F55, F56, F63, F77, F78, F81, F92, F94, F97, F98, F100.

**The P0 set alone is a complete, defensible, winning submission.** Everything above it is margin.

---

# PART H — THE FIVE THINGS THAT ACTUALLY DECIDE THIS

1. **The broken baseline chart (F39).** Day 3. Screenshot it. It opens the pitch and it's the reason anyone cares.
2. **The burn-rate validation (F31).** It's the only independent proof your novel estimator works. Without it, F28 is a claim.
3. **The backtest number (F55).** Practice-only → race pace, held out. One number the judges will remember.
4. **The reliability diagram (F57).** The difference between a model and a forecaster.
5. **The MixedLM fallback (F44).** Written Day 9 morning. It's why this project ships regardless of what breaks.

---

*Feature register v1. 100 features. 47 in the minimum winning build.*

---

# PART I — v2 ADDENDUM (F101–F107)

Approved after review of the feature-suggestion document. Full rationale,
methods, and output contracts: **`docs/ADDITIONS.md`**. UI consolidation
(4 screens + 1 drawer + story mode): **`docs/UI.md`**.

| ID | Feature | Depends on | Method (short) | Pri | Phase |
|---|---|---|---|---|---|
| F101 | Next-Best-Run recommendation (VOI) | F45 | Rank {SOFT,MEDIUM,HARD}×{5,8,12} candidate runs by expected posterior-uncertainty reduction. Analytic linear-Gaussian update `Var_after ≈ (1/Var_before + n/σ_resid²)⁻¹` for the live UI; validated once offline against a Monte Carlo refit. | P1 | 6 |
| F102 | Knowledge-Gap Detector | F101 | Per compound: posterior width, clean-lap count, and which downstream decision the width blocks. Ranked by decision impact, not width. Reuses F52 gate thresholds. | P1 | 6 |
| F103 | Expected Strategic Value (EVSI) | F101, F65 | Weight variance reduction by how much it moves P(one-stop optimal) in the stint sim. Cut first if the schedule slips. | P2 | 6 |
| F104 | Data Sufficiency Meter | F52 | Per-compound traffic light. 🟢 ≥12 clean laps AND σ<0.02 s/lap · 🟡 ≥6 AND σ<0.05 · 🔴 below → `INSUFFICIENT_DATA`, curve suppressed entirely (never greyed out). | P1 | 7 |
| F105 | Session Health Score | F23 | `100×(0.4·clean_yield + 0.3·compound_coverage + 0.2·(1−traffic_rate) + 0.1·completeness)`. Components on hover only. | P1 | 7 |
| F106 | Story Mode | all screens | State machine + narration array; auto-advances the four screens with 6 s holds. Live-demo insurance. | P1 | 7 |
| F107 | Curated session presets | F105 | Four named sessions replace the dropdown: Broken Baseline, Clean Case, Hard Case (gate fires), Validated Case. Full browse behind a secondary link. | P0 | 7 |

**Cut to fund the additions (ADDITIONS.md §9):** F68 undercut evaluator ·
F75 Kalman refit · F54 cross-circuit priors · F83 mechanism panel *as a
screen* (F49 stays; the mechanism becomes a tag on the degradation curve).

**Method corrections (ADDITIONS.md §11):** fuel is estimated from telemetry
(F27–F31), never the 0.03 s/kg constant (that is Baseline B / F40); track
evolution is estimated inside the joint model (F47), never subtracted in
pre-processing.

*v2 addendum. 107 features total.*
