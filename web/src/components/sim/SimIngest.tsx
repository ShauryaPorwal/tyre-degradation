"use client";

/* Data ingest for the Live Simulation: the bundled synthetic demo race,
   pasted/uploaded structured data (JSON or CSV), or a race video. Errors are
   listed row-by-row, never swallowed (rule 6). */

import { useRef, useState } from "react";
import raceDemoJson from "@/data/race_demo.json";
import { parseRaceInput } from "@/lib/sim/parse";
import type { RaceData } from "@/lib/sim/types";
import { SimVideo } from "@/components/sim/SimVideo";

export const DEMO_RACE = raceDemoJson as unknown as Omit<RaceData, "channels" | "source">;

export function demoRace(): RaceData {
  return {
    ...DEMO_RACE,
    channels: { fuel: true, gaps: true, temp: true },
    source: "fixture",
  };
}

const TEMPLATE = `lap,lap_time_s,compound,tyre_age,fuel_kg,gap_ahead_s,track_temp_c,pit_in,pit_out
1,80.51,MEDIUM,0,105,1.2,36,false,false
2,80.32,MEDIUM,1,103.4,1.4,36,false,false
3,80.41,MEDIUM,2,101.7,8.0,35.9,false,false`;

export function SimIngest({ onLoad }: { onLoad: (race: RaceData) => void }) {
  const [mode, setMode] = useState<"demo" | "data" | "video">("demo");
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const tryParse = (input: string, name: string) => {
    const res = parseRaceInput(input, name);
    setErrors(res.errors);
    setWarnings(res.warnings);
    if (res.data) onLoad(res.data);
  };

  return (
    <>
      <div className="seg" role="tablist" aria-label="Data source" style={{ marginBottom: 20 }}>
        <button className={mode === "demo" ? "on" : ""} onClick={() => setMode("demo")}>
          Demo race
        </button>
        <button className={mode === "data" ? "on" : ""} onClick={() => setMode("data")}>
          Structured data
        </button>
        <button className={mode === "video" ? "on" : ""} onClick={() => setMode("video")}>
          Race video
        </button>
      </div>

      {mode === "demo" && (
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{DEMO_RACE.display_name}</div>
              <div className="card-sub">
                {DEMO_RACE.total_laps} laps · medium → hard · one stop, a VSC, an overtake and a
                defence — with known per-lap ground truth to verify the engine against.
              </div>
            </div>
            <button className="btn accent" onClick={() => onLoad(demoRace())}>
              Load demo race
            </button>
          </div>
          <p className="note">{DEMO_RACE.note}</p>
        </section>
      )}

      {mode === "data" && (
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Paste laps — CSV or JSON</div>
              <div className="card-sub">
                Required: lap, lap_time_s, compound. Optional: tyre_age, fuel_kg, gap_ahead_s,
                track_temp_c, pit_in, pit_out, vsc, overtake, defended. Missing channels are
                reported, not guessed.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => setText(TEMPLATE)}>
                Insert template
              </button>
              <button className="btn" onClick={() => fileRef.current?.click()}>
                Upload file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.json,text/csv,application/json"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) tryParse(await f.text(), f.name);
                }}
              />
            </div>
          </div>
          <textarea
            className="paste-box"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={TEMPLATE}
            aria-label="Lap data, CSV or JSON"
          />
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn accent" onClick={() => tryParse(text, "Pasted session")}>
              Analyse
            </button>
          </div>
          {errors.length > 0 && (
            <div className="empty-state" style={{ marginTop: 14, textAlign: "left" }}>
              <span className="e-head">Input rejected — {errors.length} problem{errors.length > 1 ? "s" : ""}</span>
              <ul className="e-body" style={{ marginTop: 8, paddingLeft: 18, textAlign: "left" }}>
                {errors.slice(0, 8).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {errors.length > 8 && <li>… {errors.length - 8} more</li>}
              </ul>
            </div>
          )}
          {warnings.length > 0 && errors.length === 0 && (
            <ul className="note" style={{ marginTop: 12, paddingLeft: 18 }}>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {mode === "video" && <SimVideo onLoad={onLoad} />}
    </>
  );
}
