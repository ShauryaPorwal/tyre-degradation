# CLEANROOM — Research Base for the Live Simulation

Compiled 2026-08-26 from three independent literature sweeps (tyre science;
fuel/traffic/strategy; video/telemetry feasibility). Every claim is labelled:

- **MEASURED** — published data or direct analysis of official timing data
- **MODEL** — output of a published/fitted model (e.g. TUM race simulator parameters)
- **ASSUMPTION** — rule of thumb with no primary source; must be fitted, never hardcoded

Constants in `web/src/lib/sim/constants.ts` and `scripts/generate_race_fixture.py`
cite sections of this file (`RESEARCH §n`). Where sources disagree, the range and
the disagreement are reported — per project rule 1, we never pick a convenient
number silently.

---

## §1 Tyre degradation

| Claim | Value / range | Label | Sources |
|---|---|---|---|
| Linear deg is the robust default; logarithmic fits best with dense data | — | MODEL | Heilmeier et al. 2018/2020 (IEEE ITSC; Appl. Sci. 10:4229); Sulsters 2018; arXiv:2306.16088 |
| Fitted per-compound deg, Bahrain 2019 (high-deg circuit) | soft 0.170, med 0.147, hard 0.094 s/lap | MODEL | TUM `pars_Sakhir_2019.ini`, github.com/TUMFTM/race-simulation |
| Fitted deg, Hamilton Silverstone 2019 "A2" | 0.033 s/lap | MODEL | TUM `pars_Silverstone_2019.ini` |
| Fleet-average deg per lap of age (timing analysis) | 2022: soft 0.101 / hard 0.048 · 2026: soft 0.063 / hard 0.071 (inverted!) | MEASURED (single secondary source) | f1chronicle.com/2026-f1-tyre-degradation-data |
| Single-driver Bayesian fit (FastF1, 2025 Austrian GP) | hard 0.054 (CI 0.004–0.133), med 0.060 (CI 0.009–0.120) s/lap; compounds NOT statistically separable in one race | MODEL | arXiv:2512.00640 |
| Working envelope for any circuit/era | **0.02–0.17 s/lap** | synthesis | all above |
| Cliff: no published magnitude; era-dependent (engineered 2011–13, absent later); mechanisms: thermal (pressure→contact patch) + wear-through to harder base layer | detect, never parameterise | MEASURED (qualitative) | motorsport.com/f1/news/657259, autosport.com/f1/news/4992767 |
| Usable stint lengths, measured | Hungary 2025 avg: soft 15.3 / med 26.7 / hard 31.5 laps · Dutch 2025 longest: 25 / 30 / 53 | MEASURED | coffeecornermotorsport.com GP tyre previews |
| Deg reduced under neutralisation | ×0.25 (SC), ×0.5 (VSC) | MODEL | TUM parameter files |
| Cold-tyre out-lap penalty | +1.0 s | MODEL | TUM `t_add_coldtires` |

**Consequences for CLEANROOM:** deg rates must be *fitted per session*; the
2026 inverted hierarchy proves compound ordering is not a safe prior; Montreal's
apparent −0.005 s/lap (evolution beats deg) proves evolution belongs inside the
joint model (F47), confirming ADDITIONS.md §11.

## §2 Fuel

| Claim | Value / range | Label | Sources |
|---|---|---|---|
| Rule-of-thumb fuel effect | 0.03 s/kg; sourced band 0.02–0.04 (low-speed ≈0.04, high-speed ≈0.02) | ASSUMPTION | f1technical.net t=21636; f1briefing.com; Kravitz/BBC "0.035"; Prost F1 "0.32 s/10 kg, Barcelona 2001" |
| Fitted per-circuit fuel sensitivity | Monza 0.027 · Silverstone 0.034 · Monaco 0.034 s/kg | MODEL | TUM `t_lap_sens_mass`, per-race .ini files (121 races 2014–19) |
| Max race fuel | 110 kg (since 2019); flow cap 100 kg/h; ~70 kg energy-equivalent from 2026 | MEASURED | FIA Sporting/Technical Regs via autosport.com |
| Fuel burn per lap, fitted | Monaco 1.41 · Monza 2.08 · Silverstone 2.12 kg/lap | MODEL | TUM `b_fuel_perlap` |
| Fuel burn arithmetic bound | 110 kg / 66 laps (Barcelona) ≈ 1.67 kg/lap race average | MEASURED (arithmetic) | FIA fuel limit + race distance |
| **Disagreement**: ADDITIONS.md §11 quotes 2.2–3.2 kg/lap | practice push laps burn more than race average (no lift-and-coast); both bands are era/mode-dependent | note | — |
| Fuel–deg interaction: drivers push harder as fuel burns, keeping tyre energy roughly level | nonlinear coupling | MODEL | Heilmeier via arXiv:2306.16088 |

