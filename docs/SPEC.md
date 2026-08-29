# CLEANROOM

**Isolating true tyre degradation from confounded practice-session data**

Project specification and 15-day solo build plan
Hackathon theme: AI Motorsport Intelligence
Series: Formula 1 · Solo build · Claude Code

---

## 0. How to use this document

This document is the single source of truth for the build. It is written to be read by an AI coding agent as much as by a human.

**Setup instructions:**

1. Create the repo, then save the markdown version of this document as `docs/SPEC.md`.
2. Create a `CLAUDE.md` at the repo root containing the "Project rules" block in section 0.2 below, plus a pointer to `docs/SPEC.md`.
3. Work phase by phase. Do not skip ahead. Each phase has an explicit exit gate.
4. After each phase, update `docs/PROGRESS.md` with what was built, what the numbers were, and what broke.

**Do not** paste this entire document into every Claude Code prompt. Reference it: *"Read docs/SPEC.md section 6, then implement Phase 2."*

### 0.1 One-paragraph summary of the project

Formula 1 practice sessions are the primary source of tyre degradation estimates, but practice lap times are contaminated by four confounders — fuel load, track evolution, traffic, and driver push level — none of which are published. Every public tool and every published paper handles this by *assuming* a fuel correction constant and clamping the result. CLEANROOM instead *estimates* the confounders from public telemetry: fuel mass from longitudinal acceleration, tyre wear clock from accumulated tyre energy rather than lap count, and track evolution as a latent shared across all cars. The result is a clean, uncertainty-quantified degradation curve, validated by predicting race-day pace from practice data alone.

### 0.2 Project rules (put this in CLAUDE.md)

```
PROJECT RULES

1. Never invent data. If a value is not available from FastF1, OpenF1, or
   a file in data/, it must be estimated by a documented method or
   flagged as missing. No hardcoded magic constants without a source
   comment.

2. Every physical constant must carry a source comment.
   Example: # 0.03 s/kg fuel effect: industry rule of thumb, we FIT this
   per circuit rather than assume it.

3. All randomness is seeded. Set seeds at module level.

4. Any function that produces a number used in the final results must
   have a test in tests/.

5. Results are frozen. Once results/frozen_v1.json exists, it is
   read-only. Regenerating it requires an explicit instruction.

6. Fail loudly on data problems. Never silently drop rows. Every filter
   logs how many rows it removed and why, into the exclusion ledger.

7. Prefer boring, inspectable code. This project will be judged partly
   on whether a stranger can verify it. No clever one-liners.

8. Cache aggressively. FastF1 downloads are the slowest thing in this
   project. Never re-download.

9. When uncertain between two modelling choices, implement both and
   compare on held-out data. Report the loser too.

10. Do not modify anything in data/raw/. It is immutable.
```

---

## 1. The brief and why this topic

### 1.1 Hackathon brief (verbatim)

> **THEME: AI Motorsport Intelligence**
> **Overview:** Isolating true tyre wear rates from confounding practice variables like fuel weight, traffic, and track evolution.
> **The Goal:** Create a predictive model that strips out external noise from practice sessions to generate clean tyre performance degradation curves. Includes post-race validation tools to compare predicted wear against actual race-day pace.

### 1.2 Why this over the other two options

Two other briefs were offered (energy deployment optimisation; track-limits computer vision). This one was chosen because:

- **It is the only one with genuine ground truth.** You can train on practice data and validate against what actually happened on Sunday. The other two have no falsifiable output.
- **The data is complete and free.** No labelling, no video pipeline, no camera calibration.
- **The competing brief on track limits is already solved in production.** The FIA ships Track Limits Computer Vision inside RaceWatch; novelty there is near zero.
- **Fewest competing teams will choose it,** because it looks like a charting exercise. It isn't.

The risk of this brief is that it *looks* boring. The entire product design below is aimed at neutralising that.

---

## 2. Problem statement

Observed practice lap time decomposes as:

```
observed = base_pace(car, driver)
         + fuel_effect(mass)
         + tyre_degradation(wear_state)
         + track_evolution(session_time)
         + traffic_penalty(proximity)
         + push_level(driver intent)
         + noise
```

Only `tyre_degradation` is wanted. The other five are nuisance terms. Three of them are large enough to swamp the signal:

- **Fuel:** a full load is roughly 110 kg, worth roughly 0.03 s/lap/kg — about 3.3 seconds per lap between full and empty. Tyre degradation is typically 0.05–0.15 s/lap.
- **Track evolution:** rubber laid down across a session improves grip continuously, in the same direction as fuel burn.
- **Push level:** teams deliberately obscure their pace. This is called sandbagging and it is standard practice.

Because fuel burn and track evolution both make the car *faster* as the session progresses, and tyre degradation makes it *slower*, the naive fit frequently produces a **negative** degradation slope — a model in which tyres improve indefinitely.

### 2.1 The failure mode, in the literature's own words

