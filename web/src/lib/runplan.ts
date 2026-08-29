"use client";

/* Shared next-run plan: the fuel-load slider on Screen 2 is the single input;
   everything derived here is read live by Screen 2 (planner readouts) and
   Screen 4 (recommendation). Input → model → changed prediction → changed
   decision, with no page-local copies of the logic.

   Every relationship below is either (a) read from the fixture posterior /
   feature payloads, or (b) a documented physical scaling with its source
   noted inline and in docs/RESEARCH.md. Nothing is a free dial invented for
   the demo. */

import { useSyncExternalStore } from "react";
import {
  COMPOUND_ORDER,
  decision,
  features,
  posterior,
  sessionMeta,
  type Compound,
} from "@/lib/data";

/* ---------------------------------------------------------------- constants */

/* Fitted fuel effect, s/kg — the coefficient CLEANROOM estimates from
   telemetry (fixture truth 0.032; the industry rule-of-thumb 0.03 is
   Baseline B, the thing we beat — CLAUDE.md v2 corrections). Published
   estimates put the real value at ~0.03–0.035 s/kg depending on circuit:
   docs/RESEARCH.md §2. */
export const FITTED_FUEL_EFFECT_S_PER_KG = 0.032;

/* 2025 minimum car mass incl. driver, kg — FIA F1 Technical Regulations
   Art. 4.1 (same source as the fixture generator's m_hat baseline). */
export const CAR_MASS_KG = 800;

/* Max race fuel 110 kg — FIA F1 Sporting Regulations fuel-mass limit;
   docs/RESEARCH.md §2. Practice runs use partial loads. */
export const FUEL_MAX_KG = 110;
export const FUEL_MIN_KG = 10;

/* Candidate run lengths — ADDITIONS.md F101 step 1 (same grid as voi.py). */
const CANDIDATE_LAPS = [5, 8, 12] as const;

/* Fuel kept unburnable / sampling margin, kg. FIA requires ~1 kg sample +
   safety margin; docs/RESEARCH.md §2. Gates which candidates are feasible. */
const FUEL_RESERVE_KG = 3;

/* ---------------------------------------------------- measured session data */

const cleanFeatures = features.filter((f) => f.clean_flag && f.E_tyre > 0);

/* Mean tyre energy per clean lap and mean fuel load in the fitted data —
   measured from the session features, never a magic constant. */
export const E_LAP_MEAN =
  cleanFeatures.reduce((a, f) => a + f.E_tyre, 0) / Math.max(cleanFeatures.length, 1);
export const FUEL_REF_KG =
  cleanFeatures.reduce((a, f) => a + f.fuel_kg, 0) / Math.max(cleanFeatures.length, 1);

/* Fuel burn per lap, kg — mean of the per-lap F31 estimates in the features
   payload (fixture: ~2.9 kg/lap, inside the 2.2–3.2 kg/lap real-consumption
   band noted in ADDITIONS.md §11). */
export const BURN_RATE_KG_LAP =
  features.reduce((a, f) => a + (f as { burn_rate_kg_lap?: number }).burn_rate_kg_lap!, 0) /
  Math.max(features.length, 1);

/* ------------------------------------------------------------------- store */

const STORAGE_KEY = "cleanroom.runplan.fuel";
const DEFAULT_FUEL_KG = 60;

let fuelKg = DEFAULT_FUEL_KG;
if (typeof window !== "undefined") {
  const saved = Number(window.sessionStorage.getItem(STORAGE_KEY));
  if (Number.isFinite(saved) && saved >= FUEL_MIN_KG && saved <= FUEL_MAX_KG) fuelKg = saved;
}

const listeners = new Set<() => void>();