**Consequence:** 0.03 s/kg stays Baseline B (F40) — the thing we beat. The
simulation *fits* the coefficient online with a prior centred in the TUM band.

## §3 Mass → tyre energy scaling

Kinetic energy dissipated in braking (½mv²) and lateral tyre load (m·a_lat)
are both linear in mass, so per-lap tyre energy scales ≈ (M+fuel)/(M+fuel_ref).
**MODEL** (first-principles scaling; consistent with AWS's tyre-energy
definition from speed + accelerations + gyro — aws.amazon.com/sports/f1/).
Heilmeier's observation (§2 above) means the real coupling is weaker than
linear late in stints; we use the linear form and say so.

## §4 Compound pace offsets & temperature windows

| Claim | Value / range | Label | Sources |
|---|---|---|---|
| Adjacent-compound gap, Pirelli 2026 design target | 0.7–0.8 s quali, ~0.4 s race trim | MEASURED (Pirelli statement, Isola) | scuderiafans.com, the-race.com |
| Pre-2026 race-trim gaps | ~0.2–0.6 s per step, circuit-dependent | synthesis | above + podiumprophets.com |
| Working window width ~30 °C; high-range compounds peak >100 °C | — | MEASURED (Pirelli) | pirelli.com "Seeing through the window" |
| Track temp → deg: direction documented (hot → thermal deg; cold → graining); **no public s/°C coefficient exists** | fit from data or leave in residual — never cite a number | MEASURED (direction only) | catapult.com, f1technical.net t=26579 |
| Graining = cold/sliding surface tears; blistering = core overheating | — | MEASURED | flowracers.com, f1chronicle.com |

## §5 Traffic, dirty air, overtaking

| Claim | Value / range | Label | Sources |
|---|---|---|---|
| Downforce lost following at 10 m / 20 m | 2021 cars: −47% / −35% · 2022: −18% / −4% · 2025 ≈ −35% / −20% | MODEL (FIA CFD, two outlets) | formula1.com 2022-car explainer; the-race.com FIA data |
| Lap-time cost of following | "several tenths"; **no measured s/lap figure public** | ASSUMPTION | f1chronicle.com, thef1db.com |
| Battle/duel cost per lap | 0.3 s (`t_duel`); loser of an overtake +0.3 s | MODEL | TUM parameter files |
| Pace surplus needed to pass | Silverstone 1.35 s · Monza 1.76 s · Monaco 3.75 s | MODEL | TUM `t_gap_overtake` |
| DRS lap-time effect | fitted −0.23…−0.49 s/lap (TUM); 0.5–0.8 s secondary; removed in 2026 | MODEL / MEASURED mix | TUM files; Wikipedia DRS; racesundays.com |

**Consequence:** the sim's traffic term uses the TUM duel cost as its *prior*
and fits the actual coefficient from the flagged laps; it never presents the
0.3 s as a measurement of this race.

## §6 Track evolution

FP1→Q average improvement ≈ 2.5 s (MEASURED, nextgen-auto — confounded with
fuel/engine modes); street circuits up to ~5 s; within-race evolution is small
on a rubbered track but can exceed deg (Montreal −0.005 s/lap apparent deg,
MEASURED, f1chronicle). **No published per-lap coefficient exists** — a fitted
term with a weak prior, per F47.

## §7 Pit stops & strategy