From *Pitwall: Faithful Natural-Language Race-Strategy Briefings from a Calibrated Real-Time Monte Carlo Engine* (arXiv:2607.06495, July 2026), a production system validated across seven F1 seasons:

> "raw fitted slopes conflate tyre wear with fuel burn-off and track evolution; because fuel effect and track grip improve lap time as the race progresses, the blended slope is frequently negative — a model in which tyres improve forever, which a plan optimizer will exploit with impossible 50-lap soft stints. We therefore decompose the slope by adding back a calibrated per-lap fuel effect and clamping the tyre-only wear component to a physically plausible band [0, 0.22] s/lap."

That is a clamp, not a solution. The measurable damage in their own results:

- Without feasibility constraints, their optimiser recommends a stint longer than any real car achieved in **90.5% of races**.
- In **18 of 24 races in the 2025 season**, the soft compound was not the fastest fitted compound — with spreads up to 3.1 s/lap. The compound ordering inverts.

Their stated limitations include: no car telemetry (degradation is age-based), fuel mass is approximate (a calibrated constant, not a measured load), and tyre thermals only partially modelled.

**Critically, they fit degradation on race laps only.** The practice-session problem — this brief — is untouched.

### 2.2 A published paper assumes the confounder

From *A State-Space Approach to Modeling Tire Degradation in Formula 1 Racing* (arXiv:2512.00640):

> "we include the amount of fuel in kilograms for the driver at each lap as a covariate in our model. This data did not come from the FastF1 Python API, and is assumed to start at 110 kilograms on lap 1 and decay linearly to zero by the last lap."

### 2.3 The practitioner consensus

From a public F1 analytics guide:

> "You can't fully fuel-correct from outside the team. Nobody publishes the fuel load each car was carrying."

**This is the wall. Going through it is the project.**

---

## 3. Competitive landscape

| Tier | Systems | What they do | Limitation |
|---|---|---|---|
| Team-grade | Catapult RaceWatch (7 F1 teams + FIA), team-internal tools | Full telemetry, proprietary deg models, live strategy | Closed, F1-only, no public methodology or validation |
| Academic | TUM race-simulation (Heilmeier), Pitwall, state-space Bayesian models, tyre-energy LSTM | Race simulation, Monte Carlo, calibrated probabilities | Fuel assumed or clamped; degradation fitted on race laps; the one tyre-energy paper used private Mercedes data |
| Public/fan | TracingInsights, f1pace, PodiumProphets, pitwall-lab, dozens of GitHub notebooks | Fuel correction with a fixed 0.03 s/kg and a guessed load | The correction is an assumption, not an estimate |

**Nobody in any tier estimates fuel load from public telemetry.**

---

## 4. Method

Three identification strategies. These are the technical contribution.

### 4.1 Fuel mass from longitudinal dynamics

On a straight, under full throttle:

```
m · dv/dt = F_traction(v) − F_drag(v) − F_rolling
```

For the **same car, same power mode, same speed**, the right-hand side is approximately repeatable lap to lap. Therefore, at a fixed reference speed `v*` inside a fixed distance window:

```
a_lap(v*) ∝ 1 / m_lap

m_lap / m_ref = a_ref(v*) / a_lap(v*)
```

**Algorithm:**

1. Per circuit, identify the reference segment once, from the session's fastest lap: the longest continuous run where `Throttle == 100 AND Brake == 0`. Record the `Distance` window.
2. For every lap in the session, slice telemetry to that distance window. Resample to a fixed distance grid.
3. Compute `a = dv/dt` along the window. Fit a local model `a(v)`. Evaluate at 2–3 fixed reference speeds inside the window's speed range.
4. For each stint, robust-regress `1/a(v*)` against lap number. Slope gives the mass decline rate; this is the fuel burn rate.
5. **Anchor the absolute scale** with three constraints:
   - End-of-race fuel is approximately 1–2 kg (regulation requires a 1 L sample to remain).
   - Total mass must be at least the season's minimum car weight plus driver.
   - Fitted burn rate must be physically plausible: roughly 2.2–2.4 kg/lap at slow circuits (Monaco class), 3.0–3.2 kg/lap at high-speed circuits (Monza class).

**Known contaminant:** engine mode changes shift `F_traction(v)`.

**Two responses, both useful:**

- *Filter:* restrict the regression to laps whose speed-trap speed sits inside a narrow band (a proxy for consistent power mode).
- *Exploit:* the residual after mass fitting is itself a signal for fuel-save and push level. The contaminant becomes feature 4.4.

**Validation criterion:** fitted burn rate must land inside the published per-circuit consumption range for at least 15 of 20 circuits, **without having been fitted to it**. If it does, this is independent evidence the estimator works, and it goes straight into the deck.

### 4.2 Tyre energy as the degradation clock

Real teams do not use tyre age. They use tyre energy — the sliding power integrated over the lap, computed from tyre forces and slip velocity. The one paper that does this properly trained on Mercedes-AMG PETRONAS' private telemetry.

Public-data surrogate:

