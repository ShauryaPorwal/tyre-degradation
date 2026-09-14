"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./TyreCurvesPanel.module.css";

type Session = { session_id: string; drivers: { driver: string; laps: number[] }[] };
type Point = { lap: number; tyre_age_laps: number; observed_lap_time_s: number; fuel_adjusted_lap_time_s: number | null };
type Fit = { slope_s_per_tyre_lap: number; fit_rmse_s: number };
type Stint = { stint: number; compound: string; clean_laps: number; status: string; raw_fit: Fit | null; fuel_adjusted_fit: Fit | null; points: Point[] };
type Result = {
  session_id: string; driver: string; through_lap: number; clean_laps: number;
  excluded_laps: number; future_laps_not_used: number; processing_time_ms: number;
  compound_coverage: { compound: string; clean_laps: number }[]; stints: Stint[];
  exclusions: { lap: number | null; reason: string }[];
  provenance: Record<string, unknown>; limitations: string[];
  fuel_assumptions: { enabled: boolean; burn_kg_per_lap: number | null; effect_s_per_kg: number | null };
};

function Chart({ stint }: { stint: Stint }) {
  const points = stint.points;
  const xs = points.map(p => p.tyre_age_laps);
  const ys = points.flatMap(p => p.fuel_adjusted_lap_time_s === null ? [p.observed_lap_time_s] : [p.observed_lap_time_s, p.fuel_adjusted_lap_time_s]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys) - 0.2, maxY = Math.max(...ys) + 0.2;
  const x = (v: number) => 70 + (v - minX) / (maxX - minX || 1) * 600;
  const y = (v: number) => 230 - (v - minY) / (maxY - minY) * 190;
  const adjusted = points.filter(p => p.fuel_adjusted_lap_time_s !== null);
  return <svg className={styles.chart} viewBox="0 0 700 285" role="img" aria-label={`Stint ${stint.stint}: observed lap pace by tyre age. Exact readings in the table below.`}>
    {[0, 1, 2, 3, 4].map(i => {
      const value = minY + (maxY - minY) * i / 4;
      return <g key={i}><line x1="70" x2="670" y1={y(value)} y2={y(value)} stroke="#354352" /><text x="60" y={y(value) + 4} fill="#afbdcc" fontSize="12" textAnchor="end">{value.toFixed(2)}</text></g>;
    })}
    <text x="70" y="20" fill="#afbdcc" fontSize="12">Lap time (seconds)</text>
    <text x="370" y="277" fill="#afbdcc" fontSize="12" textAnchor="middle">Tyre age (laps)</text>
    {[...new Set([minX, (minX + maxX) / 2, maxX])].map(v => <text key={v} x={x(v)} y="250" fill="#afbdcc" fontSize="12" textAnchor="middle">{v.toFixed(1)}</text>)}
    <polyline fill="none" stroke="#69e5ba" strokeWidth="2" points={points.map(p => `${x(p.tyre_age_laps)},${y(p.observed_lap_time_s)}`).join(" ")} />
    {points.map(p => <circle key={p.lap} cx={x(p.tyre_age_laps)} cy={y(p.observed_lap_time_s)} r="3" fill="#69e5ba" />)}
    <polyline fill="none" stroke="#eaba60" strokeWidth="2" strokeDasharray="6 4" points={adjusted.map(p => `${x(p.tyre_age_laps)},${y(p.fuel_adjusted_lap_time_s!)}`).join(" ")} />
  </svg>;
}

