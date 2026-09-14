"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import styles from "./LiveAnalysisPanel.module.css";

const wheels = ["front_left", "front_right", "rear_left", "rear_right"] as const;
const signals = [
  { key: "pressure_psi", label: "Pressure (psi)", min: 0 },
  { key: "temp_inner_c", label: "Inner surface (C)" },
  { key: "temp_middle_c", label: "Middle surface (C)" },
  { key: "temp_outer_c", label: "Outer surface (C)" },
  { key: "wheel_slip_pct", label: "Wheel slip (%)" },
  { key: "vertical_load_n", label: "Vertical load (N)", min: 0 },
] as const;
type Result = {
  driver: string; session: string; lap: number; processing_time_ms: number;
  prediction: { predicted_lap_time_s: number; source: string; model_id: string | null; reason: string | null };
  tyre_sensors?: Record<string, Record<string, unknown>>;
  fuel_analysis: Record<string, unknown>; weather_analysis: Record<string, unknown>;
  traffic_analysis: Record<string, unknown>; track_evolution: Record<string, unknown>;
  driver_inputs: Record<string, unknown>; tyre_analysis: Record<string, unknown>;
  pit_strategy: Record<string, unknown>; disclaimer?: string;
};
const label = (text: string) => text.replaceAll("_", " ");
function display(value: unknown): string {
  if (value == null) return "Unavailable";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(2) : "Unavailable";
  if (Array.isArray(value)) return value.length ? value.map(display).join(", ") : "None";
  if (typeof value === "object") return JSON.stringify(value);
  return label(String(value));
}
function Card({ title, data }: { title: string; data: Record<string, unknown> }) {
  return <section className={styles.card}>
    <h3>{title}</h3>
    <dl>{Object.entries(data).map(([key, value]) => <div key={key} className={styles.row}>
      <dt>{label(key)}</dt><dd>{display(value)}</dd>
    </div>)}</dl>
  </section>;
}

