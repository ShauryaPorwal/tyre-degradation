/* Online lap-time decomposition engine for the Live Simulation screen.

   Method: Bayesian linear regression updated lap-by-lap (Kalman/RLS form —
   the same additive-precision idea as ADDITIONS.md F101's analytic VOI).
   Model, per the canonical additive lap-time decomposition (Heilmeier et
   al. 2020, RESEARCH §2):

     lap_time = base + k_fuel·fuel + deg_c·age_c + offset_c
              + traffic·1[gap < 2 s] + k_temp·(T − T_ref)
              + evo·(1 − e^(−lap/τ)) + noise

   Priors and every constant: lib/sim/constants.ts, each cited to
   docs/RESEARCH.md. Confidence is the posterior sd, shown numerically;
   coefficients whose variance is still mostly prior are flagged
   prior-dominated rather than presented as findings (rule 1: estimates are
   never dressed up as measurements).

   Contaminated laps (pit in/out, SC/VSC, overtake/defence events) are
   EXCLUDED from the fit with a stated reason (rule 6) — event laps are still
   decomposed so the UI can attribute their residual to the event. */

import {
  CONF_HIGH_RATIO,
  CONF_MED_RATIO,
  EVO_TAU_LAPS,
  PIT_LOSS_FALLBACK_S,
  PRIOR_DOMINATED_VAR_RATIO,
  PRIORS,
  SIGMA_NOISE_S,
  STRATEGY_DRAWS,
  STRATEGY_SEED,
  TEMP_REF_C,
  TRAFFIC_GAP_S,
  TYPICAL_STINT_LAPS,
} from "./constants";
import type { Component, Confidence, LapAnalysis, RaceData, RaceLap } from "./types";

