# CLEANROOM — UI / UX Specification

Four screens. One drawer. One story mode.
**v2 addendum (§Screen 5, end of file): a fifth screen — Live Simulation — plus
the fuel-load planner on Screen 2, the consequence line on Screen 4, and the
driver comparison on Screen 3.**
Companion to `ADDITIONS.md`, `SPEC.md`, `STACK.md`, `RESEARCH.md`.

---

## The governing constraint

A judge has **five minutes** and **no domain context**. They will not discover your best work by exploring a navigation bar. Every decision below follows from that.

The previous plan had six screens plus a mechanism panel. That is too many. This spec consolidates to **four screens, one drawer, and a guided mode** — the same functionality with less than half the navigation.

---

## Design rules

Non-negotiable. Every screen is checked against these before it ships.

| # | Rule |
|---|---|
| 1 | **One question per screen.** If a screen answers two questions, it is two screens or one is cut. |
| 2 | **Maximum two charts per screen.** A third chart means the screen is doing too much. |
| 3 | **Number first, chart second.** The headline figure appears above the visualisation, always. |
| 4 | **No bare point estimates.** Every number carries an interval or a confidence state. |
| 5 | **Nothing scrolls past 1.5 viewport heights.** If it does, cut content — do not add tabs. |
| 6 | **Two colours carry meaning.** Accent = our model. Grey = baseline. Nothing else is coloured for meaning. |
| 7 | **Empty states are designed, not default.** "Insufficient data" must look intentional, never broken. |
| 8 | **No control the demo does not use.** Every slider, toggle, and filter must appear in the five-minute script or be removed. |

---

## Visual system

**Dark theme.** Motorsport convention, and it projects far better than light UI in a room with bad lighting.

```css
--bg:          #0A0A0B    /* page */
--surface:     #141416    /* cards */
--border:      #26262A
--text:        #EDEDEF
--text-muted:  #8A8A93

--accent:      #E10600    /* CLEANROOM output — use sparingly */
--baseline:    #52525B    /* naive / industry baseline */

--good:        #22C55E    /* sufficiency green */
--warn:        #F59E0B    /* amber */
--bad:         #EF4444    /* red */

--band:        rgba(225, 6, 0, 0.16)   /* credible interval fill */
```

**Typography.** Inter or Geist for UI. **Tabular numerals everywhere numbers appear** (`font-variant-numeric: tabular-nums`) — without this, figures jitter as they update in live replay and it looks amateur.

Scale: 48px headline number · 24px section heading · 15px body · 13px labels · 11px axis ticks.

**Spacing.** 8px base unit. Card padding 24px. Section gap 32px. Generous whitespace is the single cheapest way to look considered rather than crowded.

**Motion.** 200ms ease-out on state changes only. No decorative animation. The one exception is the live replay chart, which updates on a 400ms tick.

---

## Information architecture

```
┌─────────────────────────────────────────────────────────┐
│  CLEANROOM          Session · Deconfound · Curves · Next │
│                                    [How do we know?] [▶] │
└─────────────────────────────────────────────────────────┘

  4 screens in the top nav
  1 drawer  — "How do we know?" (validation, opens from anywhere)
  1 button  — Story Mode (▶), auto-advances through all four
```

Four nav items is the maximum a judge parses without reading. Validation lives in a drawer rather than a fifth tab because it is evidence, not a destination — it should be reachable from wherever the question arises.

---

# Screen 1 — Session

**Question it answers:** *What am I looking at, and can I trust it?*

```
┌───────────────────────────────────────────────────────────┐
│                                                            │
│   SPANISH GRAND PRIX 2025 · FP2                            │
│                                                            │
│        84            Session Health                        │
│                      214 clean laps of 340                 │
│                                                            │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│   │  SOFT    │  │  MEDIUM  │  │  HARD    │                │
│   │    🟢    │  │    🟢    │  │    🟡    │                │
│   │  34 laps │  │  61 laps │  │   9 laps │                │
│   └──────────┘  └──────────┘  └──────────┘                │
│                                                            │
│   ── Choose a session ──────────────────────────────────  │
│   [ The Broken Baseline ]  [ The Clean Case ]             │
│   [ The Hard Case ]        [ The Validated Case ]         │
│                                    browse all sessions →   │
└───────────────────────────────────────────────────────────┘
```

