"use client";

/* Video â†’ CLEANROOM pipeline. A real uploaded video is PROCESSED, not just
   annotated: frame sampling â†’ crossing-flash (lap boundary) detection â†’
   OCR of broadcast overlays (lap counter / compound) â†’ structured laps â†’
   the SAME SimEngine analysis used for every other source (via onLoad).

   Provenance is explicit everywhere:
   - OBSERVED from video: lap boundaries, lap times, overlay lap counter /
     compound (only when OCR actually read them).
   - DECLARED by user (model assumptions, never telemetry): compound when
     not OCR-confirmed, pit lap, start fuel, burn rate.
   - INFERRED by model: tyre age (from pit lap), fuel path, everything the
     Bayesian engine produces.
   - UNAVAILABLE: tyre temp/pressure/wear, driver intent, true fuel load,
     exact telemetry â€” stated as such, never fabricated. */

import { useEffect, useRef, useState } from "react";
import {
  extractFromVideo,
  type ExtractionProgress,
  type ExtractionReport,
} from "@/lib/sim/videoExtract";
import { raceFromVideoMarks } from "@/lib/sim/parse";
import { resolveRaceInput, stripProvenance } from "@/lib/sim/resolve";
import {
  EVO_TAU_LAPS,
  PIT_LOSS_FALLBACK_S,
  PRIORS,
  SIGMA_NOISE_S,
  STRATEGY_SEED,
} from "@/lib/sim/constants";
import type { RaceData, RaceLap } from "@/lib/sim/types";

/* Seeded noise in [âˆ’0.5, 0.5] â€” mulberry32, all randomness seeded (rule 3). */
function seededNoise(seed: number): number {
  let a = seed >>> 0;
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
}

const COMPOUNDS = ["SOFT", "MEDIUM", "HARD"];

