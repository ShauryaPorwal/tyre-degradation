import { CurvesScreen } from "@/components/CurvesScreen";
import {
  COMPOUND_HEX,
  posterior,
  sessionMeta,
} from "@/lib/data";

const TYRES = [
  { name: "SOFT", fixtureKey: "SOFT", color: COMPOUND_HEX.SOFT },
  { name: "MEDIUM", fixtureKey: "MEDIUM", color: COMPOUND_HEX.MEDIUM },
  { name: "HARD", fixtureKey: "HARD", color: COMPOUND_HEX.HARD },
  { name: "INTERMEDIATE", fixtureKey: null, color: "#35d68a" },
  { name: "WET", fixtureKey: null, color: "#3da9ff" },
] as const;

export default function CurvesPage() {
  return (
    <div className="tyre-intelligence-page">
      <header>
        <div className="eyebrow">CLEANROOM / TYRE INTELLIGENCE</div>
        <div className="tyre-title-row">
          <div>
            <h1>Tyre health and degradation</h1>
            <p className="lede">Compare pace loss, evidence quality and cliff risk across all five tyre categories. The current fixture contains dry-tyre data only.</p>
          </div>
          <span className="demo-pill">DEMO DATA</span>
        </div>
      </header>

      <section className="tyre-summary-grid" aria-label="Tyre compound summary">
        {TYRES.map((tyre) => {
          const suff = tyre.fixtureKey ? sessionMeta.sufficiency[tyre.fixtureKey] : null;
          const fit = tyre.fixtureKey ? posterior.compounds[tyre.fixtureKey] : null;
          return (
            <article className="tyre-summary-card" key={tyre.name}>
              <div className="tyre-summary-top"><span className="tyre-color" style={{ background: tyre.color }} /><strong>{tyre.name}</strong><span className={`tyre-state ${suff?.state.toLowerCase() ?? "unavailable"}`}>{suff?.state ?? "UNAVAILABLE"}</span></div>
              <div className="tyre-summary-value">{fit ? `${fit.slope_per_lap_equiv.toFixed(3)} s/lap` : "—"}</div>
              <div className="tyre-summary-meta">{fit ? `${suff?.n_clean_laps ?? 0} clean laps · ±${suff?.sigma_s_per_lap.toFixed(3)} s/lap` : "Needs wet-weather sensor data"}</div>
              {fit?.cliff.accepted && <div className="cliff-note">Cliff detected near energy {fit.cliff.knot_energy?.toFixed(1)}</div>}
            </article>
          );
        })}
      </section>

      <section className="tyre-explain-panel">
        <div className="section-kicker">HOW TO READ THIS PAGE</div>
        <p><strong>Degradation rate</strong> is the estimated pace lost per tyre-age equivalent. <strong>Confidence</strong> is based on clean-lap coverage and interval width. A tyre cliff is shown only when the model has enough evidence; it is never inferred from a single slow lap.</p>
      </section>

      <CurvesScreen />
    </div>
  );
}
