"use client";

/* Video ingest — honest by construction (docs/RESEARCH.md §9).

   What video can give: lap BOUNDARIES (user-confirmed marks at start/finish
   crossings, at up to 4× playback) → lap times. The shipped precedent
   (F1ReplayTiming) uses video only to sync against official data for the
   same reason.

   What video cannot give, and we refuse to fake: tyre wear, tyre temps and
   fuel load are not optically observable — even F1's broadcast tyre numbers
   come from telemetry models, not vision. Session context (compound, an
   estimated start fuel) is typed in by the user and labelled a declared
   estimate. Traffic and temperature stay absorbed in the residual. */

import { useRef, useState } from "react";
import { raceFromVideoMarks } from "@/lib/sim/parse";
import type { RaceData } from "@/lib/sim/types";

const COMPOUNDS = ["SOFT", "MEDIUM", "HARD"];

export function SimVideo({ onLoad }: { onLoad: (race: RaceData) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [marks, setMarks] = useState<number[]>([]);
  const [rate, setRate] = useState(1);
  const [compound, setCompound] = useState("MEDIUM");
  const [second, setSecond] = useState<string>("");
  const [pitAfter, setPitAfter] = useState<string>("");
  const [startFuel, setStartFuel] = useState<string>("");
  const [burn, setBurn] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);

  const mark = () => {
    const v = videoRef.current;
    if (!v) return;
    setMarks((m) => [...m, Number(v.currentTime.toFixed(2))].sort((a, b) => a - b));
  };

  const build = () => {
    const res = raceFromVideoMarks(marks, {
      compound,
      secondCompound: second || null,
      pitAfterLap: pitAfter ? Number(pitAfter) : null,
      startFuelKg: startFuel ? Number(startFuel) : null,
      burnKgLap: burn ? Number(burn) : null,
    });
    setErrors(res.errors);
    if (res.data) onLoad(res.data);
  };

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Race video → lap times</div>
          <div className="card-sub">
            Load a local video, then press <b>Mark lap</b> (or the L key) each time the car
            crosses the line. Nothing is uploaded anywhere.
          </div>
        </div>
      </div>

      {!src ? (
        <label className="ingest-zone" style={{ display: "block", cursor: "pointer" }}>
          Drop or choose a race video (stays on this machine)
          <input
            type="file"
            accept="video/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setSrc(URL.createObjectURL(f));
            }}
          />
        </label>
      ) : (
        <div
          className="video-wrap"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key.toLowerCase() === "l") {
              e.preventDefault();
              mark();
            }
          }}
        >
          <video ref={videoRef} src={src} controls playsInline />
          <div className="sim-controls" style={{ marginTop: 12 }}>
            <button className="btn accent" onClick={mark}>
              Mark lap (L)
            </button>
            {[1, 2, 4].map((r) => (
              <button
                key={r}
                className="btn"
                style={{ opacity: rate === r ? 1 : 0.6 }}
                onClick={() => {
                  setRate(r);
                  if (videoRef.current) videoRef.current.playbackRate = r;
                }}
              >
                {r}×
              </button>
            ))}
            <button className="btn" onClick={() => setMarks([])}>
              Clear marks
            </button>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {marks.length} marks → {Math.max(marks.length - 1, 0)} laps
            </span>
          </div>
          {marks.length > 0 && (
            <div className="marker-list">
              {marks.map((m, i) => (
                <button
                  key={`${m}-${i}`}
                  className="marker-chip"
                  title="Remove mark"
                  onClick={() => setMarks((ms) => ms.filter((_, j) => j !== i))}
                  style={{ cursor: "pointer", background: "none" }}
                >
                  {m.toFixed(1)}s ✕
                </button>
              ))}
            </div>
          )}

          <div className="plan-grid" style={{ marginTop: 18 }}>
            <div className="plan-cell">
              <div className="k">Starting compound</div>
              <select className="select" value={compound} onChange={(e) => setCompound(e.target.value)} style={{ marginTop: 8 }}>
                {COMPOUNDS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="plan-cell">
              <div className="k">Pit after lap (optional)</div>
              <input className="select" style={{ marginTop: 8, width: "100%" }} value={pitAfter} onChange={(e) => setPitAfter(e.target.value)} placeholder="e.g. 24" inputMode="numeric" />
              <select className="select" value={second} onChange={(e) => setSecond(e.target.value)} style={{ marginTop: 8 }} aria-label="Second compound">
                <option value="">second compound…</option>
                {COMPOUNDS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="plan-cell">
              <div className="k">Start fuel, kg (declared estimate)</div>
              <input className="select" style={{ marginTop: 8, width: "100%" }} value={startFuel} onChange={(e) => setStartFuel(e.target.value)} placeholder="e.g. 105" inputMode="decimal" />
            </div>
            <div className="plan-cell">
              <div className="k">Burn, kg/lap (declared estimate)</div>
              <input className="select" style={{ marginTop: 8, width: "100%" }} value={burn} onChange={(e) => setBurn(e.target.value)} placeholder="e.g. 1.65" inputMode="decimal" />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <button className="btn accent" onClick={build} disabled={marks.length < 3}>
              Analyse {Math.max(marks.length - 1, 0)} laps
            </button>
          </div>
          {errors.length > 0 && (
            <ul className="note" style={{ marginTop: 12, paddingLeft: 18, borderColor: "var(--critical)" }}>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="note" style={{ marginTop: 16 }}>
        <b>What video honestly gives:</b> lap boundaries → lap times, nothing more. Tyre wear,
        tyre temperature and fuel load are not optically observable — F1&apos;s own broadcast
        tyre graphics come from car telemetry models, not vision (RESEARCH §9). Fuel entered
        above is a declared estimate and the fuel component will be labelled prior-driven;
        traffic and weather stay in the residual, and the analysis says so.
      </p>
    </section>
  );
}
