import { FuelPlanner } from "@/components/FuelPlanner";
import { FuelSlider } from "@/components/FuelSlider";
import { WaterfallChart } from "@/components/WaterfallChart";
import { posterior, waterfall } from "@/lib/data";

const signals = [
  { label: "Fuel load", value: posterior.confounder_decomposition.fuel_s_per_lap, unit: "s/lap", note: "Mass makes every lap slower" },
  { label: "Track evolution", value: posterior.confounder_decomposition.track_evo_s_per_lap, unit: "s/lap", note: "Grip changes as the session runs" },
  { label: "Traffic", value: posterior.confounder_decomposition.traffic_s_per_lap, unit: "s/lap", note: "Cars ahead hide true pace" },
  { label: "Tyre signal", value: Math.abs(posterior.confounder_decomposition.residual_true_deficit), unit: "s/lap", note: "The signal we want to estimate" },
];

export default function DeconfoundPage() {
  return (
    <div className="deconfound-page">
      <header>
        <div className="eyebrow">CLEANROOM / DECONFOUND</div>
        <h1>Remove the noise</h1>
        <p className="lede">Raw lap time is not tyre degradation. This page separates fuel, traffic and track evolution before estimating the true tyre signal.</p>
      </header>

      <section className="deconfound-hero" aria-label="Raw versus corrected pace">
        <div><span>RAW TIMING-SHEET GAP</span><strong>{waterfall.apparent_gap_s.toFixed(2)}<small> s/lap</small></strong><p>Everything mixed together</p></div>
        <div className="deconfound-arrow">→</div>
        <div><span>CORRECTED TYRE SIGNAL</span><strong>{waterfall.true_deficit_s.toFixed(2)}<small> s/lap</small></strong><p>90% interval {waterfall.true_deficit_ci[0].toFixed(2)}–{waterfall.true_deficit_ci[1].toFixed(2)}</p></div>
      </section>

      <section className="deconfound-panel">
        <div className="panel-heading"><div><div className="section-kicker">MODEL INPUTS</div><h2>What gets removed?</h2></div><span className="demo-pill">DEMO INFERENCE</span></div>
        <div className="confounder-grid">
          {signals.map((signal) => <div className="confounder-card" key={signal.label}><span>{signal.label}</span><strong>{signal.value.toFixed(2)} {signal.unit}</strong><small>{signal.note}</small></div>)}
        </div>
        <p className="method-note">The live version will replace these fixture estimates with synchronized car telemetry: fuel mass, GPS gaps, weather, throttle, brake and tyre sensors.</p>
      </section>

      <section className="deconfound-panel">
        <div className="panel-heading"><div><div className="section-kicker">EXPLAINABILITY</div><h2>Where the gap actually comes from</h2></div><span className="panel-note">90% credible intervals</span></div>
        <p className="panel-description">Each waterfall step is an estimated effect. The final bar is the remaining tyre/car deficit after confounders are corrected.</p>
        <WaterfallChart />
      </section>

      <section className="deconfound-panel deconfound-interaction">
        <div className="panel-heading"><div><div className="section-kicker">WHAT-IF CONTROL</div><h2>Change the assumed fuel load</h2></div><span className="panel-note">Updates downstream strategy</span></div>
        <p className="panel-description">Drag the load to see how pace, degradation, feasible stint length and the recommended run change together.</p>
        <FuelPlanner />
      </section>

      <section className="deconfound-panel">
        <div className="panel-heading"><div><div className="section-kicker">SENSITIVITY CHECK</div><h2>How fragile is the result?</h2></div><span className="panel-note">Coefficient stress test</span></div>
        <p className="panel-description">This control shows why using one industry fuel coefficient can invert compound rankings. The production model should estimate this from telemetry.</p>
        <FuelSlider />
      </section>
    </div>
  );
}