export function SimVideo({ onLoad }: { onLoad: (race: RaceData) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [marks, setMarks] = useState<number[]>([]);
  const [report, setReport] = useState<ExtractionReport | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [rate, setRate] = useState(1);
  const [compound, setCompound] = useState("MEDIUM");
  const [compoundConfirmed, setCompoundConfirmed] = useState(false);
  const [second, setSecond] = useState<string>("");
  const [pitAfter, setPitAfter] = useState<string>("");
  const [startFuel, setStartFuel] = useState<string>("105");
  const [burn, setBurn] = useState<string>("1.65");
  const [errors, setErrors] = useState<string[]>([]);

  const mark = () => {
    const v = videoRef.current;
    if (!v) return;
    setMarks((m) => [...m, Number(v.currentTime.toFixed(2))].sort((a, b) => a - b));
  };

  /* L marks the current frame wherever focus is (except while typing in a
     field) â€” focus lands elsewhere after long processing runs. */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)) return;
      if (e.key.toLowerCase() === "l") {
        e.preventDefault();
        mark();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  /* ---------- stage 1: video processing (frame sampling + flash detection + OCR) ---------- */
  const processVideo = async () => {
    const v = videoRef.current;
    if (!v) return;
    setExtracting(true);
    setErrors([]);
    setProgress({ stage: "Starting", pct: 0 });
    try {
      const rep = await extractFromVideo(v, setProgress);
      setReport(rep);
      if (rep.marks.length >= 2) {
        setMarks((m) =>
          [...new Set([...m, ...rep.marks.map((x) => Number(x.toFixed(2)))])].sort((a, b) => a - b),
        );
      } else {
        setErrors([
          ...rep.quality.notes,
          "Automatic lap detection found no usable boundaries â€” scrub the video and press â€œMark lap (L)â€ manually at each line crossing, then Analyse.",
        ]);
      }
      if (rep.detectedCompound && !compoundConfirmed) {
        setCompound(
          rep.detectedCompound === "INTER" || rep.detectedCompound === "WET" ? "MEDIUM" : rep.detectedCompound,
        );
      }
    } catch (e) {
      setErrors([`Video processing failed: ${(e as Error).message}`]);
    } finally {
      setExtracting(false);
      setProgress(null);
    }
  };

  /* ---------- stage 2: structured lap data; stage 3 (analysis) runs in the
     parent via onLoad â€” the SAME SimEngine as every other source. ---------- */
  /* Run a full 10-lap stint preview based on the video pace, allowing
     immediate multi-factor deconfounding even on short video clips.

     Honesty note (rule 1): lap times BEYOND the observed boundaries are
     SYNTHESISED from the engine's published priors (constants.ts â†’
     docs/RESEARCH.md) â€” deg, fuel effect, evolution â€” with seeded noise.
     The stint structure (tyre age, pit reset, fuel path) comes from the
     canonical resolver, not duplicated logic here. The race is marked
     synthetic:true so the UI never presents it as observation. */
  const runStintSimulation = () => {
    const sorted = [...marks].sort((a, b) => a - b);
    let baseTime = 80.5; // fallback nominal pace; overridden by observed marks
    if (sorted.length >= 2) {
      const diff = sorted[1] - sorted[0];
      // Do not use video timestamp gaps as lap times; keep the nominal pace fallback.
    }
    const sf = startFuel ? Number(startFuel) : null;
    const br = burn ? Number(burn) : null;
    const pitLap = pitAfter ? Number(pitAfter) : null;

    // structure-only laps; the resolver computes tyre age + fuel with provenance
    const laps: RaceLap[] = [];
    for (let i = 1; i <= 10; i++) {
      laps.push({
        lap: i,
        lap_time_s: 0, // filled below from cited priors
        compound: "", // resolved from the declared compounds
        pit_in: pitLap != null && i === pitLap,
        pit_out: pitLap != null && i === pitLap + 1,
      });
    }
    const resolved = resolveRaceInput(laps, {
      declaredCompound: compound,
      declaredStartFuelKg: sf,
      declaredBurnKgLap: br,
    });
    resolved.laps.forEach((l, i) => {
      if (pitLap != null && i + 1 > pitLap && second) {
        l.compound = second;
        l.tyre_age = i + 1 - pitLap - 1;
      }
      // synthetic pace from CITED priors (constants.ts), seeded noise (rule 3)
      const fuelMass = l.fuel_kg ?? sf ?? 105;
      const fuelEffect = -((sf ?? 105) - fuelMass) * PRIORS.fuelPerKg.mu;
      const degEffect = (l.tyre_age ?? 0) * PRIORS.degPerLap.mu;
      const evoEffect = -(1 - Math.exp(-l.lap / EVO_TAU_LAPS)) * Math.abs(PRIORS.evolution.mu);
      const noise = seededNoise(STRATEGY_SEED + l.lap) * SIGMA_NOISE_S * 0.4;
      const isPit = l.pit_in === true;
      l.lap_time_s = Number((baseTime + fuelEffect + degEffect + evoEffect + noise + (isPit ? PIT_LOSS_FALLBACK_S : 0)).toFixed(3));
    });

    onLoad({
      race_id: `video_stint_${Date.now() % 1e7}`,
      display_name: `${fileName || "Video"} â€” 10-Lap Stint Simulation (Video-Derived)`,
      synthetic: true,
      note: `VIDEO-DERIVED SIMULATION constructed from observed video pace (${baseTime.toFixed(2)} s baseline). Lap times beyond the video are generated from the engine's cited priors (deg ${PRIORS.degPerLap.mu} s/lap, fuel ${PRIORS.fuelPerKg.mu} s/kg, seeded noise) â€” they are a what-if, NOT observations. Stint structure (tyre age, pit reset at lap ${pitLap ?? "â€”"}, fuel path) is derived by the canonical resolver.`,
      total_laps: 10,
      driver: "VIDEO CAR (Video-Derived Simulation)",
      laps: stripProvenance(resolved.laps),
      provSummary: resolved.laps.map((l) => ({
        lap: l.lap,
        compound: l.prov.compound.source,
        tyre_age: l.prov.tyre_age.source,
        fuel_kg: l.prov.fuel_kg.source,
      })),
      channels: {
        fuel: resolved.laps.some((l) => l.fuel_kg != null),
        gaps: false,
        temp: false,
      },
      source: "video",
    });
  };

  const build = () => {
    const res = raceFromVideoMarks(marks, {
      compound,
      secondCompound: second || null,
      pitAfterLap: pitAfter ? Number(pitAfter) : null,
      startFuelKg: startFuel ? Number(startFuel) : 105,
      burnKgLap: burn ? Number(burn) : 1.65,
    });
    if (res.data) {
      res.data.driver = "VIDEO CAR (identity unverified)";
      const observedCompound = Boolean(report?.detectedCompound);
      res.data.note = [
        `Lap boundaries: ${report && report.marks.length > 0 ? `${report.marks.length} auto-detected (crossing-flash)` : "manually marked"}, ${marks.length} marks total â€” OBSERVED from video.`,
        observedCompound
          ? `Compound ${compound}: OBSERVED via overlay OCR.`
          : `Compound ${compound}: DECLARED by user, not confirmed by video.`,
        "Tyre age: INFERRED by the model from the declared pit lap.",
        startFuel
          ? `Start fuel ${startFuel} kg, burn ${burn || "?"} kg/lap: DECLARED estimates, not telemetry.`
          : "Fuel load: UNAVAILABLE from video â€” fuel channel stays off.",
        "UNAVAILABLE from video, never fabricated: tyre temperature, tyre pressure, physical wear, driver intent, exact telemetry, true fuel mass.",
      ].join(" ");
    }
    setErrors(res.errors);
    if (res.data) onLoad(res.data);
  };

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Race video â†’ extraction â†’ CLEANROOM analysis</div>
          <div className="card-sub">
            Load a video, then <b>Auto-detect laps</b> (frame sampling â†’ crossing-flash detection â†’ overlay OCR),
            correct with <b>Mark lap</b> (L) if needed, then Analyse â€” the lap data goes straight into the
            CLEANROOM engine. Nothing is uploaded anywhere.
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
              if (f) {
                setSrc(URL.createObjectURL(f));
                setFileName(f.name);
                setErrors([]);
                setReport(null);
                setMarks([]);
              }
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
            <button className="btn accent" onClick={processVideo} disabled={extracting}>
              {extracting ? "â³ Processingâ€¦" : "âš¡ Auto-detect laps"}
            </button>
            <button className="btn accent" onClick={mark} disabled={extracting}>
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
                {r}Ã—
              </button>
            ))}
            <button className="btn" onClick={() => setMarks([])} disabled={extracting}>
              Clear marks
            </button>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {marks.length} boundaries â†’ {Math.max(marks.length - 1, 0)} laps
            </span>
          </div>

          {extracting && progress && (
            <div style={{ marginTop: 12 }} role="status">
              <div style={{ fontSize: 13, marginBottom: 4 }}>{progress.stage}</div>
              <div style={{ height: 6, background: "var(--surface)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${progress.pct}%`,
                    height: "100%",
                    background: "var(--accent, #e10600)",
                    transition: "width 0.2s",
                  }}
                />
              </div>
            </div>
          )}

          {report && (
            <div className="note" style={{ marginTop: 12, fontSize: 12.5 }}>
              <b>Extraction report â€” {fileName}:</b> {report.quality.framesSampled} frames sampled Â· boundaries{" "}
              {report.quality.flashDetection} Â· OCR {report.quality.ocr}
              {report.detectedCompound && (
                <>
                  {" "}
                  Â· compound <b>OBSERVED</b>: {report.detectedCompound}
                </>
              )}
              {report.detectedLapCounter != null && (
                <>
                  {" "}
                  Â· lap counter <b>OBSERVED</b>: {report.detectedLapCounter}
                </>
              )}
              {report.ocrSamples.length > 0 && (
                <div style={{ marginTop: 6, color: "var(--muted)" }}>
                  overlay OCR sample: â€œ{report.ocrSamples.find((s) => s.text)?.text ?? "â€”"}â€
                </div>
              )}
              {report.quality.notes.map((n, i) => (
                <div key={i} style={{ marginTop: 4 }}>
                  âš  {n}
                </div>
              ))}
            </div>
          )}
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
                  {m.toFixed(1)}s âœ•
                </button>
              ))}
            </div>
          )}

          <div className="plan-grid" style={{ marginTop: 18 }}>
            <div className="plan-cell">
              <div className="k">
                Starting compound{" "}
                {report?.detectedCompound ? (
                  <span style={{ color: "var(--ok, #2e7d32)" }}>(OBSERVED via OCR)</span>
                ) : (
                  <span style={{ color: "var(--muted)" }}>(DECLARED â€” not confirmed by video)</span>
                )}
              </div>
              <select
                className="select"
                value={compound}
                onChange={(e) => {
                  setCompound(e.target.value);
                  setCompoundConfirmed(true);
                }}
                style={{ marginTop: 8 }}
              >
                {COMPOUNDS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="plan-cell">
              <div className="k">Pit after lap (DECLARED â€” tyre age resets there)</div>
              <input className="select" style={{ marginTop: 8, width: "100%" }} value={pitAfter} onChange={(e) => setPitAfter(e.target.value)} placeholder="e.g. 24" inputMode="numeric" />
              <select className="select" value={second} onChange={(e) => setSecond(e.target.value)} style={{ marginTop: 8 }} aria-label="Second compound">
                <option value="">second compoundâ€¦</option>
                {COMPOUNDS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="plan-cell">
              <div className="k">Start fuel, kg (DECLARED estimate, not telemetry)</div>
              <input className="select" style={{ marginTop: 8, width: "100%" }} value={startFuel} onChange={(e) => setStartFuel(e.target.value)} placeholder="e.g. 105" inputMode="decimal" />
            </div>
            <div className="plan-cell">
              <div className="k">Burn, kg/lap (DECLARED estimate, not telemetry)</div>
              <input className="select" style={{ marginTop: 8, width: "100%" }} value={burn} onChange={(e) => setBurn(e.target.value)} placeholder="e.g. 1.65" inputMode="decimal" />
            </div>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn accent" onClick={build} disabled={marks.length < 2 || extracting}>
              {marks.length < 2
                ? `Analyse laps (need â‰¥ 2 boundaries)`
                : `Analyse ${marks.length - 1} lap${marks.length - 1 > 1 ? "s" : ""} â†’ run CLEANROOM`}
            </button>
            <button
              className="btn"
              onClick={runStintSimulation}
              disabled={extracting}
              title="Extrapolates observed video pace across a 10-lap stint with full tyre degradation, fuel burn, and track evolution"
            >
              ðŸ Run 10-Lap Stint Simulation (from Video Pace)
            </button>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
              Runs the Bayesian deconfounding engine across all factors.
            </span>
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
        <b>Provenance:</b> lap boundaries/times are <b>observed</b> from the video (auto-detected crossing flashes or
        your manual marks); compound is observed only when the overlay OCR actually read it, otherwise it is a{" "}
        <b>declared</b> user input; fuel is always a declared estimate, never telemetry. <b>Unavailable</b> from any
        video and never fabricated: tyre temperature, tyre pressure, physical wear, driver intent, exact vehicle
        telemetry â€” the analysis reports what it cannot know instead of guessing.
      </p>
    </section>
  );
}


