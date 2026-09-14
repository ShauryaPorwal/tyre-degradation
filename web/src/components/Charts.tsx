"use client";
import { Curves, Stint, fmt } from "./types";
export function PaceChart({ stint }: { stint: Stint }) {
  const p = stint.points;
  if (!p.length) return null;
  const xs = p.map(p => p.tyre_age_laps);
  const extra = p.map(p => p.scenario_lap_time_s ?? p.fuel_adjusted_lap_time_s);
  const ys = [...p.map(p => p.observed_lap_time_s), ...extra.filter((v): v is number => v != null)];
  const loX = Math.min(...xs), hiX = Math.max(...xs), loY = Math.min(...ys) - .25, hiY = Math.max(...ys) + .25;
  const x = (v: number) => 62 + (v - loX) / (hiX - loX || 1) * 605;
  const y = (v: number) => 215 - (v - loY) / (hiY - loY) * 180;
  return <svg className="chart" viewBox="0 0 700 265" role="img" aria-label={`Stint ${stint.stint}, lap time against tyre age. Exact readings in table below.`}>
    {[0, 1, 2, 3, 4].map(i => { const v = loY + (hiY - loY) * i / 4; return <g key={i}><line x1="62" x2="667" y1={y(v)} y2={y(v)} stroke="#2b394b" /><text x="54" y={y(v) + 4} fill="#a8b6c7" fontSize="11" textAnchor="end">{v.toFixed(2)}</text></g>; })}
    <text x="62" y="18" fill="#a8b6c7" fontSize="11">Lap time · seconds</text><text x="370" y="260" fill="#a8b6c7" fontSize="11" textAnchor="middle">Tyre age · laps</text>
    {[...new Set([loX, (loX + hiX) / 2, hiX])].map(v => <text key={v} x={x(v)} y="237" fill="#a8b6c7" fontSize="11" textAnchor="middle">{fmt(v, 1)}</text>)}
    <polyline fill="none" stroke="#73edbb" strokeWidth="2" points={p.map(v => `${x(v.tyre_age_laps)},${y(v.observed_lap_time_s)}`).join(" ")} />
    {p.map((v, i) => <circle key={i} cx={x(v.tyre_age_laps)} cy={y(v.observed_lap_time_s)} r="3" fill="#73edbb" />)}
    <polyline fill="none" stroke="#f5c76a" strokeWidth="2" strokeDasharray="6 4" points={p.flatMap((v, i) => extra[i] == null ? [] : [`${x(v.tyre_age_laps)},${y(extra[i]!)}`]).join(" ")} />
  </svg>;
}
export function CurveCards({ curves }: { curves: Curves }) {
  return <><div className="tags">{curves.compound_coverage.map(c => <span className={`tag ${c.compound}`} key={c.compound}>{c.compound} · {c.clean_laps} laps</span>)}</div>
    <p className="muted">{curves.clean_laps} eligible · {curves.excluded_laps} excluded · {curves.future_laps_not_used} future laps withheld. At least six eligible laps and four distinct tyre ages per fit.</p>
    {!curves.stints.length && <p className="empty">No eligible stint at this cutoff. Choose a later lap or another driver.</p>}
    {curves.stints.map(s => <article className="card" key={`${s.stint}-${s.compound}`}><h2>Stint {s.stint} <span className={`tag ${s.compound}`}>{s.compound}</span></h2><p className="muted">{s.clean_laps} eligible laps · {s.status.replaceAll("_", " ")}</p><PaceChart stint={s} />
      <div className="grid"><p><span className="raw">Observed slope</span><br /><strong>{s.raw_fit ? `${fmt(s.raw_fit.slope_s_per_tyre_lap, 4)} s/tyre lap` : "Insufficient / inconsistent data"}</strong></p>{(s.scenario_fit || s.fuel_adjusted_fit) && <p><span className="adjusted">Assumption-adjusted slope</span><br /><strong>{fmt((s.scenario_fit || s.fuel_adjusted_fit)?.slope_s_per_tyre_lap, 4)} s/tyre lap</strong></p>}</div>
      <p className="muted">Positive means slower; negative means faster. Neither establishes physical wear. Fit residual RMSE: {fmt(s.raw_fit?.fit_rmse_s, 3)} s, describing scatter in this stint, not held-out accuracy.</p>
      <details><summary>Exact lap readings</summary><div className="table"><table><thead><tr><th>Lap</th><th>Tyre age</th><th>Observed (s)</th><th>Scenario (s)</th></tr></thead><tbody>{s.points.map((p, i) => <tr key={i}><td>{p.lap}</td><td>{p.tyre_age_laps}</td><td>{fmt(p.observed_lap_time_s, 3)}</td><td>{fmt(p.scenario_lap_time_s ?? p.fuel_adjusted_lap_time_s, 3)}</td></tr>)}</tbody></table></div></details>
    </article>)}<details className="card"><summary>Exclusion ledger</summary><div className="table"><table><thead><tr><th>Lap</th><th>First exclusion reason</th></tr></thead><tbody>{curves.exclusions.map((e, i) => <tr key={i}><td>{e.lap}</td><td>{e.reason.replaceAll("_", " ")}</td></tr>)}</tbody></table></div></details></>;
}