```
kappa(s) = curvature, from spline-fitted X,Y position data
a_lat    = v^2 * kappa
a_lon    = dv/dt
E_lap    = integral over lap of ( |a_lat| + |a_lon| ) * v * dt
E_lap    = E_lap * f(T_track)        # thermal weighting
E_cum    = cumulative E_lap on the current tyre set
```

Then `g_compound(E_cum)` replaces `g_compound(tyre_age)`.

**Why this matters:** two drivers can complete the same number of laps on the same compound and have put materially different energy through the tyre. An age-based model calls them identical. They are not.

**Validation criterion:** rank the 24 circuits by mean `E_lap`. Compare against Pirelli's published tyre-stress ratings, which appear in every race preview. High-lateral circuits (Barcelona, Suzuka, Silverstone) should rank high; low-lateral circuits (Monza, Las Vegas) should rank low. If the ranking is sensible, the proxy is real.

### 4.3 Track evolution as a shared latent

Track evolution is identifiable **because every car experiences the same track at the same time.**

Model it as a monotone spline `h(session_clock)` shared across all cars in the session. It is not a per-car nuisance term to be absorbed into noise; it is a field-level effect with 20 simultaneous observers. This is the cleanest identification argument in the project and it should be stated explicitly in the pitch.

### 4.4 Push level and traffic

**Push level (`pi[stint]`)** — latent per-stint intercept, informed by two observable proxies:

- *Lift-and-coast index:* throttle falling below ~95% before the braking point, per corner, per lap. Count and magnitude.
- *Mass-fit residual:* the leftover from 4.1 after mass has been fitted.

**Traffic (`traffic_exposure`)** — FastF1 provides this directly. `Telemetry.add_driver_ahead()` adds `DriverAhead` (driver number as string) and `DistanceToDriverAhead` (metres). Convert to a continuous per-lap dirty-air exposure: the fraction of the lap spent within a distance threshold of the car ahead.

Two documented gotchas to respect:
- Apply per lap and concatenate. Applying it over long spans accumulates integration error.
- Cars in the pit lane are not excluded and will appear as "ahead" on the pit straight.

### 4.5 The model

```
laptime[car, lap] = alpha[car]                          # car/driver intercept
                  + kappa[circuit] * m_hat[car, lap]    # ESTIMATED mass
                  + g[compound](E_cum[car, lap])        # tyre ENERGY
                  + I[E_cum > k[compound]]
                      * s[compound] * (E_cum - k)       # MINED cliff
                  + h(session_clock)                    # shared track evo
                  + tau * traffic_exposure[car, lap]
                  + pi[stint]                           # latent push
                  + epsilon

epsilon ~ SkewT(sigma, lambda)
```

Notes:

- **Skew-t noise, not Gaussian.** Driver errors are asymmetric — a lap can be much slower than intended, never much faster. Gaussian noise mis-weights the tails.
- **Partial pooling** across drivers within a team, and across circuits for compound priors.
- **Cliff parameters are mined, not assumed.** Fit a hinge; accept the knot only if it reduces SSE by a meaningful margin over the linear fit, with a minimum lap count. Do not assume a functional form globally.
- **Confidence gate.** If clean-lap count falls below a threshold, or the posterior on the slope is too wide, the model outputs `INSUFFICIENT_DATA` instead of a curve. Refusing to answer is a feature.

---

## 5. Data sources

All free. All verified.

### 5.1 FastF1 (primary)

Python package. Docs at `docs.fastf1.dev`.

- **Sessions:** `'FP1'`, `'FP2'`, `'FP3'`, `'Q'`, `'S'`, `'SQ'`, `'R'`. Practice is fully available — this is the premise of the brief.
- **Lap data (`session.laps`):** LapTime, Sector1/2/3Time, SpeedI1, SpeedI2, SpeedFL, SpeedST, Compound, TyreLife, FreshTyre, Stint, PitInTime, PitOutTime, TrackStatus, IsAccurate, LapStartTime.
- **Car telemetry (`lap.get_car_data()`):** Speed, Throttle, Brake, nGear, RPM, DRS, Time. Then `.add_distance()` adds a `Distance` column.
- **Position (`lap.get_pos_data()`):** X, Y, Z.
- **Traffic (`.add_driver_ahead()`):** DriverAhead, DistanceToDriverAhead (metres).
- **Weather (`session.weather_data`):** AirTemp, TrackTemp, Humidity, Pressure, Rainfall, WindSpeed, WindDirection.
- **Circuit (`session.get_circuit_info()`):** corner positions and numbers.
- **Caching:** `fastf1.Cache.enable_cache(path)` — call immediately after import, before anything else.

### 5.2 OpenF1 (secondary, cross-check + live story)

REST API at `api.openf1.org/v1/`. Historical data from 2023 onwards is free, no authentication. Real-time requires a paid subscription. Free tier limits: 3 req/s, 30 req/min. Append `?csv=true` for CSV output.

Endpoints used:

| Endpoint | Contents |
|---|---|
| `/car_data` | brake, throttle, speed, rpm, n_gear, drs — approximately 3.7 Hz |
| `/location` | x, y, z — approximately 3.7 Hz |
| `/laps` | sector durations, i1/i2/st speeds, is_pit_out_lap, mini-sector segment arrays |
| `/stints` | compound, lap_start, lap_end, tyre_age_at_start |
| `/weather` | air and track temperature, updated every minute |
| `/race_control` | flags, safety car, session status, category |
| `/intervals` | gap_to_leader, interval — updated approximately every 4 seconds |
| `/pit` | lane_duration, stop_duration, lap_number |
| `/sessions`, `/meetings` | session keys, circuit metadata, circuit_info_url |

Gotchas:
- Mini-sector segments are **not available during races**.
- The location origin (0,0,0) is arbitrary and there is no lateral placement. Curvature computation is unaffected — it is translation-invariant.

### 5.3 Supporting

| Source | Use |
|---|---|
| Jolpica-F1 | Ergast-compatible historical results, 1950 onwards |
| F1DB | Full F1 database as JSON / CSV / SQL dumps |
| MultiViewer circuit API | Track maps and corner geometry (linked from OpenF1 `circuit_info_url`) |
| Pirelli race previews | Per-weekend compound allocation (C1–C5) and published tyre-stress ratings. Manual scrape / compile. |

### 5.4 What does not exist

Fuel load. Tyre temperatures. Tyre pressures. Actual wear measurements. Setup data.

The project is designed around this. Do not go looking for it.

### 5.5 Harvest scope

Do not harvest everything. Telemetry is the slow, heavy part.

- **Lap-level + weather + race control:** all sessions, 2023–2026. Cheap.
- **Telemetry (car data + position):** 25 weekends, FP2 + Race only. Heavy — this is what feeds the physics estimators.
- **Priority ordering:** get 5 weekends of telemetry done first so Phase 2 can start. Then let the rest run in the background.

---

## 6. Repository architecture

```
cleanroom/
├── CLAUDE.md                     # project rules + pointer to docs/SPEC.md
├── README.md                     # one-command reproduction
├── pyproject.toml
├── Makefile                      # make harvest / features / model / validate / all
├── docs/
│   ├── SPEC.md                   # this document
│   ├── PROGRESS.md               # updated after every phase
│   └── REPORT.md                 # the written submission
├── data/
│   ├── raw/                      # IMMUTABLE. fastf1 cache + openf1 dumps
│   ├── interim/                  # laps.parquet, exclusions ledger
│   └── processed/                # lap_features.parquet, circuit_atlas.parquet
├── src/cleanroom/
│   ├── config.py                 # circuits, seasons, constants (all sourced)
│   ├── ingest/
│   │   ├── fastf1_harvest.py
│   │   ├── openf1_client.py
│   │   └── schemas.py            # pandera schemas for every contract
│   ├── clean/
│   │   ├── lap_gate.py           # validity filters + exclusion ledger
│   │   └── traffic.py            # DistanceToDriverAhead -> exposure
│   ├── physics/
│   │   ├── reference_segment.py  # per-circuit full-throttle window picker
│   │   ├── fuel_mass.py          # section 4.1
│   │   ├── tyre_energy.py        # section 4.2
│   │   └── push_level.py         # section 4.4
│   ├── model/
│   │   ├── baselines.py          # naive, fixed-fuel, clamped, ARIMA
│   │   ├── mixedlm.py            # FALLBACK. Build this FIRST.
│   │   ├── hierarchical.py       # NumPyro. The main model.
│   │   └── cliff.py              # hinge mining with evidence gate
│   ├── validate/
│   │   ├── backtest.py           # practice-only -> race pace
│   │   ├── calibration.py        # reliability diagram, ECE
│   │   ├── ablation.py           # remove each correction, measure damage
│   │   └── leakage_audit.py      # the temp-feature trap
│   ├── decide/
│   │   ├── montecarlo.py         # stint simulator with feasibility caps
│   │   └── counterfactual.py
│   ├── serve/
│   │   ├── api.py                # FastAPI
│   │   └── brief.py              # LLM layer with claim verifier
│   └── series/
│       ├── f1.yaml               # compounds, weights, session structure
│       ├── f2.yaml
│       └── fe.yaml
├── tests/
├── notebooks/                    # exploration only. Nothing ships from here.
├── results/
│   └── frozen_v1.json            # READ-ONLY once written
└── web/                          # Next.js dashboard
```

---

## 7. Data contracts

Freeze these on Day 1. Enforce with `pandera`. Changing them after Phase 3 costs a day.

### 7.1 `data/interim/laps.parquet`

