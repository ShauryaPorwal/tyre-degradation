/* Pit-strategy search, extracted from SimEngine so the optimisation and the
   seeded Monte Carlo loop are pure, unit-testable functions (Phase 6
   simplification: diagonal posterior approximation — stated, see engine.ts).

   Inputs are plain numbers (posterior means/sds for current and target tyre),
   so nothing here depends on engine state. All randomness is seeded (rule 3). */

export interface PitContext {
  currentLap: number; // lap just completed
  tyreAge: number; // age of the current tyre at currentLap
  totalLaps: number;
  hasPitted: boolean;
  pitLoss: number; // s
  dOffset: number; // target compound offset minus current offset, s
}

/* Seeded RNG (mulberry32) + Box-Muller normal — all randomness seeded,
   project rule 3. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalPair(rand: () => number): [number, number] {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  const r = Math.sqrt(-2 * Math.log(u));
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
}

/* Total degradation + offset + pit-loss cost if we pit on lap p: laps
   currentLap+1..p on the current tyre, then p+1..total on the target tyre.
   Pure — no engine state. */
export function costForPit(
  p: number,
  ctx: PitContext,
  degCur: number,
  degTar: number,
): number {
  let cost = 0;
  for (let j = 1; j <= p - ctx.currentLap; j++) cost += degCur * (ctx.tyreAge + j);
  if (p < ctx.totalLaps) {
    cost += ctx.pitLoss + ctx.dOffset * (ctx.totalLaps - p);
    for (let j = 1; j <= ctx.totalLaps - p; j++) cost += degTar * j;
  }
  return cost;
}

export interface PitWindow {
  bestP: number;
  bestCost: number;
  lo: number;
  hi: number;
}

/* Deterministic search over candidate pit laps pMin..pMax; the window is
   every candidate within 1.0 s of the optimum. Pure. */
export function findOptimalPit(
  pMin: number,
  pMax: number,
  ctx: PitContext,
  degCur: number,
  degTar: number,
): PitWindow {
  let bestP = pMin;
  let bestCost = Infinity;
  const costs: number[] = [];
  for (let p = pMin; p <= pMax; p++) {
    const c = costForPit(p, ctx, degCur, degTar);
    costs.push(c);
    if (c < bestCost) {
      bestCost = c;
      bestP = p;
    }
  }
  let lo = bestP;
  let hi = bestP;
  costs.forEach((c, k) => {
    const p = pMin + k;
    if (c <= bestCost + 1.0) {
      lo = Math.min(lo, p);
      hi = Math.max(hi, p);
    }
  });
  return { bestP, bestCost, lo, hi };
}

/* P(optimal pit within the next 3 laps), over seeded posterior draws of the
   two degradation rates (independent normals — diagonal approximation).
   Pure given the seed. */
export function estimatePitNowProb(
  pMin: number,
  pMax: number,
  ctx: PitContext,
  muCur: number,
  sdCur: number,
  muTar: number,
  sdTar: number | null, // null => perfectly correlated with the current tyre draw
  seed: number,
  draws: number,
): number {
  const rand = mulberry32(seed);
  let hits = 0;
  for (let d = 0; d < draws; d += 2) {
    const [z1, z2] = normalPair(rand);
    for (const z of [z1, z2]) {
      const degCur = muCur + z * Math.max(sdCur, 0);
      const degTar =
        sdTar === null ? degCur : muTar + normalPair(rand)[0] * Math.max(sdTar, 0);
      let dBest = pMin;
      let dCost = Infinity;
      for (let p = pMin; p <= pMax; p++) {
        const c = costForPit(p, ctx, degCur, degTar);
        if (c < dCost) {
          dCost = c;
          dBest = p;
        }
      }
      // staying to the flag (p = total, only legal once pitted) is not a stop
      const isStay = ctx.hasPitted && dBest === ctx.totalLaps;
      if (!isStay && dBest <= ctx.currentLap + 3) hits++;
    }
  }
  return hits / (Math.ceil(draws / 2) * 2);
}
