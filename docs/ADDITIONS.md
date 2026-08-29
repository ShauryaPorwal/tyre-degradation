# CLEANROOM — Approved Additions (v2)

Features added after review of the feature-suggestion document.
Companion to `SPEC.md`, `FEATURES.md`, `STACK.md`.

---

## Summary

Nine features were proposed as the core build. Six were already in the register. Three were not, and they are the strongest ideas in the document. Those three plus four of my own recommendations are added below as **F101–F107**.

| ID | Feature | Source | Cost | Priority |
|---|---|---|---|---|
| F101 | Next-Best-Run recommendation (Value of Information) | Your doc #7 | 1 day | **P1** |
| F102 | Knowledge-Gap Detector | Your doc #8 | 0.5 day | **P1** |
| F103 | Expected Strategic Value (EVSI) | Your doc #9 | 0.5 day | P2 |
| F104 | Data Sufficiency Meter (UI surface) | Your doc #6 | 2 hours | **P1** |
| F105 | Session Health Score | My recommendation | 2 hours | **P1** |
| F106 | Story Mode (guided demo) | My recommendation | 0.5 day | **P1** |
| F107 | Curated session presets | My recommendation | 1 hour | **P0** |

**Total added cost: ~3 days.** Offset by cutting four P2 features (listed in §9).

---

## F101 — Next-Best-Run Recommendation (Value of Information)

**Priority: P1 · Cost: 1 day · Phase 6 (Day 13) · Depends on: F45**

### What it is

Bayesian experimental design applied to practice running. Instead of only describing what the data says, the system evaluates candidate future runs and recommends the one that reduces uncertainty most.

> *"Current Medium degradation: 0.09 ± 0.06 s/lap. Confidence LOW. Run 8 laps on Hard — expected uncertainty reduction 38%."*

### Why it earns its place

This is the single largest framing upgrade available to the project. It moves the product from **analytics dashboard** (describes the past) to **decision engine** (tells you what to do next). In a five-minute pitch that shift is worth more than three additional analysis screens.

It is also correctly aligned with what practice sessions actually are: a fixed, scarce budget of running, where the real question a race engineer faces is *"what do we still not know, and what run answers it?"*

It is only possible because the model is Bayesian. This is a strong retroactive justification for the modelling choice — worth saying out loud in the pitch.

### How to implement

```
1. Define candidate runs:  {SOFT, MEDIUM, HARD} × {5, 8, 12 laps}  →  9 candidates
2. For each candidate (compound c, n laps):
     a. Draw theta* from the current posterior over the deg slope for c
     b. Simulate n synthetic clean laps from the posterior predictive
     c. Update the posterior
     d. Record Var_after(theta_c)
3. Expected variance reduction = E[ Var_before - Var_after ] over draws
4. Rank candidates by reduction. Return top 3.
```

**Speed trick — do not refit with NUTS.** For a linear-Gaussian slope term, posterior precision is additive:

```
Var_after ≈ ( 1/Var_before + n / sigma_resid² )⁻¹
```

Use the analytic form for the live UI (instant), and validate it once against a full Monte Carlo refit offline. Document both. This keeps the feature responsive without a job queue.

### Output contract

```json
{
  "recommendations": [
    {
      "compound": "HARD",
      "laps": 8,
      "expected_uncertainty_reduction": 0.38,
      "current_sigma": 0.061,
      "projected_sigma": 0.038,
      "reason": "Hard has the fewest clean long-run laps and the widest posterior."
    }
  ]
}
```

### Honest limitation — state this in the report

VOI is only as trustworthy as the posterior beneath it. If the degradation model is wrong, the recommendation is confidently wrong. Unlike the backtest, a VOI recommendation cannot be proven correct in a demo.

**Consequence for the pitch:** lead with the validated backtest number. Use VOI as the closing move, not the opening claim.

---

## F102 — Knowledge-Gap Detector

**Priority: P1 · Cost: 0.5 day · Phase 6 · Depends on: F101**

### What it is

The same computation as F101, presented from the opposite direction: not "what should we run" but "what do we not know, and does it matter?"

> *Hard compound — insufficient long-run evidence. Uncertainty ±0.041 s/lap. Blocks: one-stop feasibility. Strategic impact HIGH.*

### Why it earns its place

Nearly free once F101 exists — it is a different view of the same posterior widths. It builds trust by making the system's ignorance explicit, which is unusual and memorable. Most hackathon projects only ever assert; a system that says *"I don't know this, and here's why it matters"* reads as mature.

### How to implement

For each compound: posterior width, clean-lap count, and which downstream decision the width leaves ambiguous. Rank by decision impact, not by width alone. Reuses F52's confidence gate thresholds.

---

## F103 — Expected Strategic Value (EVSI)

**Priority: P2 · Cost: 0.5 day · Phase 6 · Depends on: F101, F65**

### What it is

Expected Value of Sample Information. Weight information gain by whether it actually changes a decision.

> *Hard uncertainty ↓35% → one-stop probability moves 48% → 76%.*

Learning something precisely is worthless if it does not move a decision. This ranks candidate runs by **decision impact**, not raw variance reduction.

### Why it earns its place

It is the intellectually correct version of F101 and it takes half a day once the stint simulator exists. It also produces the single most quotable line in the demo, because it connects a statistical quantity to a race outcome in one sentence.

### How to implement

```
P_before = P(one-stop is optimal | current posterior)      # via F65 Monte Carlo
P_after  = P(one-stop is optimal | posterior after run)    # same sim, updated posterior
strategic_value = |P_after - P_before|
rank candidates by  (variance_reduction × strategic_value)
```

**Cut this first if the schedule slips.** F101 alone carries the narrative.

---

## F104 — Data Sufficiency Meter