```
session_id          str     e.g. "2025_ESP_FP2"
year                int
circuit             str
session_type        str     FP1|FP2|FP3|Q|R
driver              str     3-letter code
driver_number       int
team                str
lap_number          int
stint               int
compound            str     SOFT|MEDIUM|HARD|INTERMEDIATE|WET
tyre_life           int     laps on this set at lap start
fresh_tyre          bool
lap_time            float   seconds
s1, s2, s3          float   seconds
speed_i1, speed_i2  float   km/h
speed_fl, speed_st  float   km/h
pit_in, pit_out     bool
track_status        str
is_accurate         bool
session_clock_s     float   seconds since session start
track_temp          float   C
air_temp            float   C
rainfall            bool
```

### 7.2 `data/processed/lap_features.parquet`

```
session_id, driver, lap_number      # join keys

m_hat_kg            float   estimated total mass
m_hat_se            float   its standard error   <- REQUIRED, do not skip
fuel_kg             float   m_hat - chassis min weight
burn_rate_kg_lap    float   fitted per stint

E_lat               float   lateral energy component
E_lon               float   longitudinal energy component
E_tyre              float   weighted total for this lap
E_cum               float   accumulated on current tyre set

lac_index           float   lift-and-coast magnitude
push_residual       float   residual from mass fit
traffic_exposure    float   0..1, fraction of lap in dirty air
min_dist_ahead_m    float

clean_flag          bool
exclusion_reason    str     null if clean
```

### 7.3 `results/posterior.json`

```json
{
  "session_id": "2025_ESP_FP2",
  "model_version": "hierarchical_v3",
  "n_clean_laps": 214,
  "confidence_gate": "PASS",
  "compounds": {
    "SOFT": {
      "base_pace": 78.42,
      "base_pace_ci": [78.31, 78.53],
      "slope_per_energy": 0.0031,
      "slope_ci": [0.0024, 0.0039],
      "slope_per_lap_equiv": 0.087,
      "cliff": {
        "knot_energy": 18.2,
        "extra_slope": 0.21,
        "evidence_sse_reduction": 0.34,
        "accepted": true
      }
    }
  },
  "track_evolution": [[0, 0.0], [300, -0.12], [600, -0.19]],
  "confounder_decomposition": {
    "fuel_s_per_lap": 0.31,
    "track_evo_s_per_lap": 0.06,
    "traffic_s_per_lap": 0.03,
    "residual_true_deficit": 0.00
  }
}
```

### 7.4 REST API

```
POST /api/session          {year, circuit, session}  -> {job_id}
GET  /api/deg-curves/{id}  -> posterior.json
GET  /api/decompose/{id}   -> waterfall breakdown
GET  /api/strategy/{id}    -> stop windows + outcome distributions
GET  /api/brief/{id}       -> verified natural-language briefing
GET  /api/replay/{id}?lap=N -> posterior as of lap N (live replay mode)
```

### 7.5 Fixtures

**Generate synthetic fixtures matching every schema on Day 1.** The frontend and API must be buildable before real data exists. Put them in `tests/fixtures/`. This single decision buys several days.

---

## 8. The 15-day solo roadmap

Assume 6–8 hours per day. Each phase has an exit gate. **If a gate fails, take the stated fallback and move on.** Do not let one component consume the schedule.

### Phase 0 — Day 1: Foundation

- Repo scaffold, `pyproject.toml`, `Makefile`, `CLAUDE.md`.
- Freeze all schemas in `src/cleanroom/ingest/schemas.py` with pandera.
- Generate synthetic fixtures for every contract.
- **Start the FastF1 harvest before anything else.** It runs for days.
- Scaffold Next.js and FastAPI against fixtures.

Harvest skeleton:

```python
import fastf1
from pathlib import Path

fastf1.Cache.enable_cache('./data/raw/fastf1_cache')

LAP_TARGETS = [(y, r) for y in (2023, 2024, 2025, 2026) for r in range(1, 25)]
TELEM_PRIORITY = [(2025, r) for r in (1, 4, 7, 9, 14)]   # do these first
TELEM_REST     = [(2025, r) for r in range(1, 25)] + [(2024, r) for r in range(1, 25)]

def harvest(year, rnd, session, with_telemetry):
    try:
        s = fastf1.get_session(year, rnd, session)
        s.load(telemetry=with_telemetry, weather=True, messages=True)
        return s
    except Exception as e:
        log_failure(year, rnd, session, e)   # never let one failure kill the run
        return None
```

**Gate:** harvest running, schemas frozen, fixtures generated, both apps render.
**Fallback:** if FastF1 rate-limits, use OpenF1 bulk CSV for lap/stint/weather; keep FastF1 for telemetry only.

---

### Phase 1 — Days 2–3: Clean data and the broken baseline

**Day 2 — the lap validity gate.** Filters, in order, each logging its own removal count into an **exclusion ledger**:

1. `pit_in` or `pit_out` true → in/out laps
2. `track_status` indicates SC, VSC, yellow, or red
3. `is_accurate` false
4. lap time outside 107% of the driver's stint median
5. traffic contamination: more than ~20% of the lap within the dirty-air threshold

Persist the ledger. It goes in the deck as evidence of rigour.

**Day 3 — baselines and the money shot.**

