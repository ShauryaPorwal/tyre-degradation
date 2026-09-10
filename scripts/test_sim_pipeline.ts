/* Headless pipeline test: parse → SimEngine → analyses, mirroring SimScreen's
   useMemo path. Run: npx tsx scripts/test_sim_pipeline.ts  (from web/) */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const p = (...s: string[]) => resolve(HERE, ...s);
import { SimEngine } from "../web/src/lib/sim/engine";
import { parseRaceInput, raceFromVideoMarks } from "../web/src/lib/sim/parse";
import type { RaceData } from "../web/src/lib/sim/types";

function demoRace(): RaceData {
  const demo = JSON.parse(readFileSync(p("../web/src/data/race_demo.json"), "utf-8"));
  return { ...demo, channels: { fuel: true, gaps: true, temp: true }, source: "fixture" };
}

function summarise(name: string, race: RaceData | null, errors: string[]) {
  if (!race) {
    console.log(`\n=== ${name}: REJECTED — ${errors.length} error(s)`);
    errors.slice(0, 3).forEach((e) => console.log("   ", e));
    return;
  }
  const engine = new SimEngine(race);
  const analyses = race.laps.map((l) => engine.processLap(l));
  const last = analyses[analyses.length - 1];
  const nan = analyses.filter((a) => !Number.isFinite(a.predicted) || !Number.isFinite(a.residual_s)).length;
  console.log(`\n=== ${name}: ${race.laps.length} laps, ${analyses.length} analyses, NaN/Inf rows: ${nan}`);
  console.log(`   last lap ${last.lap}: fitted=${last.lapTime.toFixed(2)}s predicted=${last.predicted?.toFixed(2)} ±${last.predictedPm?.toFixed(2)} nClean=${last.nCleanFitted}`);
  console.log(`   degRate(${last.tyre ? "last compound" : "?"}) = ${last.tyre?.degRate?.toFixed(4)} ± ${last.tyre?.degRatePm?.toFixed(4)} s/lap`);
  console.log(`   strategy: pit=${last.strategy.optimalPitLap} prob=${last.strategy.pitNowProb?.toFixed(2)} target=${last.strategy.targetCompound}`);
  console.log(`   components on last lap: ${last.components.length}`);
  const components0 = analyses.find((a) => a.components.length > 0);
  console.log(`   first lap with components: ${components0?.lap ?? "none"}`);
}

// CASE A — valid: bundled demo race
summarise("CASE A demo race", demoRace(), []);

// CASE A2 — valid: pasted CSV (the UI template, 3 rows)
const template = `lap,lap_time_s,compound,tyre_age,fuel_kg,gap_ahead_s,track_temp_c,pit_in,pit_out
1,80.51,MEDIUM,0,105,1.2,36,false,false
2,80.32,MEDIUM,1,103.4,1.4,36,false,false
3,80.41,MEDIUM,2,101.7,8.0,35.9,false,false`;
const t = parseRaceInput(template, "template");
summarise("CASE A2 template CSV", t.data, t.errors);

// CASE B — low-quality data: 3 identical lap times (no signal)
const flat = Array.from({ length: 6 }, (_, i) => `${i + 1},80.00,SOFT,${i},100,9,36,false,false`).join("\n");
const b = parseRaceInput(flat, "flat");
summarise("CASE B flat lap times", b.data, b.errors);

// CASE C — two compounds with a pit stop
const two = [
  "lap,lap_time_s,compound,tyre_age,fuel_kg,gap_ahead_s,track_temp_c,pit_in,pit_out",
  ...Array.from({ length: 10 }, (_, i) => `${i + 1},${(80.0 + i * 0.08).toFixed(2)},SOFT,${i},${(100 - i * 2).toFixed(1)},9,36,${i === 9 ? "true" : "false"},false`),
  ...Array.from({ length: 8 }, (_, i) => `${i + 11},${(79.4 + i * 0.06).toFixed(2)},HARD,${i},${(60 - i * 2).toFixed(1)},9,36,false,${i === 0 ? "true" : "false"}`),
].join("\n");
const c = parseRaceInput(two, "two compounds");
summarise("CASE C two compounds", c.data, c.errors);

// CASE D — invalid input
summarise("CASE D missing fields", ...(() => { const r = parseRaceInput("lap,compound\n1,SOFT", "bad"); return [r.data, r.errors] as [any, string[]]; })());
summarise("CASE D empty input", ...(() => { const r = parseRaceInput("   ", "empty"); return [r.data, r.errors] as [any, string[]]; })());
summarise("CASE D malformed JSON", ...(() => { const r = parseRaceInput("{not json", "badjson"); return [r.data, r.errors] as [any, string[]]; })());

// video path
const v = raceFromVideoMarks([0, 81.2, 162.1, 243.4], { compound: "MEDIUM", startFuelKg: 100, burnKgLap: 2, pitAfterLap: null, secondCompound: null });
summarise("video marks", v.data, v.errors);
