import { AblationBars, ReliabilityDiagram } from "@/components/ValidationCharts";
import { validation } from "@/lib/data";

const ranked = [...validation.table].sort((a, b) => a.mae - b.mae);
const best = ranked[0];
const baseline = validation.table.find((row) => row.method.startsWith("A ")) ?? ranked.at(-1);
const coverage = validation.reliability.find((point) => point.nominal === 90);

export default function ValidationPage() {
  return (
    <div className="validation-page">
      <header>
        <div className="eyebrow">CLEANROOM / VALIDATION</div>
        <div className="validation-title-row">
          <div>
            <h1>Can we trust the call?</h1>
            <p className="lede">Validation measures whether the model predicts unseen race pace and whether its uncertainty means what it says.</p>
          </div>
          <span className={`validation-badge ${validation.frozen ? "frozen" : "demo"}`}>{validation.frozen ? "FROZEN RESULTS" : "DEMO RESULTS"}</span>
        </div>
      </header>

      <section className="validation-banner"><strong>{validation.frozen ? "Validated result" : "Fixture validation"}</strong><span>{validation.note}</span></section>

      <section className="validation-kpi-grid">
        <Kpi label="Best model MAE" value={`${best.mae.toFixed(3)} s/lap`} meta={best.method} />
        <Kpi label="Naive baseline MAE" value={`${baseline?.mae.toFixed(3) ?? "—"} s/lap`} meta="Raw lap time against tyre age" />
        <Kpi label="90% interval coverage" value={`${coverage?.empirical.toFixed(1) ?? "—"}%`} meta="Target: 90%" />
        <Kpi label="Compound order accuracy" value={`${best.compound_order_pct}%`} meta="Correct performance ranking" />
      </section>

      <section className="validation-panel">
        <div className="panel-heading"><div><div className="section-kicker">MODEL SCOREBOARD</div><h2>Held-out performance</h2></div><span className="panel-note">Lower MAE is better</span></div>
        <div className="validation-table-wrap"><table className="validation-table"><thead><tr><th>Method</th><th>MAE</th><th>Compound ordering</th><th>Infeasible stints</th><th>90% coverage</th></tr></thead><tbody>{ranked.map((row) => <tr key={row.method} className={row.method === best.method ? "best-validation-row" : ""}><td>{row.method}</td><td>{row.mae.toFixed(3)} s/lap</td><td>{row.compound_order_pct}%</td><td>{row.infeasible_stint_pct}%</td><td>{row.coverage_90 == null ? "—" : `${row.coverage_90}%`}</td></tr>)}</tbody></table></div>
      </section>

      <div className="validation-chart-grid">
        <section className="validation-panel"><div className="panel-heading"><div><div className="section-kicker">UNCERTAINTY</div><h2>Calibration</h2></div></div><p className="validation-description">If the model says a 90% interval, the observed outcome should fall inside it roughly 90% of the time.</p><ReliabilityDiagram /></section>
        <section className="validation-panel"><div className="panel-heading"><div><div className="section-kicker">ABLATION</div><h2>What actually helps?</h2></div></div><p className="validation-description">Each bar shows how much error increases when one correction is removed from the full model.</p><AblationBars /></section>
      </div>

      <section className="validation-panel validation-scope"><div className="section-kicker">HONEST SCOPE</div><h2>What this proves—and what it does not</h2><div className="scope-grid"><div><strong>It proves</strong><p>Whether the current model generalizes to held-out data, preserves compound ordering, and produces calibrated uncertainty.</p></div><div><strong>It does not yet prove</strong><p>Live sensor reliability, real-time pit-stop optimality, or performance across every circuit and weather regime.</p></div></div></section>
    </div>
  );
}

function Kpi({ label, value, meta }: { label: string; value: string; meta: string }) { return <div className="validation-kpi"><span>{label}</span><strong>{value}</strong><small>{meta}</small></div>; }