Fit and plot:
- **Baseline A (naive):** `lap_time ~ tyre_age`, per compound, per session.
- **Baseline B (industry standard):** fixed 0.03 s/kg, assumed 110 kg linear decay — exactly what the published paper does.
- **Baseline C (clamped):** fuel added back, wear clamped to [0, 0.22] s/lap — the Pitwall approach.

**Find the sessions where A and B produce a negative slope.** Screenshot them. This is slide 1 of the pitch forever. Save to `results/broken_baseline/`.

**Gate:** you can demonstrate, on real data, that both standard methods produce physically impossible degradation.

---

### Phase 2 — Days 4–6: Fuel mass estimator

Implement section 4.1.

- Day 4: reference-segment picker, telemetry slicing, distance-grid resampling.
- Day 5: per-lap acceleration fit, robust relative-mass regression per stint.
- Day 6: absolute anchoring, per-circuit calibration, validation against published burn rates.

**Gate:** fitted burn rate inside the published per-circuit range for ≥15 of 20 circuits, without being fitted to it.

**Fallback if the gate fails:** ship per-circuit *fitted* fuel coefficients instead of the global 0.03. Still strictly better than every public tool and every cited paper. Do not spend Day 7 here.

---

### Phase 3 — Days 7–8: Tyre energy

Implement section 4.2.

- Day 7: spline-fit X,Y, compute curvature, validate corner positions against `get_circuit_info()`.
- Day 8: energy integration, thermal weighting, cumulative tracking, circuit-ranking validation vs Pirelli stress ratings.

**Gate:** produce the chart showing two drivers at identical tyre age with materially different accumulated energy. That chart is a differentiator on its own.

Also on Day 8: lift-and-coast detector and traffic exposure conversion. Every term in section 4.5 must now have a computed column.

---

### Phase 4 — Days 9–11: The model

**Build `mixedlm.py` first, on Day 9 morning.** It is your insurance and your intermediate baseline. `statsmodels.MixedLM` with bootstrap intervals. One hour of work that guarantees the project ships.

- Day 9: NumPyro model on a single weekend. Check divergences, r_hat, ESS.
- Day 10: full corpus, partial pooling, cliff mining with evidence gate.
- Day 11: posterior extraction, confidence gate, `posterior.json` generation.

**Hard checkpoint, end of Day 10:** if NumPyro is still fighting, switch to MixedLM. Cost: one hour, because you wrote it on Day 9.

**Gate:** tyre slope positive; compound ordering soft < medium < hard on a majority of weekends; credible intervals present.

---

### Phase 5 — Day 12: Validation

The single most important day.

- Train on **FP1 + FP2 + FP3 only**. Predict race stint pace. Held-out races.
- Metrics: MAE (s/lap), RMSE, compound-order accuracy, infeasible-stint rate.
- Compare against Baselines A, B, C, plus ARIMA.
- **Reliability diagram:** bin predicted intervals, check empirical coverage. Are the 90% intervals actually covering 90%?
- **Ablation grid:** remove each confounder correction one at a time, measure MAE degradation. This proves every component earns its place.
- **Leakage audit:** run a variant including track/air temperature as features. It will look suspiciously good, because those are per-weekend fingerprints — the model learns *which race this is* rather than how tyres degrade. Document the trap and the fix.

**Freeze to `results/frozen_v1.json`. It is read-only from this moment.**

**Gate:** a filled results table you would defend in a viva.

---

### Phase 6 — Day 13: Decision layer

- Monte Carlo stint simulator consuming the clean degradation posteriors. Output distributions, not point estimates.
- **Feasibility cap:** no recommended stint may exceed the longest stint anyone actually completed on that compound at that circuit. Without this the optimiser goes insane — the reference system recommends impossible stints in 90.5% of races when unconstrained.
- Counterfactual query: same stint on a different compound.
- Circuit atlas: precomputed degradation priors for all circuits × compounds.

**Gate:** degradation curves → stop recommendation → position delta, end to end.

---

### Phase 7 — Day 14: Frontend and serving

Six screens, in this build order:

1. **Deconfounding Waterfall** — the money shot. An apparent gap decomposed into fuel / track evolution / traffic / true deficit.
2. **Degradation explorer** — compound curves with credible bands, naive-vs-clean toggle.
3. **Sandbagging leaderboard** — true pace vs timing-sheet pace, with intervals.
4. **Confound sensitivity slider** — drag the fuel coefficient, watch the compound ranking invert live.
5. **Validation scoreboard** — the frozen numbers plus the reliability diagram.
6. **Live replay** — stream a real FP2 lap-by-lap, watch the posterior converge and the credible bands narrow. Best live-demo moment in the project.

Also: FastAPI live, series config layer (F1/F2/F3 YAML), LLM briefing with claim verifier, deploy.

**LLM layer design — non-negotiable:** the model receives a typed JSON state and emits claims against a fixed schema. Every numeric claim is verified against model state before rendering; unverified claims fall back to a template. Say this on stage. The state of the art found that fine-tuned generators fabricate drivers, gaps, and compounds precisely when the grounding state is sparse. You are immune by construction, and that is a slide.

