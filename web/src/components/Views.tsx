"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "./Workspace";
import { api, Curves, Report, fmt, wheels, signals } from "./types";
import { CurveCards } from "./Charts";

export function Title({ title, text }: { title: string; text: string }) { return <><h1>{title}</h1><p className="lead">{text}</p></>; }
export function Metric({ label, value, note }: { label: string; value: unknown; note?: string }) { return <div className="metric"><span>{label}</span><strong>{fmt(value)}</strong>{note && <small>{note}</small>}</div>; }
export function Details({ title, value }: { title: string; value: unknown }) { return <details className="card"><summary>{title}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>; }
function download(name: string, data: unknown) { const u = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); }

export function PitWall() {
  const { report: r } = useWorkspace();
  return <><Title title="Pit Wall" text="A single view of the selected historical lap, available telemetry and model evidence." />
    {r && <><div className="metrics"><Metric label="Observed lap / s" value={r.source_row.lap_time} note="FastF1 export" /><Metric label="Estimated lap / s" value={r.prediction.predicted_lap_time_s} note={r.prediction.source} /><Metric label="Tyre compound" value={r.source_row.compound} note={`Age ${fmt(r.source_row.tyre_life, 0)} laps`} /><Metric label="Backend request / ms" value={r.processing_time_ms} note="Single request; not a benchmark" /></div>
      <div className="grid"><section className="card"><h2>Available observations</h2><table><tbody>{[["Driver", r.source_row.driver], ["Team", r.source_row.team], ["Stint", r.source_row.stint], ["Throttle mean / %", r.source_row.throttle_mean_pct], ["Time braking / %", r.source_row.brake_time_pct], ["Rain reported", r.source_row.rainfall]].map(([k, v]) => <tr key={String(k)}><td>{String(k)}</td><td>{fmt(v)}</td></tr>)}</tbody></table></section>
      <section className="card"><h2>Decision readiness</h2><p>{r.curves.clean_laps} eligible laps through the cutoff; {r.curves.stints.filter(s => s.raw_fit).length} stints with descriptive fits.</p><p className="notice">No validated pit call. Use Pit scenarios to compare explicit pace and pit-loss assumptions.</p><p className="muted">Private fuel and tyre channels are unavailable unless you supply separate inputs. Same-lap speed traps make the model a retrospective estimate.</p></section></div>
      {r.prediction.reason && <p className="notice">Model: {r.prediction.reason}</p>}<div className="button-row"><button onClick={() => download(`analysis-${r.selection.session_id}-${r.selection.driver}-${r.selection.lap}.json`, r)}>Download analysis JSON</button></div><Details title="Data provenance" value={r.provenance} /></>}
  </>;
}

export function TyreCurves() { const { report } = useWorkspace(); return <><Title title="Tyre pace curves" text="Within-stint pace trends using eligible laps completed by the selected cutoff." /><p className="notice">Fuel, traffic, track evolution, weather and driver effort can all change the slope. These are observed trends, not isolated tyre wear.</p>{report && <CurveCards curves={report.curves} />}</>; }

export function Deconfound() {
  const { selection } = useWorkspace(); const [values, setValues] = useState({ fuel_burn_kg_per_lap: "0", fuel_effect_s_per_kg: "0", track_gain_s_per_lap: "0", traffic_penalty_s: "0" });
  const [result, setResult] = useState<Curves | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { setResult(null); setError(""); }, [selection]);
  return <><Title title="Deconfounding sensitivity" text="Test how explicit fuel, track and traffic assumptions change each stint’s pace curve." /><p className="notice">These effects cannot be uniquely separated from the uploaded laps alone. This page tests assumptions; it does not claim a fitted causal wear rate. Weather and driver-effort effects remain unresolved.</p>
    <form className="card" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); setResult(null); try { setResult(await api<Curves>("decompose", { ...selection, ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])) })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
      <fieldset disabled={busy}><div className="controls">{Object.entries(values).map(([k, v]) => <label key={k}>{({ fuel_burn_kg_per_lap: "Assumed burn · kg/lap", fuel_effect_s_per_kg: "Fuel effect · s/kg", track_gain_s_per_lap: "Track pace gain · s/lap", traffic_penalty_s: "Constant traffic loss · s" } as Record<string, string>)[k]}<input type="number" step="any" required value={v} onChange={e => { setValues({ ...values, [k]: e.target.value }); setResult(null); }} /></label>)}</div><button className="primary" disabled={!selection}>Compare assumptions</button></fieldset>
      <p className="muted">Fuel correction = burn × fuel effect × laps since the first eligible lap of the stint. Track gain is added; traffic loss is subtracted. Constant traffic loss changes pace level, not degradation slope. Zeros mean no assumed correction.</p>
    </form>{error && <p className="error" role="alert">{error}</p>}{result && <CurveCards curves={result} />}</>;
}