| Claim | Value / range | Label | Sources |
|---|---|---|---|
| Total pit loss, median per circuit (2,106 green-flag stops 2022–26) | 19.7–23.8 s; **Barcelona 23.8 s**; Spa 18.4 | MEASURED | f1chronicle.com/f1-pit-stop-time-loss-data |
| TUM cross-check (Silverstone 2019) | in+out ≈ 17.0 s + standstill 1.9 s + team 0.4–1.4 s ≈ 19–20 s | MODEL | TUM files |
| Undercut gain | median 1.8 s (69 attempts, Barcelona 2026); folk figure 1–2 s | MEASURED / ASSUMPTION | f1chronicle.com; catapult.com |
| SC probability per race | P(≥1 SC) ≈ 0.545 (2014–19); durations 2–8 laps | MEASURED | Heilmeier 2020 Appl. Sci. Table A3/4 |
| VSC lap ≈ 140%, SC lap ≈ 160% of clean pace | older +20/40% figures shown too small | MEASURED | Heilmeier 2020 §2.5 |
| Strategy method precedents | lap-wise sim + Monte Carlo (TUM, LGPL-3.0); discrete-event (Bekker); RL (arXiv:2501.04068, Mercedes); real-time MC (Pitwall arXiv:2607.06495) | MODEL | cited |

## §8 Uncertainty & noise

| Claim | Value / range | Label | Sources |
|---|---|---|---|
| Clean-lap residual σ (race, per driver, trend removed) | 0.46–0.76 s (Hamilton 0.459 … Russell 0.759) | MEASURED | Heilmeier 2020 Table A1 |
| Observation-noise prior in Bayesian fit | half-Normal(0.3, 0.1²) s | MODEL | arXiv:2512.00640 |
| Published band for clean-lap noise | ≈ 0.3–0.8 s race / tighter in clean practice air | synthesis | both |
| Uncertainty idioms in the field | MC rank distributions; posterior credible intervals; skewed-t observation models | MODEL | Heilmeier 2020; arXiv:2512.00640 |

EVSI probability anchors used by the run planner (0.48 → 0.76 one-stop) are
**fixture placeholders** from ADDITIONS.md's worked example until Phase 6 —
labelled in `web/src/lib/runplan.ts`, interpolated on achieved variance
reduction, never presented as measured.

## §9 Video analysis — what is honest

| Claim | Label | Sources |
|---|---|---|
| Best shipped precedent: F1ReplayTiming reads ONE timing-tower frame with a VLM to *sync* a replay, then plays back real FastF1 data — video for alignment, official data for numbers | MEASURED | github.com/adn8naiagent/F1ReplayTiming |
| Timing-tower/score-bug OCR exists (Tesseract projects, Stats patents w/ Kalman-HMM cleanup); noisy on small translucent graphics | MEASURED | github.com/KurtMoran/F1-Data-Extractor; USPTO 11380101 |
| Shot/scene detection is mature and feasible client-side | ASSUMPTION (standard technique) | PySceneDetect-style histogram diffs |
| **Not recoverable from video**: tyre wear %, tyre temps, fuel load — even F1's broadcast "tyre performance" comes from telemetry models, not vision | MEASURED (absence + AWS method) | aws.amazon.com/sports/f1/ |
| Frame-accurate lap times without on-screen timing graphics: no precedent; world feed cuts constantly | ASSUMPTION (absence) | — |

**Consequence:** our video mode extracts *lap boundaries* (user-confirmed
marks assisted by frame-difference peaks) and session context typed in by the
user. It never claims telemetry-grade values from pixels.

## §10 Public telemetry reality

- FastF1: Speed/RPM/nGear/Throttle/Brake(bool)/DRS at ~3.7 Hz feed; laps,
  sectors, compound + tyre life, weather (1-min). No fuel, no tyre temps/
  pressures, no brake pressure. (MEASURED — docs.fastf1.dev)
- OpenF1: car_data ~3.7 Hz; laps; stints; pit; position; intervals (~4 s,
  races); location; race_control; weather 1-min cadence; historical free,
  real-time paid. (MEASURED — openf1.org/docs)
- Teams privately: ~300 sensors incl. tyre temp/pressure — the public feed is
  a sliver, so fuel and tyre thermal state are **structurally unobservable**
  publicly and must be estimated. (MEASURED as marketing claims — AWS/F1)

## §11 Existing products (positioning)

AWS F1 Insights cards (tyre performance, pit strategy battle, undercut threat)
are model-derived from telemetry and criticised as a black box (si.com) — a
transparent, verifiable pipeline is the differentiator. TUM race-simulation is
the open-source academic standard; arXiv:2512.00640 is the honest-CI precedent
on public data. Game-telemetry projects (F1 24 UDP) have fuel/tyre-temp
channels that **do not exist** for real F1 — do not conflate.
