/* Unit tests for the extracted pit-strategy search (pure functions).
   Run: npx tsx --test src/lib/sim/strategy.test.ts  (from web/) */

import { describe, it, expect } from "vitest";
import {
  costForPit,
  estimatePitNowProb,
  findOptimalPit,
  mulberry32,
  normalPair,
  type PitContext,
} from "./strategy";

const ctx: PitContext = {
  currentLap: 20,
  tyreAge: 10,
  totalLaps: 57,
  hasPitted: false,
  pitLoss: 22,
  dOffset: 0.1,
};

it("mulberry32 is deterministic for the same seed", () => {
  const a = mulberry32(47);
  const b = mulberry32(47);
  for (let i = 0; i < 100; i++) expect(a()).toBe(b());
});

it("normalPair produces standard-normal-ish draws", () => {
  const rand = mulberry32(1);
  let sum = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) sum += normalPair(rand)[0];
  const mean = sum / n;
  expect(Math.abs(mean)).toBeLessThan(0.05);
});

it("costForPit excludes pit loss when p = total (no stop)", () => {
  const stop = costForPit(30, ctx, 0.15, 0.02);
  const flag = costForPit(57, ctx, 0.15, 0.02);
  // fresh target tyre with far lower deg makes stopping cheaper than running on
  expect(stop).toBeLessThan(flag); // stop onto fresh rubber beats running to the flag
  // and the no-stop cost is insensitive to pit loss by construction
  expect(costForPit(57, { ...ctx, pitLoss: 22 }, 0.15, 0.02)).toBe(
    costForPit(57, { ...ctx, pitLoss: 40 }, 0.15, 0.02),
  );
});

it("costForPit is increasing in pit loss", () => {
  const a = costForPit(30, { ...ctx, pitLoss: 20 }, 0.05, 0.05);
  const b = costForPit(30, { ...ctx, pitLoss: 25 }, 0.05, 0.05);
  expect(b - a).toBeCloseTo(5, 6);
});

it("high current degradation favours an early pit", () => {
  const degenerating = findOptimalPit(21, 56, ctx, 0.15, 0.05);
  const staying = findOptimalPit(21, 56, ctx, 0.05, 0.05);
  expect(degenerating.bestP as number).toBeLessThan(staying.bestP as number);
});

it("window always contains the optimum and every member is within 1.0 s", () => {
  const w = findOptimalPit(21, 56, ctx, 0.12, 0.04);
  expect(w.lo <= w.bestP && w.bestP <= w.hi).toBe(true);
  for (let p = w.lo; p <= w.hi; p++)
    expect(costForPit(p, ctx, 0.12, 0.04)).toBeLessThanOrEqual(w.bestCost + 1.0 + 1e-9);
});

it("estimatePitNowProb is in [0,1] and deterministic", () => {
  const p1 = estimatePitNowProb(21, 56, ctx, 0.12, 0.05, 0.04, 0.05, 47, 200);
  const p2 = estimatePitNowProb(21, 56, ctx, 0.12, 0.05, 0.04, 0.05, 47, 200);
  expect(p1).toBe(p2);
  expect(p1).toBeGreaterThanOrEqual(0);
  expect(p1).toBeLessThanOrEqual(1);
});

it("probability of pitting now rises as the race nears the flag", () => {
  const early: PitContext = { ...ctx, currentLap: 10, tyreAge: 5 };
  const late: PitContext = { ...ctx, currentLap: 54, tyreAge: 20 };
  const pEarly = estimatePitNowProb(11, 56, early, 0.12, 0.05, 0.04, 0.05, 47, 200);
  const pLate = estimatePitNowProb(55, 56, late, 0.12, 0.05, 0.04, 0.05, 47, 200);
  expect(pLate).toBeGreaterThanOrEqual(pEarly);
});

it("perfectly-correlated same-tyre draw (sdTar null) runs and is deterministic", () => {
  const p1 = estimatePitNowProb(21, 56, ctx, 0.08, 0.05, 0.08, null, 47, 200);
  const p2 = estimatePitNowProb(21, 56, ctx, 0.08, 0.05, 0.08, null, 47, 200);
  expect(p1).toBe(p2);
  expect(p1).toBeGreaterThanOrEqual(0);
  expect(p1).toBeLessThanOrEqual(1);
});