export default function LiveAnalysisPanel() {
  const [year, setYear] = useState("2025");
  const [circuit, setCircuit] = useState("Barcelona");
  const [session, setSession] = useState("FP2");
  const [driver, setDriver] = useState("VER");
  const [lap, setLap] = useState("15");
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [source, setSource] = useState("UNVERIFIED_INPUT");
  const [result, setResult] = useState<Result | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function invalidate() { setResult(null); setElapsed(null); setError(""); }
  function demo() {
    const next: Record<string, string> = {};
    wheels.forEach((wheel, index) => {
      const values = [22 + index * 0.2, 98 + index, 104 + index, 100 + index, 2 + index * 0.4, 1400 + index * 25];
      signals.forEach((signal, n) => { next[`${wheel}_${signal.key}`] = values[n].toFixed(1); });
    });
    setReadings(next); setSource("SIMULATED"); invalidate();
  }

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); invalidate();
    const request: Record<string, unknown> = {
      race: `${circuit.trim()} ${year}`, year: Number(year), circuit: circuit.trim(),
      session_type: session, driver: driver.trim().toUpperCase(), lap: Number(lap), sensor_source: source,
    };
    if (!Number.isInteger(request.year) || !Number.isInteger(request.lap) || Number(lap) < 1) {
      setError("Enter a valid year and a whole lap number of at least 1."); return;
    }
    for (const [key, value] of Object.entries(readings)) {
      if (!value.trim()) continue;
      if (!Number.isFinite(Number(value))) { setError(`Invalid reading: ${label(key)}`); return; }
      request[key] = Number(value);
    }
    setBusy(true);
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch("/api/cleanroom-analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request), signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? "Request failed"));
      if (!data.prediction || !Number.isFinite(data.prediction.predicted_lap_time_s)) throw new Error("Unexpected backend response. Check the installed api.py version.");
      setResult(data); setElapsed(performance.now() - started);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally { clearTimeout(timer); setBusy(false); }
  }

  return <section className={styles.panel}>
    <header><p className={styles.eyebrow}>CLEANROOM / CACHED SESSION ANALYSIS</p>
      <h1>Four-wheel telemetry</h1>
      <p>Select a cached lap and optionally supply independent readings for each tyre.</p>
    </header>
    <aside className={styles.notice}>
      No physical sensor connection is configured. Sample readings are simulated. Sensor inputs do not yet change the trained lap-time model.
      Temperature spread is descriptive, not a wear measurement or a tyre-safety assessment.
    </aside>
    <form onSubmit={run}>
      <fieldset disabled={busy} className={styles.fieldset}>
        <legend>Session selection</legend>
        <div className={styles.selection}>
          <label>Year<input required type="number" min="2018" step="1" value={year} onChange={e => {setYear(e.target.value); invalidate();}} /></label>
          <label>Circuit<input required value={circuit} onChange={e => {setCircuit(e.target.value); invalidate();}} /></label>
          <label>Session<select value={session} onChange={e => {setSession(e.target.value); invalidate();}}>{["FP1", "FP2", "FP3", "Q", "R"].map(s => <option key={s}>{s}</option>)}</select></label>
          <label>Driver code<input required maxLength={3} value={driver} onChange={e => {setDriver(e.target.value.toUpperCase()); invalidate();}} /></label>
          <label>Lap<input required type="number" min="1" step="1" value={lap} onChange={e => {setLap(e.target.value); invalidate();}} /></label>
        </div>
        <p>Start with 2025 / Barcelona / FP2 / VER / 15. Other selections require matching rows in your dataset.</p>
        <div className={styles.toolbar}>
          <button type="button" onClick={demo}>Load simulated sensors</button>
          <button type="button" onClick={() => {setReadings({}); setSource("UNVERIFIED_INPUT"); invalidate();}}>Clear sensor inputs</button>
          <span>Input source: {label(source)}</span>
        </div>
        <div className={styles.wheelGrid}>
          {wheels.map(wheel => <section className={styles.card} key={wheel}>
            <h2>{label(wheel)}</h2><div className={styles.inputs}>
              {signals.map(signal => {
                const key = `${wheel}_${signal.key}`;
                return <label key={key} htmlFor={key}>{signal.label}<input id={key} type="number" step="any"
                  min={"min" in signal ? signal.min : undefined} placeholder="Unavailable" value={readings[key] ?? ""}
                  onChange={e => {setReadings(old => ({...old, [key]: e.target.value})); invalidate();}} /></label>;
              })}
            </div>
          </section>)}
        </div>
        <button className={styles.primary} type="submit">{busy ? "Analysing..." : "Run analysis"}</button>
      </fieldset>
    </form>
    {busy && <p role="status">Loading cached lap and running prediction...</p>}
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    {result && <section aria-label="Analysis results">
      <h2>Result: {result.driver} / {result.session} / lap {result.lap}</h2>
      <div className={styles.results}>
        <Card title="Lap model" data={result.prediction} />
        <Card title="Measured request timing" data={{backend_processing_ms: result.processing_time_ms, browser_round_trip_ms: elapsed, note: "One request, not a latency benchmark. Same-lap speed inputs make this retrospective analysis, not a validated next-lap forecast."}} />
      </div>
      <h2>Four-wheel readings</h2>
      <div className={styles.wheelGrid}>{wheels.map(wheel => <Card key={wheel} title={label(wheel)} data={result.tyre_sensors?.[wheel] ?? {status: "UNAVAILABLE"}} />)}</div>
      <h2>Available analysis</h2>
      <div className={styles.results}>
        <Card title="Fuel" data={result.fuel_analysis ?? {status: "UNAVAILABLE"}} />
        <Card title="Weather" data={result.weather_analysis ?? {status: "UNAVAILABLE"}} />
        <Card title="Traffic" data={result.traffic_analysis ?? {status: "UNAVAILABLE"}} />
        <Card title="Track evolution" data={result.track_evolution ?? {status: "UNAVAILABLE"}} />
        <Card title="Driver inputs" data={result.driver_inputs ?? {status: "UNAVAILABLE"}} />
        <Card title="Tyre performance" data={result.tyre_analysis ?? {status: "UNAVAILABLE"}} />
        <Card title="Pit strategy" data={result.pit_strategy ?? {status: "UNAVAILABLE"}} />
      </div>
      <p className={styles.notice}>{result.disclaimer}</p>
    </section>}
  </section>;
}