export function Telemetry() {
  const { report, selection } = useWorkspace(); const [inputs, setInputs] = useState<Record<string, string>>({}); const [source, setSource] = useState("MANUAL");
  const [reading, setReading] = useState<Report | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { setReading(null); setInputs({}); setError(""); }, [selection]);
  const result = reading || report;
  return <><Title title="Telemetry & four-wheel inputs" text="Historical lap summaries plus a separate input panel for front-left, front-right, rear-left and rear-right tyres." />
    {report && <div className="metrics"><Metric label="Mean throttle / %" value={report.source_row.throttle_mean_pct} /><Metric label="Time braking / %" value={report.source_row.brake_time_pct} note="Binary braking, not pedal pressure" /><Metric label="Mean speed / km/h" value={report.source_row.speed_mean_kph} /><Metric label="Wind speed / m/s" value={report.source_row.wind_speed_m_s} /></div>}
    <p className="notice">No tyre hardware is connected. Inputs below are manual or simulated, independent of the historical lap, and do not affect the trained lap-time model.</p>
    <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { const sensors: Record<string, unknown> = { source }; for (const w of wheels) sensors[w] = Object.fromEntries(signals.map(s => [s, inputs[`${w}_${s}`]?.trim() ? Number(inputs[`${w}_${s}`]) : null])); setReading(await api<Report>("analyze", { ...selection, sensors })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
      <fieldset disabled={busy}><div className="controls"><label>Input source<select value={source} onChange={e => { setSource(e.target.value); setReading(null); }}><option>MANUAL</option><option>SIMULATED</option></select></label><button type="button" onClick={() => { setInputs({}); setReading(null); }}>Clear readings</button></div>
        <div className="wheel-grid">{wheels.map(w => <section className="card" key={w}><h2>{w.replaceAll("_", " ").toUpperCase()}</h2><div className="wheel-inputs">{signals.map(s => <label key={s}>{s.replaceAll("_", " ")}<input type="number" step="any" value={inputs[`${w}_${s}`] || ""} placeholder="Unavailable" onChange={e => { setInputs({ ...inputs, [`${w}_${s}`]: e.target.value }); setReading(null); }} /></label>)}</div></section>)}</div>
        <button className="primary" disabled={!selection}>{busy ? "Checking…" : "Check four-wheel inputs"}</button></fieldset>
    </form>{error && <p role="alert" className="error">{error}</p>}
    {result && <div className="card" style={{ marginTop: 20 }}><h2>Input assessment</h2><div className="table"><table><thead><tr><th>Wheel</th><th>Source</th><th>Channels</th><th>Mean surface °C</th><th>Spread °C</th><th>Tyre health</th></tr></thead><tbody>{wheels.map(w => { const r = result.tyre_sensors[w]; return <tr key={w}><td>{w.replaceAll("_", " ")}</td><td>{fmt(r.source)}</td><td>{fmt(r.available_channels, 0)} / 6</td><td>{fmt(r.average_surface_temp_c)}</td><td>{fmt(r.temperature_spread_c)}</td><td>Not assessed</td></tr>; })}</tbody></table></div><p className="muted">No calibrated operating limits or wear sensor are supplied. Temperature gradients and pressure alone do not establish remaining tyre life.</p></div>}
    <Details title="Historical telemetry sampling details" value={report?.source_row.telemetry_summary} /></>;
}

export function Archive() {
  const { catalog, select } = useWorkspace(); const router = useRouter();
  return <><Title title="Session archive" text="All valid uploaded exports. Repeated exports of the same session are deduplicated using the latest export timestamp." />
    <div className="card table"><table><thead><tr><th>Session</th><th>Laps</th><th>Drivers</th><th>Integrity</th><th>Open</th></tr></thead><tbody>{catalog.sessions.map(s => <tr key={s.session_id}><td>{s.session_id}</td><td>{s.row_count}</td><td>{s.drivers.length}</td><td>Hash matched</td><td><button onClick={() => { const d = s.drivers.find(d => d.driver === "VER") || s.drivers[0]; select({ session_id: s.session_id, driver: d.driver, lap: d.laps[d.laps.length - 1] }); router.push("/"); }}>Analyse</button></td></tr>)}</tbody></table></div>
    <p className="muted">A matching hash proves that the export still matches its local provenance record, not that the record was independently certified.</p>
    {catalog.sessions.map(s => <Details key={s.session_id} title={`${s.session_id} provenance`} value={s.provenance} />)}{catalog.rejected_exports.length > 0 && <Details title="Rejected exports — not used for analysis" value={catalog.rejected_exports} />}</>;
}
