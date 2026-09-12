import Link from "next/link";
import {
  COMPOUND_HEX,
  decision,
  features,
  laps,
  posterior,
  sessionMeta,
} from "@/lib/data";

const DEMO_DRIVER = laps[0]?.driver ?? "VER";
const driverLaps = laps
  .filter((lap) => lap.driver === DEMO_DRIVER)
  .sort((a, b) => a.lap_number - b.lap_number);
const currentLap = driverLaps.at(-1) ?? laps[0];
const latestCleanFeature = features.at(-1);
const recommendation = decision.recommendations[0];
const currentCompound = currentLap?.compound ?? "MEDIUM";
const currentAge = currentLap?.tyre_life ?? 0;
const fuel = latestCleanFeature?.fuel_kg ?? 0;
const latestLapTime = currentLap?.lap_time ?? 0;
const trackTemp = currentLap?.track_temp ?? 0;
const airTemp = currentLap?.air_temp ?? 0;

const PIT_WALL_TYRES = [
  { key: "SOFT", color: COMPOUND_HEX.SOFT, fixtureKey: "SOFT" },
  { key: "MEDIUM", color: COMPOUND_HEX.MEDIUM, fixtureKey: "MEDIUM" },
  { key: "HARD", color: COMPOUND_HEX.HARD, fixtureKey: "HARD" },
  { key: "INTERMEDIATE", color: "#39d98a", fixtureKey: null },
  { key: "WET", color: "#38a4ff", fixtureKey: null },
] as const;

