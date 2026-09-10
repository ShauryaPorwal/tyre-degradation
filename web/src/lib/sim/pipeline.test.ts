/* Pipeline tests for the Live Simulation input → resolve → engine chain.
   Covers: complete input, partial input, missing tyre age, new/used tyres,
   pit reset, compound change, lap progression, restart determinism,
   unavailable channels, and the engine's invalid-state gate. */

import { describe, it, expect } from "vitest";
import { parseRaceInput, raceFromVideoMarks } from "./parse";
import { resolveRaceInput } from "./resolve";
import { SimEngine } from "./engine";
import type { RaceData, RaceLap } from "./types";

function makeRace(laps: Partial<RaceLap>[], totalLaps?: number): RaceData {
  return {
    race_id: "t",
    display_name: "t",
    synthetic: false,
    total_laps: totalLaps ?? laps.length,
    driver: "T",
    laps: laps as RaceLap[],
    channels: { fuel: true, gaps: false, temp: false },
    source: "structured",
  };
}

const FULL_CSV = `lap,lap_time_s,compound,tyre_age,fuel_kg
1,80.5,MEDIUM,0,105
2,80.4,MEDIUM,1,103.4
3,80.6,MEDIUM,2,101.7`;

describe("complete input", () => {
  it("parses and preserves every supplied value", () => {
    const r = parseRaceInput(FULL_CSV, "t");
    expect(r.errors).toHaveLength(0);
    expect(r.data!.laps[0].tyre_age).toBe(0);
    expect(r.data!.laps[2].fuel_kg).toBeCloseTo(101.7);
    expect(r.data!.laps[2].compound).toBe("MEDIUM");
  });
});

describe("partial input (only fuel + lap context)", () => {
  it("resolves missing tyre age from stint history and flags provenance", () => {
    const r = parseRaceInput(
      "lap,lap_time_s,fuel_kg\n1,80.5,105\n2,80.4,103.4\n3,80.6,101.7",
      "t",
    );
    // compound is a required column — explicit error, never a silent guess
    expect(r.data).toBeNull();
    expect(r.errors.join(" ")).toMatch(/compound/);
  });

  it("fills fuel from declared start/burn with model provenance", () => {
    const res = resolveRaceInput([
      { lap: 1, lap_time_s: 80, compound: "MEDIUM", tyre_age: 0 },
      { lap: 2, lap_time_s: 80, compound: "MEDIUM", tyre_age: 1 },
    ], { declaredStartFuelKg: 100, declaredBurnKgLap: 1.5 });
    expect(res.laps[0].fuel_kg).toBeCloseTo(100);
    expect(res.laps[1].fuel_kg).toBeCloseTo(98.5);
    expect(res.laps[1].prov.fuel_kg.source).toBe("model");
  });
});

describe("tyre age", () => {
  it("missing tyre age is lap-counted within a stint (0,1,2,…)", () => {
    const res = resolveRaceInput([
      { lap: 1, lap_time_s: 80, compound: "MEDIUM" },
      { lap: 2, lap_time_s: 80, compound: "MEDIUM" },
      { lap: 3, lap_time_s: 80, compound: "MEDIUM" },
    ]);
    expect(res.laps.map((l) => l.tyre_age)).toEqual([0, 1, 2]);
    expect(res.laps[2].prov.tyre_age.source).toBe("derived");
    expect(res.laps[2].prov.tyre_age.confidence).toBe(1);
  });

  it("resets to 0 after a pit stop (pit_in on previous lap)", () => {
    const res = resolveRaceInput([
      { lap: 19, lap_time_s: 80, compound: "MEDIUM", tyre_age: 0 },
      { lap: 20, lap_time_s: 80, compound: "MEDIUM" }, // age 1
      { lap: 21, lap_time_s: 102, compound: "MEDIUM", pit_in: true },
      { lap: 22, lap_time_s: 82, compound: "HARD", pit_out: true },
      { lap: 23, lap_time_s: 80, compound: "HARD" },
    ]);
    expect(res.laps[1].tyre_age).toBe(1);
    expect(res.laps[3].tyre_age).toBe(0);
    expect(res.laps[4].tyre_age).toBe(1);
    expect(res.laps[3].prov.tyre_age.note).toMatch(/pit/i);
  });

  it("resets on a compound change even without pit flags (used tyre preserved otherwise)", () => {
    const res = resolveRaceInput([
      { lap: 1, lap_time_s: 80, compound: "SOFT" },
      { lap: 2, lap_time_s: 80, compound: "SOFT" },
      { lap: 3, lap_time_s: 80, compound: "HARD" },
      { lap: 4, lap_time_s: 80, compound: "HARD" },
    ]);
    expect(res.laps.map((l) => l.tyre_age)).toEqual([0, 1, 0, 1]);
  });

  it("supplied tyre age is kept and continues forward", () => {
    const res = resolveRaceInput([
      { lap: 1, lap_time_s: 80, compound: "MEDIUM", tyre_age: 5 },
      { lap: 2, lap_time_s: 80, compound: "MEDIUM" },
    ]);
    expect(res.laps[0].prov.tyre_age.source).toBe("user");
    expect(res.laps[1].tyre_age).toBe(6); // continues from the supplied value
  });
});