export function setFuelKg(v: number) {
  fuelKg = Math.min(Math.max(v, FUEL_MIN_KG), FUEL_MAX_KG);
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(STORAGE_KEY, String(fuelKg));
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useFuelKg(): number {
  return useSyncExternalStore(
    subscribe,
    () => fuelKg,
    () => DEFAULT_FUEL_KG,
  );
}

/* ------------------------------------------------------------- derivations */

/* Energy through the tyre scales with total mass: both the kinetic energy
   dissipated under braking (½mv²) and the lateral load (m·a_lat) are linear
   in m, so E_lap(fuel) ≈ E_lap_ref × (M + fuel)/(M + fuel_ref).
   MODEL-DERIVED scaling — docs/RESEARCH.md §3. */
export function massRatio(fuel: number): number {
  return (CAR_MASS_KG + fuel) / (CAR_MASS_KG + FUEL_REF_KG);
}

export interface CompoundPlan {
  compound: Compound;
  state: "GREEN" | "AMBER" | "RED";
  /** deg s/lap at this fuel load; null when the posterior is RED (prior only) */
  degPerLap: number | null;
  degMultiplier: number;
  /** laps until the fitted cliff at this fuel load; null if no cliff accepted */
  cliffLap: number | null;
  /** longest feasible run: min(fuel-limited, candidate max) */
  maxRunLaps: number;
  /** first-lap pace at this fuel, s; null when RED */
  paceLap1: number | null;
}

export interface RunCandidate {
  compound: Compound;
  laps: number;
  feasible: boolean;
  /** why not, when infeasible */
  blockedBy: string | null;
  sigmaBefore: number;
  sigmaAfter: number;
  reduction: number;
  /** truncated by the cliff — the run stops learning the linear slope there */
  hitsCliff: boolean;
}

export interface RunPlan {
  fuelKg: number;
  paceDeltaVsRef: number; // s/lap vs the session's mean fitted fuel load
  compounds: CompoundPlan[];
  candidates: RunCandidate[];
  best: RunCandidate;
  /** P(one-stop optimal) before/after the recommended run */
  oneStopBefore: number;
  oneStopAfter: number;
  /** chance the pit-strategy call is wrong if made now / after the run */
  wrongCallNow: number;
  wrongCallAfter: number;
  reason: string;
}

/* Anchor probabilities from the Phase-6 EVSI fixture (decision.json):
   P(one-stop) 0.48 → 0.76 for the top-ranked run's full 47.6% variance
   reduction. Intermediate runs interpolate on achieved reduction — a fixture-
   anchored interpolation, labelled as such (docs/RESEARCH.md §8), not a
   measured probability. */
const P_ONE_STOP_BEFORE = decision.recommendations[0].one_stop_prob_before ?? 0.48;
const P_ONE_STOP_AFTER_MAX = decision.recommendations[0].one_stop_prob_after ?? 0.76;
const REDUCTION_MAX = decision.recommendations[0].expected_uncertainty_reduction;

export function computePlan(fuel: number): RunPlan {
  const r = massRatio(fuel);
  const sigmaResid = decision.sigma_resid_s;

  const compounds: CompoundPlan[] = COMPOUND_ORDER.map((c) => {
    const suff = sessionMeta.sufficiency[c];
    const post = posterior.compounds[c];
    const red = suff.state === "RED";

    /* Cliff arrives at fixed cumulative ENERGY, so in lap terms it arrives
       earlier when each lap puts more energy through the tyre (higher fuel). */
    const cliffLap =
      !red && post.cliff.accepted && post.cliff.knot_energy != null
        ? post.cliff.knot_energy / (E_LAP_MEAN * r)
        : null;

    const fuelLaps = Math.floor((fuel - FUEL_RESERVE_KG) / BURN_RATE_KG_LAP);
    return {
      compound: c,
      state: suff.state,
      degPerLap: red ? null : post.slope_per_lap_equiv * r,
      degMultiplier: r,
      cliffLap,
      maxRunLaps: Math.max(Math.min(fuelLaps, Math.max(...CANDIDATE_LAPS)), 0),
      paceLap1: red ? null : post.base_pace + FITTED_FUEL_EFFECT_S_PER_KG * fuel,
    };
  });

  /* Analytic VOI (ADDITIONS.md F101 speed trick): posterior precision is
     additive. Each clean lap's information about the deg slope scales with
     the square of the energy it puts through the tyre — higher fuel loads
     genuinely teach you more about degradation per lap (larger regressor
     spread), at the price of slower laps and an earlier cliff. */
  const candidates: RunCandidate[] = [];
  for (const c of COMPOUND_ORDER) {
    const suff = sessionMeta.sufficiency[c];
    const plan = compounds.find((p) => p.compound === c)!;
    /* Grid from ADDITIONS.md F101, plus the longest fuel-feasible run when
       fuel blocks the whole grid — the recommendation degrades continuously
       instead of falling off a feasibility edge. */
    const lapOptions = new Set<number>(CANDIDATE_LAPS);
    if (plan.maxRunLaps >= 3 && plan.maxRunLaps < Math.min(...CANDIDATE_LAPS)) {
      lapOptions.add(plan.maxRunLaps);
    }
    for (const laps of lapOptions) {
      const fuelNeeded = laps * BURN_RATE_KG_LAP + FUEL_RESERVE_KG;
      const feasible = fuel >= fuelNeeded;
      /* Laps past the cliff stop informing the LINEAR slope. */
      const hitsCliff = plan.cliffLap != null && laps > plan.cliffLap;
      const informativeLaps = hitsCliff ? Math.floor(plan.cliffLap!) : laps;
      const s0 = suff.sigma_s_per_lap;
      const infoPerLap = (r * r) / (sigmaResid * sigmaResid);
      const varAfter = 1 / (1 / (s0 * s0) + informativeLaps * infoPerLap);
      const sigmaAfter = Math.sqrt(varAfter);
      candidates.push({
        compound: c,
        laps,
        feasible,
        blockedBy: feasible ? null : `needs ≥ ${fuelNeeded.toFixed(0)} kg fuel`,
        sigmaBefore: s0,
        sigmaAfter,
        reduction: (s0 - sigmaAfter) / s0,
        hitsCliff,
      });
    }
  }

  /* Rank: variance reduction, weighted up when the compound blocks a
     decision (F103's decision-impact weighting, mirroring voi.py). */
  const impact = (c: Compound) =>
    decision.knowledge_gaps.find((g) => g.compound === c)?.blocks ? 2 : 1;
  const ranked = candidates
    .filter((k) => k.feasible)
    .sort((a, b) => b.reduction * impact(b.compound) - a.reduction * impact(a.compound));
  const best = ranked[0] ?? candidates.sort((a, b) => b.reduction - a.reduction)[0];

  const achieved = Math.min(best.reduction / REDUCTION_MAX, 1);
  const oneStopAfter =
    P_ONE_STOP_BEFORE + (P_ONE_STOP_AFTER_MAX - P_ONE_STOP_BEFORE) * achieved;

  const bestPlan = compounds.find((p) => p.compound === best.compound)!;
  const reasonBits = [
    decision.knowledge_gaps.find((g) => g.compound === best.compound)?.blocks
      ? `${best.compound} is still blocking the one-stop decision`
      : `${best.compound} gives the largest remaining uncertainty reduction`,
  ];
  if (fuel >= 85) {
    reasonBits.push(
      `at ${fuel.toFixed(0)} kg each lap works the tyre ${((r - 1) * 100).toFixed(0)}% harder, so a long run reads the degradation slope fastest`,
    );
  } else if (fuel <= 25) {
    reasonBits.push(
      `at ${fuel.toFixed(0)} kg only ${bestPlan.maxRunLaps} laps are possible — longer, more informative runs are fuel-blocked`,
    );
  }
  if (best.hitsCliff) {
    reasonBits.push(
      `run truncated at the fitted cliff (≈ lap ${bestPlan.cliffLap!.toFixed(0)} at this load)`,
    );
  }

  return {
    fuelKg: fuel,
    paceDeltaVsRef: FITTED_FUEL_EFFECT_S_PER_KG * (fuel - FUEL_REF_KG),
    compounds,
    candidates,
    best,
    oneStopBefore: P_ONE_STOP_BEFORE,
    oneStopAfter,
    /* If forced to call the strategy now, you pick the likelier branch and
       are wrong with probability min(p, 1-p). */
    wrongCallNow: Math.min(P_ONE_STOP_BEFORE, 1 - P_ONE_STOP_BEFORE),
    wrongCallAfter: Math.min(oneStopAfter, 1 - oneStopAfter),
    reason: reasonBits.join("; ") + ".",
  };
}

export function useRunPlan(): RunPlan {
  const fuel = useFuelKg();
  return computePlan(fuel);
}