**Components:** F105 health score · F104 sufficiency meters · F107 presets.

**Deliberately absent:** the exclusion ledger table, a dropdown of 96 sessions, weather readouts, any chart.

The four presets replace a dropdown. They guarantee the demo lands on verified data, and **The Hard Case** exists specifically so you can show the system refusing to answer — a feature almost no competing project will demonstrate.

Health-score components appear on hover only.

---

# Screen 2 — Deconfound

**Question it answers:** *Why is everyone else's number wrong?*

```
┌───────────────────────────────────────────────────────────┐
│                                                            │
│   Apparent deficit  0.40 s/lap    →    True deficit  0.00  │
│                                                            │
│   ┌────────────────────────────────────────────────────┐  │
│   │                                                     │  │
│   │  0.40 ┃━━━━┓                                        │  │
│   │       ┃    ┗━━━━┓ fuel −0.31                        │  │
│   │       ┃         ┗━━┓ track evo −0.06                │  │
│   │       ┃            ┗━┓ traffic −0.03                │  │
│   │  0.00 ┃              ┗━━━━━━━━━━  TRUE              │  │
│   │       Observed                                      │  │
│   └────────────────────────────────────────────────────┘  │
│                                                            │
│   Fuel effect assumed by industry tools                    │
│   0.01 ├──────────●──────────┤ 0.06 s/kg                   │
│        ↳ at 0.03: HARD ranks fastest — physically wrong    │
│                                                            │
└───────────────────────────────────────────────────────────┘
```

**Components:** F77 waterfall (hand-rolled SVG) · F79 single fuel slider.

**Deliberately absent:** three other sliders, the naive-vs-clean toggle (it lives on Screen 3, where the curves are).

This is the persuasion screen. The waterfall is the money shot and gets the top two-thirds. The slider sits below it and exists for one purpose: drag it and watch the compound ranking invert, live, in three seconds.

**Live-demo note:** practise the drag. It should be one smooth movement to a value that visibly breaks the ranking, then back.

---

# Screen 3 — Curves

**Question it answers:** *What is the actual degradation?*

```
┌───────────────────────────────────────────────────────────┐
│                                                            │
│   MEDIUM   0.084 ± 0.018 s/lap        [ naive ⟷ clean ]   │
│   thermal · partially recovers on cooling laps             │
│                                                            │
│   ┌────────────────────────────────────────────────────┐  │
│   │ s/lap                                     ╱╱╱ HARD │  │
│   │       ░░░░░░░░░░░░░░░░░░░░░░░░░░░╱╱╱╱╱╱╱          │  │
│   │       ────────────────────────────  MEDIUM         │  │
│   │       ░░░░░░░░░░░░░░░░░░░                          │  │
│   │       ──────────────  SOFT       ▲ cliff L22 ±3    │  │
│   │                                                     │  │
│   │       0        5       10       15       20     25 │  │
│   │                    tyre energy (cumulative)         │  │
│   └────────────────────────────────────────────────────┘  │
│                                                            │
└───────────────────────────────────────────────────────────┘
```

**Components:** F78 curves with credible bands · F48 cliff markers · F49 mechanism as a **tag**, not a screen.

**Deliberately absent:** a mechanism panel, a per-driver breakdown, a raw lap table.

The naive↔clean toggle sits here because this is where the difference is visible. Toggling should animate over 200ms so the shift is legible rather than a jump cut.

Credible bands are filled, not dashed lines. A filled band reads as uncertainty instantly; dashed bounds read as three more lines to decode.

**Empty state (Red sufficiency):** the curve is replaced entirely by a centred card — *"Insufficient clean data for HARD. 4 clean laps, minimum 6. We are not going to guess."* Do not grey out a curve you have labelled untrustworthy. Suppress it.

---

# Screen 4 — Next Run

**Question it answers:** *So what should we do?*

