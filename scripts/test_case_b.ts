/* CASE B: identical lap times — no degradation signal in the data. */
import { SimEngine } from "../web/src/lib/sim/engine";
import { parseRaceInput } from "../web/src/lib/sim/parse";

const flat = Array.from({ length: 6 }, (_, i) => `${i + 1},80.00,SOFT,${i},100,9,36,false,false`).join("\n");
const text = "lap,lap_time_s,compound,tyre_age,fuel_kg,gap_ahead_s,track_temp_c,pit_in,pit_out\n" + flat;
console.log("RAW first 120 chars:", JSON.stringify(text.slice(0, 120)));
const r = parseRaceInput(text, "flat");
console.log("errors:", r.errors.slice(0, 4));