describe("engine", () => {
  it("produces finite output on complete input and updates tyre/fuel/lap per lap", () => {
    const race = makeRace([
      { lap: 1, lap_time_s: 80.5, compound: "MEDIUM", tyre_age: 0, fuel_kg: 105 },
      { lap: 2, lap_time_s: 80.4, compound: "MEDIUM", tyre_age: 1, fuel_kg: 103.4 },
      { lap: 3, lap_time_s: 80.6, compound: "MEDIUM", tyre_age: 2, fuel_kg: 101.7 },
      { lap: 4, lap_time_s: 80.7, compound: "MEDIUM", tyre_age: 3, fuel_kg: 100.1 },
    ]);
    const eng = new SimEngine(race);
    const a = race.laps.map((l) => eng.processLap(l));
    for (const a2 of a) {
      expect(Number.isFinite(a2.predicted)).toBe(true);
      if (a2.nextPredicted != null) expect(Number.isFinite(a2.nextPredicted)).toBe(true);
    }
    expect(a[3].tyre.wearPct).toBeGreaterThan(a[0].tyre.wearPct);
    expect(a[1].nextPredicted!).toBeLessThan(a[0].nextPredicted!); // fuel burn-off
  });

  it("runs on partial input resolved by the resolver (tyre age derived)", () => {
    const race = makeRace(
      resolveRaceInput([
        { lap: 1, lap_time_s: 80.5, compound: "MEDIUM" },
        { lap: 2, lap_time_s: 80.4, compound: "MEDIUM" },
        { lap: 3, lap_time_s: 80.6, compound: "MEDIUM" },
        { lap: 4, lap_time_s: 80.7, compound: "MEDIUM" },
        { lap: 5, lap_time_s: 80.6, compound: "MEDIUM" },
        { lap: 6, lap_time_s: 80.8, compound: "MEDIUM" },
        { lap: 7, lap_time_s: 80.7, compound: "MEDIUM" },
      ]).laps,
    );
    const eng = new SimEngine(race);
    const a = race.laps.map((l) => eng.processLap(l));
    expect(Number.isFinite(a[6].predicted)).toBe(true);
    expect(a[6].lapTime).toBeGreaterThan(0);
  });

  it("fails gracefully with a precise diagnostic when tyre age is unresolvable (NaN)", () => {
    const race = makeRace([
      { lap: 1, lap_time_s: 80.5, compound: "MEDIUM", tyre_age: NaN },
    ]);
    const eng = new SimEngine(race);
    const a = eng.processLap(race.laps[0]);
    expect(a.excluded).toBe(true);
    expect(a.excludeReason).toMatch(/tyre age unavailable/i);
    expect(Number.isFinite(a.predicted)).toBe(true); // no NaN poisoning
  });

  it("missing compound yields a precise diagnostic, not nonsense", () => {
    const race = makeRace([{ lap: 1, lap_time_s: 80.5, compound: "", tyre_age: 0 }]);
    const a = new SimEngine(race).processLap(race.laps[0]);
    expect(a.excluded).toBe(true);
    expect(a.excludeReason).toMatch(/compound missing/i);
  });

  it("restart is deterministic: two engines over the same laps agree", () => {
    const race = makeRace(
      resolveRaceInput([
        { lap: 1, lap_time_s: 80.5, compound: "MEDIUM", pit_in: false },
        { lap: 2, lap_time_s: 80.4, compound: "MEDIUM" },
        { lap: 3, lap_time_s: 102, compound: "MEDIUM", pit_in: true },
        { lap: 4, lap_time_s: 82.1, compound: "HARD", pit_out: true },
        { lap: 5, lap_time_s: 80.9, compound: "HARD" },
        { lap: 6, lap_time_s: 80.8, compound: "HARD" },
        { lap: 7, lap_time_s: 80.9, compound: "HARD" },
      ]).laps,
    );
    const run = () => {
      const eng = new SimEngine(race);
      return race.laps.map((l) => eng.processLap(l)).map((a) => a.predicted);
    };
    expect(run()).toEqual(run());
  });
});