export default function TyreCurvesPanel() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sid, setSid] = useState("");
  const [driver, setDriver] = useState("");
  const [lap, setLap] = useState("");
  const [fuel, setFuel] = useState(false);
  const [burn, setBurn] = useState("");
  const [effect, setEffect] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const session = sessions.find(s => s.session_id === sid);
  const laps = session?.drivers.find(d => d.driver === driver)?.laps || [];

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/cleanroom-tyre-curves", { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Unable to load sessions.");
      setSessions(data.sessions);
      const first = data.sessions[0];
      setSid(first?.session_id || "");
      setDriver(first?.drivers[0]?.driver || "");
      const available: number[] = first?.drivers[0]?.laps || [];
      setLap(String(available[available.length - 1] || ""));
      if (!first) setError("No sessions found in the active laps.json dataset.");
    }).catch(e => { if (!controller.signal.aborted) setError(String(e.message)); });
    return () => { controller.abort(); requestRef.current?.abort(); };
  }, []);

  async function run(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    const controller = new AbortController(); requestRef.current = controller;
    try {
      const response = await fetch("/api/cleanroom-tyre-curves", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ session_id: sid, driver, through_lap: Number(lap),
          ...(fuel ? { fuel_burn_kg_per_lap: Number(burn), fuel_effect_s_per_kg: Number(effect) } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail));
      setResult(data);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Analysis failed."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }

  return <main className={styles.panel}>
    <p className={styles.muted}>TYRE INTELLIGENCE / STINT ANALYSIS</p>
    <h1>Observed tyre-age pace curves</h1>
    <p>Compare lap pace within each tyre stint using your active dataset. Select a cutoff to analyse only laps completed by that point.</p>
    <div className={styles.notice}>These are descriptive pace trends. Traffic, track evolution, weather and driver effort remain unresolved. The slopes are not measurements of physical tyre wear or validated pit recommendations.</div>
    <form className={styles.form} onSubmit={run} onChange={() => setResult(null)}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
      <div className={styles.controls}>
        <label>Session<select value={sid} required onChange={e => {
          setSid(e.target.value); const first = sessions.find(s => s.session_id === e.target.value)?.drivers[0];
          setDriver(first?.driver || ""); setLap(String(first?.laps[first.laps.length - 1] || ""));
        }}>{sessions.map(s => <option key={s.session_id}>{s.session_id}</option>)}</select></label>
        <label>Driver<select value={driver} required onChange={e => {
          setDriver(e.target.value); const available = session?.drivers.find(d => d.driver === e.target.value)?.laps || [];
          setLap(String(available[available.length - 1] || ""));
        }}>{session?.drivers.map(d => <option key={d.driver}>{d.driver}</option>)}</select></label>
        <label>Through lap<select value={lap} required onChange={e => setLap(e.target.value)}>{laps.map(n => <option key={n}>{n}</option>)}</select></label>
      </div>
      <label className={styles.check}><input type="checkbox" checked={fuel} onChange={e => setFuel(e.target.checked)} />Compare a fuel-assumption scenario</label>
      {fuel && <><p className={styles.muted}>Enter your own assumptions. These values are not sensor measurements. Correction references the first clean lap of each stint.</p><div className={styles.controls}>
        <label>Assumed burn (kg/lap)<input type="number" min="0" step="any" required value={burn} onChange={e => setBurn(e.target.value)} /></label>
        <label>Assumed fuel effect (s/kg)<input type="number" min="0" step="any" required value={effect} onChange={e => setEffect(e.target.value)} /></label>
      </div></>}
      <button disabled={busy || !sid || !driver || !lap}>{busy ? "Calculating…" : "Calculate stint curves"}</button>
      </fieldset>
    </form>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {result && <section aria-live="polite">
      <h2>{result.session_id} · {result.driver} · through lap {result.through_lap}</h2>
      <div className={styles.stats}><span>{result.clean_laps} eligible laps</span><span>{result.excluded_laps} excluded</span><span>{result.future_laps_not_used} future laps withheld</span><span>Backend: {result.processing_time_ms.toFixed(2)} ms</span></div>
      <p className={styles.muted}>Timing is for this request only; it is not a latency benchmark.</p>
      <div className={styles.stats}>{result.compound_coverage.map(c => <span key={c.compound}>{c.compound}: {c.clean_laps}</span>)}</div>
      {result.fuel_assumptions.enabled && <p className={styles.notice}>Assumed burn: {result.fuel_assumptions.burn_kg_per_lap} kg/lap; assumed effect: {result.fuel_assumptions.effect_s_per_kg} s/kg. Adjusted pace adds burn × effect × elapsed laps to observed pace.</p>}
      {!result.stints.length && <p>No eligible stints at this cutoff. Check the exclusion ledger below.</p>}
      {result.stints.map(s => <article className={styles.card} key={`${s.stint}-${s.compound}`}>
        <h2>Stint {s.stint} · {s.compound}</h2>
        <p>{s.clean_laps} eligible laps · {s.status.replaceAll("_", " ")}</p>
        <p><span className={styles.raw}>Solid: observed pace</span>{result.fuel_assumptions.enabled && <> · <span className={styles.adjusted}>Dashed: fuel-assumption scenario</span></>}</p>
        <Chart stint={s} />
        <p>Observed slope: <strong>{s.raw_fit ? `${s.raw_fit.slope_s_per_tyre_lap.toFixed(4)} s/tyre lap` : "Unavailable"}</strong></p>
        {s.fuel_adjusted_fit && <p>Fuel-adjusted slope: <strong>{s.fuel_adjusted_fit.slope_s_per_tyre_lap.toFixed(4)} s/tyre lap</strong></p>}
        {s.raw_fit ? <p className={styles.muted}>Observed fit residual RMSE: {s.raw_fit.fit_rmse_s.toFixed(3)} s. This describes scatter around this stint’s fitted line, not prediction accuracy on unseen laps. Positive slope means slowing; negative slope means improving pace.</p> : <p className={styles.muted}>A fit requires at least six eligible laps, four distinct tyre ages and consistent lap/tyre-age order.</p>}
        <details><summary>Exact lap readings</summary><div className={styles.tableWrap}><table><thead><tr><th>Lap</th><th>Tyre age</th><th>Observed (s)</th><th>Adjusted (s)</th></tr></thead><tbody>{s.points.map((p, i) => <tr key={i}><td>{p.lap}</td><td>{p.tyre_age_laps}</td><td>{p.observed_lap_time_s.toFixed(3)}</td><td>{p.fuel_adjusted_lap_time_s?.toFixed(3) ?? "Not enabled"}</td></tr>)}</tbody></table></div></details>
      </article>)}
      <details className={styles.card}><summary>Excluded lap ledger</summary><div className={styles.tableWrap}><table><thead><tr><th>Lap</th><th>First exclusion reason</th></tr></thead><tbody>{result.exclusions.map((r, i) => <tr key={i}><td>{r.lap ?? "Unknown"}</td><td>{r.reason.replaceAll("_", " ")}</td></tr>)}</tbody></table></div></details>
      <details className={styles.card}><summary>Provenance and limitations</summary><p>A matching local hash checks file integrity; it is not an independent authenticity certificate.</p><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(result.provenance, null, 2)}</pre><ul>{result.limitations.map(l => <li key={l}>{l}</li>)}</ul></details>
    </section>}
  </main>;
}