/* Seeded RNG (mulberry32) + Box-Muller normal — all randomness seeded,
   project rule 3. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normalPair(rand: () => number): [number, number] {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  const r = Math.sqrt(-2 * Math.log(u));
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
}

interface Term {
  key: string; // feature-group key for decomposition
  label: string;
  mu0: number;
  sd0: number;
}

export class SimEngine {
  readonly race: RaceData;
  readonly compounds: string[];
  readonly terms: Term[];
  private mu: number[];
  private cov: number[][];
  private readonly priorVar: number[];
  private nClean = 0;
  private best: { lap: number; y: number; x: number[] } | null = null;
  private hasPitted = false;
  private burnEst: number | null = null;
  private lastFuel: number | null = null;

  constructor(race: RaceData) {
    this.race = race;
    this.compounds = [...new Set(race.laps.map((l) => l.compound))];
    const t: Term[] = [{ key: "base", label: "Base pace", mu0: PRIORS.basePace.mu, sd0: PRIORS.basePace.sd }];
    if (race.channels.fuel) t.push({ key: "fuel", label: "Fuel / vehicle state", mu0: PRIORS.fuelPerKg.mu, sd0: PRIORS.fuelPerKg.sd });
    for (const c of this.compounds) t.push({ key: `deg:${c}`, label: `Degradation ${c}`, mu0: PRIORS.degPerLap.mu, sd0: PRIORS.degPerLap.sd });
    for (const c of this.compounds.slice(1)) t.push({ key: `off:${c}`, label: `${c} compound offset`, mu0: PRIORS.compoundOffset.mu, sd0: PRIORS.compoundOffset.sd });
    if (race.channels.gaps) t.push({ key: "traffic", label: "Traffic (dirty air)", mu0: PRIORS.traffic.mu, sd0: PRIORS.traffic.sd });
    if (race.channels.temp) t.push({ key: "temp", label: "Track temperature", mu0: PRIORS.tempPerC.mu, sd0: PRIORS.tempPerC.sd });
    t.push({ key: "evo", label: "Track evolution", mu0: PRIORS.evolution.mu, sd0: PRIORS.evolution.sd });
    this.terms = t;
    this.mu = t.map((x) => x.mu0);
    this.priorVar = t.map((x) => x.sd0 * x.sd0);
    this.cov = t.map((_, i) => t.map((__, j) => (i === j ? this.priorVar[i] : 0)));
  }

  private features(lap: RaceLap): number[] {
    return this.terms.map((t) => {
      if (t.key === "base") return 1;
      if (t.key === "fuel") return lap.fuel_kg ?? 0;
      if (t.key.startsWith("deg:")) return lap.compound === t.key.slice(4) ? lap.tyre_age : 0;
      if (t.key.startsWith("off:")) return lap.compound === t.key.slice(4) ? 1 : 0;
      if (t.key === "traffic") return lap.gap_ahead_s != null && lap.gap_ahead_s < TRAFFIC_GAP_S ? 1 : 0;
      if (t.key === "temp") return (lap.track_temp_c ?? TEMP_REF_C) - TEMP_REF_C;
      return 1 - Math.exp(-lap.lap / EVO_TAU_LAPS); // evo
    });
  }

  private predictVar(x: number[]): number {
    let v = 0;
    for (let i = 0; i < x.length; i++)
      for (let j = 0; j < x.length; j++) v += x[i] * this.cov[i][j] * x[j];
    return v;
  }

  private update(x: number[], y: number) {
    const Px = this.cov.map((row) => row.reduce((a, v, j) => a + v * x[j], 0));
    const S = x.reduce((a, v, i) => a + v * Px[i], 0) + SIGMA_NOISE_S * SIGMA_NOISE_S;
    const resid = y - x.reduce((a, v, i) => a + v * this.mu[i], 0);
    for (let i = 0; i < x.length; i++) this.mu[i] += (Px[i] / S) * resid;
    for (let i = 0; i < x.length; i++)
      for (let j = 0; j < x.length; j++) this.cov[i][j] -= (Px[i] * Px[j]) / S;
    // enforce symmetry against float drift
    for (let i = 0; i < x.length; i++)
      for (let j = i + 1; j < x.length; j++) {
        const m = (this.cov[i][j] + this.cov[j][i]) / 2;
        this.cov[i][j] = m;
        this.cov[j][i] = m;
      }
    this.nClean += 1;
  }

  private groupIndices(): Map<string, number[]> {
    const g = new Map<string, number[]>();
    this.terms.forEach((t, i) => {
      const key = t.key.startsWith("deg:") || t.key.startsWith("off:") ? "tyre" : t.key;
      g.set(key, [...(g.get(key) ?? []), i]);
    });
    return g;
  }

  private groupLabel(key: string): string {
    return {
      base: "Base pace",
      fuel: "Fuel / vehicle state",
      tyre: "Tyre degradation",
      traffic: "Traffic (dirty air)",
      temp: "Track temperature",
      evo: "Track evolution",
    }[key] ?? key;
  }

  private confidence(value: number, pm: number): Confidence {
    const ratio = pm / Math.max(Math.abs(value), 1e-9);
    return ratio < CONF_HIGH_RATIO ? "HIGH" : ratio < CONF_MED_RATIO ? "MED" : "LOW";
  }

  private priorDominatedGroup(idx: number[]): boolean {
    // dominated until data has cut the group's prior variance in half
    const ratio =
      idx.reduce((a, i) => a + this.cov[i][i], 0) /
      idx.reduce((a, i) => a + this.priorVar[i], 0);
    return ratio > PRIOR_DOMINATED_VAR_RATIO;
  }

  private excludeReason(lap: RaceLap): string | null {
    if (lap.pit_in) return "pit in-lap — pit-lane time, not pace";
    if (lap.pit_out) return "pit out-lap — pit-lane time + cold tyres";
    if (lap.vsc || lap.sc) return "neutralised (SC/VSC) — ~140–160% of clean pace";
    if (lap.overtake) return "overtake event — excluded from fit, cost read from residual";
    if (lap.defended) return "defending event — excluded from fit, cost read from residual";
    return null;
  }

  /** Process one lap; returns the full analysis snapshot after it. */
  processLap(lap: RaceLap): LapAnalysis {
    const x = this.features(lap);
    const reason = this.excludeReason(lap);
    const isEvent = Boolean(lap.overtake || lap.defended);
    const decomposable = reason === null || isEvent;

    if (lap.pit_in) this.hasPitted = true;
    if (lap.fuel_kg != null && this.lastFuel != null && lap.fuel_kg < this.lastFuel) {
      this.burnEst = this.lastFuel - lap.fuel_kg;
    }
    if (lap.fuel_kg != null) this.lastFuel = lap.fuel_kg;

    const predicted = x.reduce((a, v, i) => a + v * this.mu[i], 0);
    const predictedPm = Math.sqrt(this.predictVar(x) + SIGMA_NOISE_S * SIGMA_NOISE_S);

    if (reason === null) this.update(x, lap.lap_time_s);

    // decomposition vs the best clean lap so far
    const groups = this.groupIndices();
    let components: Component[] = [];
    let refLap: number | null = null;
    let deltaVsRef: number | null = null;
    // Both residuals use the CURRENT posterior so the identity holds exactly:
    // delta = Σ θ_k·Δx_k + (resid_now − resid_ref)
    const residNow = lap.lap_time_s - x.reduce((a, v, i) => a + v * this.mu[i], 0);
    let residual = residNow;
    if (decomposable && this.best) {
      refLap = this.best.lap;
      deltaVsRef = lap.lap_time_s - this.best.y;
      const residRef =
        this.best.y - this.best.x.reduce((a, v, i) => a + v * this.mu[i], 0);
      residual = residNow - residRef;
      components = [...groups.entries()]
        .filter(([key]) => key !== "base")
        .map(([key, idx]) => {
          // only the terms actually moving between the two laps carry the
          // attribution — confidence and prior-dominance are judged on those
          const active = idx.filter((i) => Math.abs(x[i] - this.best!.x[i]) > 1e-9);
          const dvalue = active.reduce((a, i) => a + this.mu[i] * (x[i] - this.best!.x[i]), 0);
          let variance = 0;
          for (const i of active)
            for (const j of active)
              variance += (x[i] - this.best!.x[i]) * this.cov[i][j] * (x[j] - this.best!.x[j]);
          const pm = Math.sqrt(Math.max(variance, 0));
          return {
            key,
            label: this.groupLabel(key),
            value_s: dvalue,
            pm_s: pm,
            confidence: this.confidence(dvalue, pm),
            priorDominated: active.length > 0 && this.priorDominatedGroup(active),
          };
        })
        .filter((c) => Math.abs(c.value_s) > 1e-4 || c.pm_s > 1e-4);
    }

    // maintain the reference AFTER decomposing (a new best compares to the old)
    if (reason === null && (this.best === null || lap.lap_time_s < this.best.y)) {
      this.best = { lap: lap.lap, y: lap.lap_time_s, x: [...x] };
    }

    // one-step-ahead prediction
    let nextPredicted: number | null = null;
    let nextPredictedPm: number | null = null;
    if (lap.lap < this.race.total_laps) {
      const nx: RaceLap = {
        ...lap,
        lap: lap.lap + 1,
        tyre_age: lap.tyre_age + 1,
        fuel_kg:
          lap.fuel_kg != null ? Math.max(lap.fuel_kg - (this.burnEst ?? 0), 0) : undefined,
        pit_in: false,
        pit_out: false,
        vsc: false,
        overtake: false,
        defended: false,
      };
      const xn = this.features(nx);
      nextPredicted = xn.reduce((a, v, i) => a + v * this.mu[i], 0);
      nextPredictedPm = Math.sqrt(this.predictVar(xn) + SIGMA_NOISE_S * SIGMA_NOISE_S);
    }

    return {
      lap: lap.lap,
      lapTime: lap.lap_time_s,
      excluded: reason !== null,
      excludeReason: reason,
      refLap,
      deltaVsRef,
      components,
      residual_s: residual,
      predicted,
      predictedPm,
      nextPredicted,
      nextPredictedPm,
      tyre: this.tyreState(lap),
      strategy: this.strategy(lap),
      nCleanFitted: this.nClean,
    };
  }

  private degIndex(compound: string): number {
    return this.terms.findIndex((t) => t.key === `deg:${compound}`);
  }

  private tyreState(lap: RaceLap) {
    const i = this.degIndex(lap.compound);
    const degRate = this.mu[i];
    const degRatePm = Math.sqrt(Math.max(this.cov[i][i], 0));
    const typical = TYPICAL_STINT_LAPS[lap.compound] ?? 25;
    return {
      wearPct: Math.min((lap.tyre_age / typical) * 100, 130),
      remainingLaps: Math.max(typical - lap.tyre_age, 0),
      degRate,
      degRatePm,
      projLossIn5: degRate * 5,
    };
  }

  /* Pit-strategy search: for each candidate pit lap p, total degradation +
     offset + pit-loss cost to the flag under the fitted linear deg model;
     probability over seeded posterior draws (diagonal approximation — stated
     simplification; a full covariance draw belongs to Phase 6). */
  private strategy(lap: RaceLap) {
    const total = this.race.total_laps;
    const remaining = total - lap.lap;
    const pitLoss = this.race.pit_loss_s ?? PIT_LOSS_FALLBACK_S;
    const others = this.compounds.filter((c) => c !== lap.compound);
    const target =
      others.length > 0
        ? others.reduce((a, b) => (this.mu[this.degIndex(a)] <= this.mu[this.degIndex(b)] ? a : b))
        : lap.compound;
    if (remaining <= 1) {
      return {
        optimalPitLap: null, windowLo: null, windowHi: null, pitNowProb: 0,
        targetCompound: null, reason: "Race over — no strategy left to run.",
      };
    }

    const iCur = this.degIndex(lap.compound);
    const iTar = this.degIndex(target);
    const iOff = this.terms.findIndex((t) => t.key === `off:${target}`);
    const curOffIdx = this.terms.findIndex((t) => t.key === `off:${lap.compound}`);

    const costForPit = (p: number, degCur: number, degTar: number, dOffset: number): number => {
      // laps lap.lap+1..p on current tyre, then p+1..total on target tyre
      let cost = 0;
      for (let j = 1; j <= p - lap.lap; j++) cost += degCur * (lap.tyre_age + j);
      if (p < total) {
        cost += pitLoss + dOffset * (total - p);
        for (let j = 1; j <= total - p; j++) cost += degTar * j;
      }
      return cost;
    };

    const offTar = iOff >= 0 ? this.mu[iOff] : 0;
    const offCur = curOffIdx >= 0 ? this.mu[curOffIdx] : 0;
    const dOffset = offTar - offCur;

    // stay-out allowed only after the mandatory compound change (FIA sporting
    // regs: two dry compounds per race)
    const pMin = lap.lap + 1;
    const pMax = this.hasPitted ? total : total - 1;
    let bestP = pMin;
    let bestCost = Infinity;
    const costs: number[] = [];
    for (let p = pMin; p <= pMax; p++) {
      const c = costForPit(p, this.mu[iCur], this.mu[iTar], dOffset);
      costs.push(c);
      if (c < bestCost) {
        bestCost = c;
        bestP = p;
      }
    }
    // window: candidate pit laps within 1.0 s of optimal
    let lo = bestP;
    let hi = bestP;
    costs.forEach((c, k) => {
      const p = pMin + k;
      if (c <= bestCost + 1.0) {
        lo = Math.min(lo, p);
        hi = Math.max(hi, p);
      }
    });

    // P(optimal pit within the next 3 laps), seeded posterior draws
    const rand = mulberry32(STRATEGY_SEED + lap.lap);
    let hits = 0;
    for (let d = 0; d < STRATEGY_DRAWS; d += 2) {
      const [z1, z2] = normalPair(rand);
      for (const z of [z1, z2]) {
        const degCur = this.mu[iCur] + z * Math.sqrt(Math.max(this.cov[iCur][iCur], 0));
        const [z3] = normalPair(rand);
        const degTar =
          iTar === iCur ? degCur : this.mu[iTar] + z3 * Math.sqrt(Math.max(this.cov[iTar][iTar], 0));
        let dBest = pMin;
        let dCost = Infinity;
        for (let p = pMin; p <= pMax; p++) {
          const c = costForPit(p, degCur, degTar, dOffset);
          if (c < dCost) {
            dCost = c;
            dBest = p;
          }
        }
        // staying to the flag (p = total, only legal once pitted) is not a stop
        const isStay = this.hasPitted && dBest === total;
        if (!isStay && dBest <= lap.lap + 3) hits++;
      }
    }
    const pitNowProb = hits / (Math.ceil(STRATEGY_DRAWS / 2) * 2);

    const stayOut = bestP === total && this.hasPitted;
    return {
      optimalPitLap: stayOut ? null : bestP,
      windowLo: stayOut ? null : lo,
      windowHi: stayOut ? null : Math.min(hi, total - 1),
      pitNowProb,
      targetCompound: stayOut ? null : target,
      reason: stayOut
        ? `Fitted degradation (${this.mu[iCur].toFixed(3)} s/lap) does not repay another ${pitLoss.toFixed(1)} s stop before the flag.`
        : `Balance of ${this.mu[iCur].toFixed(3)} s/lap current degradation vs a ${pitLoss.toFixed(1)} s stop and ${target}'s fresh-tyre curve.`,
    };
  }
}