**Gate:** deployed URL works from a phone on a different network. Demo video recorded and on disk.

---

### Phase 8 — Day 15: Judge pack

- `README.md` with one-command reproduction, architecture diagram.
- `docs/REPORT.md`: 6–8 pages — problem, related work, method, identification argument, results, ablations, **limitations**.
- Repo cleanup, tests passing, CI green.
- Five timed rehearsals.

**No code after 12:00.**

---

## 9. Claude Code prompts

Paste these one at a time. Do not combine phases.

**Phase 0**
```
Read docs/SPEC.md sections 6 and 7.

Scaffold the repository exactly as specified in section 6. Then:
1. Implement src/cleanroom/ingest/schemas.py with pandera schemas for
   every contract in section 7.
2. Write scripts/generate_fixtures.py producing synthetic data matching
   every schema, saved to tests/fixtures/.
3. Implement src/cleanroom/ingest/fastf1_harvest.py per section 5.5 and
   the skeleton in section 8 Phase 0. It must be resumable, log failures
   without stopping, and never re-download a cached session.
4. Create the Makefile with targets: harvest, features, model, validate, all.

Do not implement any modelling yet.
```

**Phase 1**
```
Read docs/SPEC.md section 8 Phase 1.

Implement src/cleanroom/clean/lap_gate.py. Apply the five filters in the
order listed. Every filter must log its removal count and reason into an
exclusion ledger persisted to data/interim/exclusions.parquet. Never drop
a row silently.

Then implement src/cleanroom/clean/traffic.py converting
DistanceToDriverAhead into per-lap traffic_exposure. Apply add_driver_ahead
per lap and concatenate — do not apply it across multiple laps.

Then implement src/cleanroom/model/baselines.py with Baselines A, B and C
from Phase 1 Day 3. Add a script that finds and plots every session where
Baseline A or B produces a negative degradation slope, saving to
results/broken_baseline/.
```

**Phase 2**
```
Read docs/SPEC.md section 4.1.

Implement src/cleanroom/physics/reference_segment.py and fuel_mass.py
following the five-step algorithm exactly.

Requirements:
- Every physical constant carries a source comment.
- Output m_hat_kg AND m_hat_se. The standard error is required.
- Include the engine-mode filter (speed-trap band restriction).
- Write the validation check: compare fitted burn rate against the
  per-circuit ranges in section 4.1 and report pass/fail per circuit.

Add tests in tests/test_fuel_mass.py using the synthetic fixtures, where
you know the true mass by construction.
```

**Phase 3**
```
Read docs/SPEC.md section 4.2 and 4.4.

Implement src/cleanroom/physics/tyre_energy.py:
- spline-fit X,Y position data, compute curvature
- lateral and longitudinal acceleration
- integrate to E_lap, apply thermal weighting, accumulate to E_cum
- validate corner detection against session.get_circuit_info()

Then implement push_level.py with the lift-and-coast detector.

Then write the validation script that ranks circuits by mean E_lap and
outputs the ranking for manual comparison against Pirelli tyre-stress
ratings.
```

**Phase 4**
```
Read docs/SPEC.md section 4.5.

FIRST implement src/cleanroom/model/mixedlm.py using statsmodels.MixedLM
with bootstrap confidence intervals. This is the fallback path and must
work before anything else.

THEN implement src/cleanroom/model/hierarchical.py in NumPyro with the
full specification: partial pooling, compound-specific energy slopes,
skew-t noise, shared monotone track-evolution spline, latent push level.

THEN implement cliff.py: hinge mining with an evidence gate. Only accept
a knot if it reduces SSE meaningfully over the linear fit and has
sufficient supporting laps.

Both model paths must emit the identical posterior.json schema from
section 7.3, including the confidence gate.
```

**Phase 5**
```
Read docs/SPEC.md section 8 Phase 5.

Implement the full validation suite:
- validate/backtest.py: train on practice sessions only, predict race
  stint pace, held-out races
- validate/calibration.py: reliability diagram and expected calibration
  error
- validate/ablation.py: remove each confounder correction one at a time
- validate/leakage_audit.py: the track/air temperature leakage
  demonstration

Produce results/frozen_v1.json with every number, plus publication-quality
plots to results/figures/.

After writing frozen_v1.json, add a guard that refuses to overwrite it.
```

---

## 10. Validation protocol

Fill this table with real held-out numbers. It is the centre of the pitch.

| Method | Race-pace MAE (s/lap) | Compound order correct | Infeasible stint rate | 90% interval coverage |
|---|---|---|---|---|
| A — Naive `lap_time ~ age` | | | | n/a |
| B — Fixed 0.03 s/kg (industry) | | | | n/a |
| C — Clamped slope (published SOTA) | | | | n/a |
| D — ARIMA | | | | n/a |
| **CLEANROOM (MixedLM)** | | | | |
| **CLEANROOM (Hierarchical)** | | | | |