```
┌───────────────────────────────────────────────────────────┐
│                                                            │
│   RECOMMENDED NEXT RUN                                     │
│                                                            │
│   ┌────────────────────────────────────────────────────┐  │
│   │   HARD × 8 laps                                     │  │
│   │                                                     │  │
│   │   Uncertainty  ±0.061  →  ±0.038   (−38%)          │  │
│   │   One-stop probability  48%  →  76%                 │  │
│   │                                                     │  │
│   │   Hard has the fewest clean long-run laps and the   │  │
│   │   widest posterior. It is the only compound still   │  │
│   │   blocking the one-stop decision.                   │  │
│   └────────────────────────────────────────────────────┘  │
│                                                            │
│   What we still don't know                                 │
│   🔴  HARD    ±0.041 s/lap   blocks: one-stop feasibility  │
│   🟡  SOFT    ±0.022 s/lap   blocks: nothing               │
│   🟢  MEDIUM  ±0.018 s/lap   —                             │
│                                                            │
└───────────────────────────────────────────────────────────┘
```

**Components:** F101 VOI recommendation · F103 strategic value · F102 knowledge gaps.

**Deliberately absent:** the full ranked list of nine candidate runs, a race simulator, an undercut calculator.

Show **one** recommendation, large. The other eight candidates are available on a "see alternatives" link that the demo never clicks. A ranked table of nine options is a worse answer than one confident answer with a reason.

The two-line before→after arrows are the most quotable thing in the product. Give them room.

---

# Drawer — "How do we know?"

Opens from a persistent header button on any screen. Slides from the right, 480px wide, dismissible on escape or backdrop click.

```
┌──────────────────────────────┐
│  HOW DO WE KNOW?          ✕  │
│                              │
│  Practice → race backtest    │
│  MAE 0.081 s/lap             │
│  8 held-out races            │
│                              │
│  Naive              0.243    │
│  Industry standard  0.187    │
│  Clamped (SOTA)     0.134    │
│  CLEANROOM          0.081    │
│                              │
│  ── Interval coverage ────   │
│  [reliability diagram]       │
│  90% intervals cover 89.4%   │
│                              │
│  ── Ablation ─────────────   │
│  − fuel estimation   +0.052  │
│  − tyre energy       +0.031  │
│  − track evolution   +0.024  │
│  − traffic           +0.011  │
└──────────────────────────────┘
```

**Components:** F81 scoreboard · F57 reliability diagram · F58 ablation.

A drawer rather than a screen because this is evidence you produce when challenged, not a place someone navigates to. It should be reachable in one click from wherever the doubt arises — which is the same reflex a good engineer has when asked "how do you know?"

---

# Story Mode (F106)

A single ▶ button in the header. Auto-advances through the four screens with one line of narration each and a 6-second hold.

| Step | Screen | Narration |
|---|---|---|
| 1 | Session | "Formula 1 practice data is contaminated. Here's how much of this session is usable." |
| 2 | Deconfound | "Every public tool assumes a fuel load nobody publishes. That assumption costs 0.31 seconds a lap." |
| 3 | Deconfound | *(slider auto-drags)* "At the industry-standard value, the hard tyre ranks fastest. That is physically impossible." |
| 4 | Curves | "Corrected: clean degradation curves on a tyre-energy clock, with credible intervals." |
| 5 | Drawer | "Validated by predicting race pace from practice alone. 0.081 seconds per lap across 8 held-out races." |
| 6 | Next Run | "And it tells you what to run next to reduce what you still don't know." |

Approximately 120 lines: a state machine, a narration array, and reuse of every existing component. No new charts.

**This is also your live-demo insurance.** If you freeze on stage, press ▶.

---

# What was consolidated

| Was | Now |
|---|---|
| 6 screens + mechanism panel | 4 screens + 1 drawer |
| Sandbagging leaderboard (own screen) | Cut from the demo path; available via "browse all sessions" |
| Mechanism panel | A tag on Screen 3 |
| Validation screen | Drawer, reachable from anywhere |
| Strategy panel | Merged into Screen 4 |
| Live replay view | A toggle on Screen 3, not a separate destination |

**Sandbagging (F71) note:** the feature stays and remains genuinely interesting, but it does not survive the "one question per screen" rule on the demo path. Keep it behind session browse. If a judge asks about it in Q&A, you have it.

---

# Build order — Day 14

Strictly in this sequence. Each is independently demoable, so if you run out of time you stop at a working state rather than a half-built one.

1. Screen 3 — Curves *(the core output; everything else supports it)*
2. Screen 2 — Deconfound waterfall *(the money shot)*
3. Screen 1 — Session + presets *(the entry point)*
4. Screen 4 — Next Run
5. Drawer — validation
6. Fuel slider interaction
7. *(Day 15 morning)* Story Mode