**Priority: P1 · Cost: 2 hours · Phase 7 · Depends on: F52**

### What it is

Per-compound traffic light: green / amber / red, based on clean-lap count, residual variance, and posterior width.

### Why it earns its place

The logic already existed as the confidence gate (F52) but had **no visible surface**. That was a genuine gap. A traffic light is the fastest possible way for a non-technical judge to understand that this system knows the limits of its own evidence. Two hours of work for a disproportionate legibility gain.

### Thresholds

| State | Condition |
|---|---|
| 🟢 Green | ≥12 clean laps AND posterior sigma < 0.02 s/lap |
| 🟡 Amber | ≥6 clean laps AND posterior sigma < 0.05 s/lap |
| 🔴 Red | Below amber → emit `INSUFFICIENT_DATA`, suppress the curve |

Red must **suppress the degradation curve entirely**, not display it greyed out. Showing a number you have labelled untrustworthy undermines the whole point.

---

## F105 — Session Health Score

**Priority: P1 · Cost: 2 hours · Phase 7 · My recommendation**

### What it is

One number, 0–100, at the top of the landing screen. Combines clean-lap yield, compound coverage, traffic contamination rate, and session completeness.

### Why it earns its place

Judges arriving at a dashboard need an immediate answer to *"what am I looking at and can I trust it?"* A single headline number answers that in under a second, before any chart is parsed. It also gives you a natural way to explain the exclusion ledger without showing a table of filter counts.

### Formula

```
health = 100 × ( 0.4 · clean_lap_yield
               + 0.3 · compound_coverage      # fraction of compounds with ≥6 clean laps
               + 0.2 · (1 - traffic_rate)
               + 0.1 · session_completeness )
```

Show the four components on hover. Do not show them by default.

---

## F106 — Story Mode

**Priority: P1 · Cost: 0.5 day · Phase 7 · My recommendation**

### What it is

A single button that auto-advances through the narrative: broken baseline → deconfounding → clean curves → validation → next-run recommendation. Each step holds for a few seconds with one line of narration.

### Why it earns its place

This directly solves the biggest UI risk in the project. A judge with five minutes and no domain context will not discover your best work by clicking around a navigation bar. Story Mode guarantees they see the argument in the intended order.

It is also your **live-demo insurance**: if you freeze on stage, press the button and let it run.

Approximately 120 lines of state machine plus a narration array. Reuses every existing component. No new charts.

---

## F107 — Curated Session Presets

**Priority: P0 · Cost: 1 hour · Phase 7 · My recommendation**

### What it is

Four named, hand-picked sessions on the landing screen instead of a dropdown of ninety-six.

| Preset | Purpose |
|---|---|
| **The Broken Baseline** | A session where naive fitting gives a negative slope |
| **The Clean Case** | High health score, all three compounds, clear cliff |
| **The Hard Case** | Low health score — demonstrates the confidence gate firing |
| **The Validated Case** | A weekend where practice→race backtest error is smallest |

### Why it earns its place

Three reasons, all practical. It removes a cluttered dropdown from the landing screen. It guarantees the demo lands on data you have already verified. And it lets you show the system **refusing to answer** on The Hard Case — which is a feature, not an embarrassment, and almost no competing project will demonstrate it.

Keep a full session search behind a secondary link for anyone who wants to explore.

---

## §9 — What gets cut to fund this

Three days added, so three days come out. All from P2:

| Cut | ID | Reasoning |
|---|---|---|
| Undercut/overcut evaluator | F68 | Not novel; acknowledged as such in the source document |
| Kalman incremental refit | F75 | Live replay (F82) works fine on precomputed per-lap posteriors |
| Cross-circuit compound priors | F54 | Marginal accuracy gain, meaningful sampler complexity |
| Mechanism panel as a screen | F83 | Keep F49's classifier; surface it as a **label** on the degradation curve, not a dedicated screen |

F49 stays. Only its screen goes — the mechanism becomes a small tag next to the curve ("thermal · recovers on cooling laps").

---

## §10 — Revised schedule

| Day | Change |
|---|---|
| 1–12 | Unchanged |
| 13 | Decision layer + **F101, F102, F103** (VOI needs the posterior, so it must follow Day 12) |
| 14 | Frontend + **F104, F105, F107** |
| 15 | **F106 Story Mode** in the morning, then rehearsals. No other code. |

Story Mode moves to Day 15 deliberately — it is built from finished components, so it cannot be built earlier, and it is the last thing that improves the demo.

---

## §11 — Two errors in the source document

Flagged because handing that document to a coding agent unmodified will reproduce them.

### Error 1 — the fuel correction contradicts itself

The document states early: *"use a transparent estimated/relative fuel model; do not claim exact fuel mass."* Correct.

The implementation table then states: *"use a constant fuel effect per lap (0.03 s/kg × ~1.5 kg/lap)."*

That constant **is** the industry baseline that produces the negative degradation slope — it is the thing this project exists to beat, and it is already in the register as Baseline B (F40). Additionally, 1.5 kg/lap is wrong: real F1 consumption is roughly 2.2–3.2 kg/lap depending on circuit.

**Use F27–F31.** Estimate mass from longitudinal acceleration. Keep the constant only as the baseline you outperform.

### Error 2 — track evolution must not be subtracted in pre-processing

The document states: *"pool all drivers' best laps per lap number, fit a linear/spline trend, subtract it from each car's time."*

Subtracting a fitted trend before the main regression biases every downstream coefficient. The removed variance is correlated with both tyre age and fuel mass, so the model can no longer attribute effects correctly. This is a statistical error, not a stylistic preference.

**Use F47.** Track evolution is a monotone spline term estimated *inside* the joint model, identifiable because all twenty cars observe the same track simultaneously.

---

*Approved additions v2. F101–F107.*