export default function PitWallPage() {
  return (
    <div className="pit-wall-page">
      <header className="pit-wall-intro">
        <div className="eyebrow">CLEANROOM / LIVE PIT WALL</div>
        <div className="pit-wall-title-row">
          <div>
            <h1>Race Decision Center</h1>
            <p className="lede">
              Decision support for tyre life, pace, fuel and traffic. This screen is currently powered by clearly labelled demo telemetry.
            </p>
          </div>
          <span className="demo-pill">DEMO DATA</span>
        </div>
      </header>

      <section className="pit-decision-card" aria-label="Recommended pit decision">
        <div className="decision-copy">
          <div className="section-kicker">RECOMMENDED ACTION · DEMO INFERENCE</div>
          <div className="decision-action">PLAN NEXT RUN</div>
          <p>{recommendation?.reason ?? "Not enough telemetry to make a pit recommendation."}</p>
        </div>
        <div className="decision-values">
          <Metric label="Suggested compound" value={recommendation?.compound ?? "—"} />
          <Metric label="Run length" value={recommendation ? `${recommendation.laps} laps` : "—"} />
          <Metric label="Confidence gain" value={recommendation ? `+${(recommendation.expected_uncertainty_reduction * 100).toFixed(0)}%` : "—"} />
        </div>
      </section>

      <section className="pit-kpi-grid" aria-label="Current car status">
        <MetricCard label="Current lap" value={`${currentLap?.lap_number ?? "—"}`} meta={`${sessionMeta.n_laps} recorded session laps`} />
        <MetricCard label="Last lap time" value={latestLapTime ? `${latestLapTime.toFixed(3)} s` : "—"} meta={`Driver ${DEMO_DRIVER}`} />
        <MetricCard label="Fuel estimate" value={fuel ? `${fuel.toFixed(1)} kg` : "—"} meta="Fixture telemetry estimate" />
        <MetricCard label="Tyre age" value={`${currentAge} laps`} meta={`${currentCompound} compound`} />
      </section>

      <div className="pit-wall-columns">
        <section className="pit-panel">
          <div className="panel-heading">
            <div>
              <div className="section-kicker">TYRE INTELLIGENCE</div>
              <h2>Compound health</h2>
            </div>
            <span className="panel-note">5 tyre categories</span>
          </div>

          <div className="compound-stack">
            {PIT_WALL_TYRES.map((tyre) => {
              const data = tyre.fixtureKey ? sessionMeta.sufficiency[tyre.fixtureKey] : null;
              const posteriorData = tyre.fixtureKey ? posterior.compounds[tyre.fixtureKey] : null;
              return (
                <div className="compound-row" key={tyre.key}>
                  <span className="compound-swatch" style={{ background: tyre.color }} />
                  <strong>{tyre.key}</strong>
                  <span>{data ? `${data.n_clean_laps} clean laps` : "No demo laps"}</span>
                  <span>{posteriorData ? `${posteriorData.slope_per_lap_equiv.toFixed(3)} s/lap` : "Awaiting feed"}</span>
                  <span className={`evidence-state ${data?.state?.toLowerCase() ?? "unavailable"}`}>{data?.state ?? "UNAVAILABLE"}</span>
                </div>
              );
            })}
          </div>

          <div className="sensor-warning">
            The current fixture contains dry Soft, Medium and Hard laps only. Intermediate and Wet require rain/weather telemetry. Tyre pressure, inner/middle/outer temperature and cliff probability require the new sensor feed.
          </div>
        </section>

        <section className="pit-panel">
          <div className="panel-heading">
            <div>
              <div className="section-kicker">RACE CONTEXT</div>
              <h2>Conditions and pace</h2>
            </div>
          </div>
          <div className="context-grid">
            <Metric label="Track temperature" value={`${trackTemp.toFixed(1)}°C`} />
            <Metric label="Air temperature" value={`${airTemp.toFixed(1)}°C`} />
            <Metric label="Track evolution" value={`${posterior.confounder_decomposition.track_evo_s_per_lap.toFixed(3)} s/lap`} />
            <Metric label="Traffic effect" value={`${posterior.confounder_decomposition.traffic_s_per_lap.toFixed(3)} s/lap`} />
          </div>
          <div className="explain-strip">
            <strong>Why this matters</strong>
            <span>Raw lap time is corrected for fuel, traffic and track evolution before tyre pace is estimated.</span>
          </div>
        </section>
      </div>

      <section className="pit-panel strategy-panel">
        <div className="panel-heading">
          <div>
            <div className="section-kicker">STRATEGY OPTIONS</div>
            <h2>What should the crew do?</h2>
          </div>
          <Link className="panel-link" href="/next">Open strategy detail →</Link>
        </div>
        <div className="strategy-table-wrap">
          <table className="strategy-table">
            <thead><tr><th>Option</th><th>Compound</th><th>Target laps</th><th>Uncertainty after run</th><th>Decision</th></tr></thead>
            <tbody>
              {decision.recommendations.slice(0, 4).map((item, index) => (
                <tr key={`${item.compound}-${item.laps}-${index}`} className={index === 0 ? "recommended-row" : ""}>
                  <td>{index === 0 ? "Recommended" : `Option ${index + 1}`}</td>
                  <td>{item.compound}</td>
                  <td>{item.laps}</td>
                  <td>{item.projected_sigma.toFixed(3)} s/lap</td>
                  <td>{index === 0 ? "SELECT" : "COMPARE"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pit-panel decomposition-panel">
        <div className="panel-heading">
          <div>
            <div className="section-kicker">LATEST LAP READ-OUT</div>
            <h2>What changed?</h2>
          </div>
          <span className="panel-note">Lap {currentLap?.lap_number ?? "—"}</span>
        </div>
        <div className="decomposition-grid">
          <Metric label="Tyre degradation" value={`+${posterior.confounder_decomposition.residual_true_deficit.toFixed(3)} s`} />
          <Metric label="Fuel correction" value={`${posterior.confounder_decomposition.fuel_s_per_lap.toFixed(3)} s/lap`} />
          <Metric label="Traffic correction" value={`${posterior.confounder_decomposition.traffic_s_per_lap.toFixed(3)} s/lap`} />
          <Metric label="Confidence gate" value={posterior.confidence_gate} />
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, meta }: { label: string; value: string; meta: string }) {
  return <div className="pit-metric-card"><span>{label}</span><strong>{value}</strong><small>{meta}</small></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="pit-metric"><span>{label}</span><strong>{value}</strong></div>;
}