**Compound order correct** is a column where you can beat a peer-reviewed system, because the reference system inverts compound ordering in 18 of 24 races. Say so.

**Ablation grid** — same metric, one correction removed at a time:

| Configuration | MAE | Delta vs full |
|---|---|---|
| Full model | | — |
| − fuel estimation (use fixed 0.03) | | |
| − tyre energy (use lap count) | | |
| − track evolution latent | | |
| − traffic exposure | | |
| − push level latent | | |
| − skew-t (Gaussian noise) | | |
| − cliff mining | | |

---

## 11. Demo script (5 minutes)

| Time | Beat |
|---|---|
| 0:00 | "Every tyre model in public use assumes a fuel load nobody publishes. Here's what that costs." → the broken chart: hard tyre getting *faster* with age. Let it land. |
| 0:45 | The waterfall. Apparent 0.4 s deficit → decomposed → true deficit zero. |
| 1:30 | The sensitivity slider. Drag the fuel coefficient live, watch the compound ranking invert. "This is why the industry clamps instead of solving." |
| 2:15 | Method, 30 seconds, no equations on screen: fuel from telemetry, energy not age, track evolution as a shared latent across all 20 cars. |
| 3:00 | The validation table. Practice-only → race pace, N held-out races. |
| 3:45 | Reliability diagram. "Our 90% intervals cover 90%. Here's the proof." |
| 4:15 | Live replay: watch uncertainty collapse as laps arrive. Then config swap to F2 — same code, different series. |
| 4:45 | Stop talking. |

**Questions you will be asked. Have the answer in one sentence each:**

1. *How do you know your fuel estimate is right?* → Fitted burn rate lands inside published per-circuit consumption ranges without being fitted to them, on 15+ of 20 circuits.
2. *Why is your tyre-energy proxy valid?* → Circuit ranking by mean energy reproduces Pirelli's published tyre-stress ordering.
3. *How is track evolution identifiable?* → Twenty cars observe the same track simultaneously; it is a field-level effect, not a per-car nuisance.
4. *Is the LLM doing the maths?* → No. The model is Bayesian. The LLM reads structured output and every number it emits is verified against model state before rendering.
5. *What doesn't it handle?* → Wet sessions, red-flag-truncated sessions, and sessions with fewer than N clean laps — where it returns INSUFFICIENT_DATA rather than guessing.

---

## 12. Risk register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Fuel estimator doesn't converge | Medium | High | Hard timebox to Day 6. Fallback: per-circuit fitted coefficients. |
| NumPyro sampler diverges | Medium | High | MixedLM written Day 9 morning. Switch costs one hour. |
| FastF1 harvest too slow | Medium | High | Started Day 1. Priority weekends first. OpenF1 CSV fallback. |
| Telemetry gaps in some sessions | High | Low | Confidence gate returns INSUFFICIENT_DATA. Documented as a limitation. |
| Live demo fails on venue wifi | Medium | High | Everything pre-cached and offline. Recorded video as fallback. |
| Judges assume the LLM does the maths | High | Medium | Address it unprompted in the pitch. |
| Scope creep into race-pace prediction | High | Medium | The brief is degradation curves. Strategy layer is a bonus, not the product. |

**Five non-negotiables:**

1. Everything runs offline for the demo. No live API call on stage.
2. Freeze validation numbers on Day 12. Never regenerate under pressure.
3. Write the MixedLM fallback on Day 9, before you need it.
4. Commit daily, tag every gate.
5. Screenshot the broken naive chart on Day 3 and never delete it.

---

## 13. References

1. Santillana, J. S. (2026). *Pitwall: Faithful Natural-Language Race-Strategy Briefings from a Calibrated Real-Time Monte Carlo Engine.* arXiv:2607.06495. — The clamping admission, the compound-inversion statistic, the infeasible-stint rate, the sparse-context hallucination finding.
2. Cappello, C. and Hoegh, A. (2025). *A State-Space Approach to Modeling Tire Degradation in Formula 1 Racing.* arXiv:2512.00640. — Bayesian state-space degradation on FastF1 data; assumes 110 kg linear fuel decay.
3. *Explainable Time Series Prediction of Tyre Energy in Formula One Race Strategy.* arXiv:2501.04067. — Tyre energy as sliding power; trained on private Mercedes-AMG PETRONAS telemetry.
4. Heilmeier, A., Thomaser, A., Graf, M. and Betz, J. (2020). *Virtual Strategy Engineer.* Applied Sciences 10(21):7805. — Plus `github.com/TUMFTM/race-simulation`.
5. Heilmeier, A., Graf, M., Betz, J. and Lienkamp, M. (2020). *Application of Monte Carlo Methods to Consider Probabilistic Effects in a Race Simulation for Circuit Motorsport.* Applied Sciences 10(12):4229.
6. FastF1 documentation — `docs.fastf1.dev`
7. OpenF1 API documentation — `openf1.org/docs`

---

*End of specification.*