describe("unavailable channels", () => {
  it("no fuel anywhere → fuel stays undefined and the engine still runs", () => {
    const res = resolveRaceInput([
      { lap: 1, lap_time_s: 80, compound: "MEDIUM", tyre_age: 0 },
      { lap: 2, lap_time_s: 80, compound: "MEDIUM", tyre_age: 1 },
    ]);
    expect(res.laps[0].fuel_kg).toBeUndefined();
    expect(res.laps[1].prov.fuel_kg.source).toBe("unavailable");
    const race = makeRace(res.laps);
    race.channels.fuel = false;
    const eng = new SimEngine(race);
    const a = race.laps.map((l) => eng.processLap(l));
    expect(Number.isFinite(a[1].predicted)).toBe(true);
  });
});

describe("video path (raceFromVideoMarks)", () => {
  const MARKS = [0, 81.2, 162.5, 243.9, 325.1, 406.4];

  it("partial video input: no fuel declared → fuel channel OFF, tyre age derived from declared pit lap", () => {
    const res = raceFromVideoMarks(MARKS, {
      compound: "MEDIUM",
      secondCompound: null,
      pitAfterLap: 3,
      startFuelKg: null,
      burnKgLap: null,
    });
    expect(res.data).not.toBeNull();
    const laps = res.data!.laps;
    // tyre age: 0,1,2 (pre-pit), 0,1 (post-pit; 6 marks = 5 laps)
    expect(laps.map((l) => l.tyre_age)).toEqual([0, 1, 2, 0, 1]);
    expect(laps[2].pit_in).toBe(true);
    expect(laps[3].pit_out).toBe(true);
    expect(laps[3].tyre_age).toBe(0);
    // no fuel declared: channel off, no fabricated fuel values
    expect(res.data!.channels.fuel).toBe(false);
    expect(laps.every((l) => l.fuel_kg == null)).toBe(true);
    expect(res.data!.note).toMatch(/No fuel declared/);
  });

  it("video input with declared fuel + compound change: fuel path and compound switch at the pit", () => {
    const res = raceFromVideoMarks(MARKS, {
      compound: "MEDIUM",
      secondCompound: "HARD",
      pitAfterLap: 3,
      startFuelKg: 60,
      burnKgLap: 1.5,
    });
    expect(res.data).not.toBeNull();
    const laps = res.data!.laps;
    expect(res.data!.channels.fuel).toBe(true);
    expect(laps[0].fuel_kg).toBeCloseTo(60);
    expect(laps[1].fuel_kg).toBeCloseTo(58.5);
    expect(laps[0].compound).toBe("MEDIUM");
    expect(laps[3].compound).toBe("HARD");
    expect(laps[3].tyre_age).toBe(0);
    expect(laps[4].tyre_age).toBe(1);
    // provenance summary is attached for the UI
    expect(res.data!.provSummary![3].tyre_age).toBe("derived");
    expect(res.data!.provSummary![3].fuel_kg).toBe("model");
  });
});