---

# Pre-ship checklist

- [ ] Every screen readable from three metres on a projector
- [ ] Zero horizontal scroll at 1280×720
- [ ] All four sufficiency states render correctly, including Red
- [ ] Every empty state is designed, none default
- [ ] Tabular numerals on every figure
- [ ] Full flow completes in airplane mode
- [ ] Story Mode runs start to finish without input
- [ ] No control on screen that the five-minute script does not use

---

*UI specification v1. Four screens, one drawer, one story mode.*

---

# v2 addendum — Live Simulation + fuel-load interaction

Requested after v1 shipped; overrides "four screens" above. The nav gains one
item: **Session · Deconfound · Curves · Next Run · Live Sim**. Everything else
in v1 stands.

## Screen 2 — fuel-load planner (the centre interaction)

`FuelPlanner.tsx` + `lib/runplan.ts`. One input — next-run fuel load, 10–110 kg
(FIA max, RESEARCH §2) — drives, live and from one shared store:

- expected pace (fitted 0.032 s/kg × Δload)
- tyre energy multiplier ((M+fuel)/(M+fuel_ref), RESEARCH §3) → deg s/lap
- fuel-limited run length and the soft-cliff lap (fixed energy arrives earlier
  when heavy)
- the recommended run (F101 analytic VOI, with per-lap information scaled by
  the energy multiplier squared) and the one-stop confidence

The same store is read by Screen 4, so the recommendation the judge watched
change on Screen 2 is the one they see on Screen 4. Input → model → changed
prediction → changed decision. Verified behaviour: 12 kg → HARD × 3
(fuel-blocked, −22% uncertainty); 110 kg → HARD × 12 (−51%).

## Screen 3 — driver comparison

`DriverCompare.tsx`, third view toggle (Curves · Live replay · Compare
drivers). Two drivers, same compound, fuel-corrected clean laps: deg rate,
drop-off, consistency (residual sd), laps-per-second-lost yardstick. Refuses
pairs with < 6 clean laps (F104 amber threshold). Single-session caveat stated.

## Screen 4 — consequence line

Under the recommendation: *"Without this run, there is a N% chance of choosing
the wrong pit strategy."* N = min(p, 1−p) of the one-stop probability — derived
from the EVSI fixture anchors, recomputed live from the fuel-adjusted plan.

## Screen 5 — Live Simulation

**Question it answers:** *can this analyse a race as it happens?*

Ingest (one of):
- **Demo race** — `scripts/generate_race_fixture.py`: 66-lap synthetic race
  with per-lap ground truth stored; every constant inside a published band
  (RESEARCH.md); truth overlay (◆) proves the decomposition recovers it.
- **Structured data** — CSV/JSON laps; row-numbered rejection, stated warnings
  for missing channels (rule 6). Template provided.
- **Race video** — local file; user marks lap crossings (assisted playback up
  to 4×); lap times only. Tyre wear/fuel are NOT optically recoverable
  (RESEARCH §9) and the UI says so; fuel is a typed-in declared estimate.

Engine (`lib/sim/engine.ts`): online Bayesian regression (Kalman form) over
the Heilmeier additive decomposition — base + fuel + deg·age + compound +
traffic + temp + evolution. Priors in `lib/sim/constants.ts`, every one cited
to RESEARCH.md. Per lap, live: the quotable sentence ("Lap 18 was 0.94 s
slower than lap 12: 0.53 s tyre degradation, −0.65 s fuel, …"), signed
attribution bars ±1σ with HIGH/MED/LOW confidence and PRIOR-DOMINATED flags,
one-step-ahead pace prediction with band, tyre wear vs measured stint norms,
remaining life, and a pit-window recommendation with P(optimal ≤ 3 laps) from
seeded posterior draws. Contaminated laps (pit, VSC, overtake/defence) are
excluded from the fit with the reason shown, and event costs are read from the
residual, never invented.

Honesty rules carried over: estimates are never dressed as measurements; a
coefficient still riding its prior says PRIOR; the synthetic badge and the
fixture note stay visible.

Story Mode gains two steps: the fuel-load auto-drag on Screen 2 and an
auto-loaded demo race on Screen 5 at 4× speed.
