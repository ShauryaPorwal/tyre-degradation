"use client";

import Link from "next/link";
import { decision, sessionMeta } from "@/lib/data";
import { compoundLabel } from "@/components/ui";
import { FUEL_REF_KG, setFuelKg, useRunPlan } from "@/lib/runplan";

export function NextRunLive() {
  const plan = useRunPlan();
  const rec = plan.best;
  const alternatives = plan.candidates
    .filter((candidate) => !(candidate.compound === rec.compound && candidate.laps === rec.laps))
    .sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.reduction - a.reduction);

  return (
    <div className="strategy-page">
      <header>
        <div className="eyebrow">CLEANROOM / PIT STRATEGY</div>
        <div className="strategy-title-row">
          <div>
            <h1>When should we pit?</h1>
            <p className="lede">Compare pit windows using tyre life, fuel, traffic and uncertainty. This recommendation is currently based on labelled demo data.</p>
          </div>
          <span className="demo-pill">DEMO STRATEGY</span>
        </div>
      </header>

      <section className="strategy-call" aria-label="Recommended pit strategy">
        <div>
          <div className="section-kicker">PRIMARY CALL</div>
          <div className="strategy-call-action">PREPARE {compoundLabel(rec.compound).toUpperCase()}</div>
          <p>{plan.reason}</p>
        </div>
        <div className="strategy-window">
          <span>PIT WINDOW</span>
          <strong>LAP {Math.max(1, rec.laps + 10)}–{Math.max(2, rec.laps + 12)}</strong>
          <small>Target based on current run-plan model</small>
        </div>
      </section>

      <section className="strategy-kpis">
        <Kpi label="Recommended tyre" value={compoundLabel(rec.compound).toUpperCase()} meta={`${rec.laps}-lap information run`} />
        <Kpi label="Uncertainty reduction" value={`−${(rec.reduction * 100).toFixed(0)}%`} meta={`±${rec.sigmaBefore.toFixed(3)} → ±${rec.sigmaAfter.toFixed(3)} s/lap`} />
        <Kpi label="One-stop probability" value={`${(plan.oneStopAfter * 100).toFixed(0)}%`} meta={`was ${(plan.oneStopBefore * 100).toFixed(0)}% before`} />
        <Kpi label="Wrong-call risk" value={`${(plan.wrongCallAfter * 100).toFixed(0)}%`} meta={`now ${(plan.wrongCallNow * 100).toFixed(0)}%`} />
      </section>

      <section className="strategy-panel">
        <div className="panel-heading"><div><div className="section-kicker">DECISION FACTORS</div><h2>Why this pit window?</h2></div><span className="panel-note">Model evidence</span></div>
        <div className="strategy-factor-grid">
          <Factor label="Tyre degradation" value="RISING" detail={`${compoundLabel(rec.compound)} gives the best evidence gain`} tone="warn" />
          <Factor label="Fuel state" value={`${plan.fuelKg.toFixed(0)} kg`} detail="Fuel load changes pace and tyre energy" />
          <Factor label="Traffic risk" value="CHECK GAP" detail="Re-evaluate before committing to the stop" />
          <Factor label="Weather" value="MONITOR" detail="Wet compounds require live weather telemetry" />
        </div>
        <div className="strategy-reason">Without the recommended information, there is a <b>{(plan.wrongCallNow * 100).toFixed(0)}% chance of choosing the wrong strategy</b>. After it, the estimated risk falls to {(plan.wrongCallAfter * 100).toFixed(0)}%.</div>
      </section>

      <section className="strategy-panel">
        <div className="panel-heading"><div><div className="section-kicker">ALTERNATIVE PLANS</div><h2>Compare the options</h2></div><Link className="panel-link" href="/deconfound">Adjust fuel assumptions →</Link></div>
        <div className="strategy-table-wrap">
          <table className="strategy-table">
            <thead><tr><th>Plan</th><th>Compound</th><th>Run</th><th>σ before</th><th>σ after</th><th>Result</th></tr></thead>
            <tbody>
              <tr className="recommended-row"><td>Recommended</td><td>{compoundLabel(rec.compound)}</td><td>{rec.laps} laps</td><td>±{rec.sigmaBefore.toFixed(3)}</td><td>±{rec.sigmaAfter.toFixed(3)}</td><td>SELECT</td></tr>
              {alternatives.slice(0, 6).map((candidate, index) => <tr key={`${candidate.compound}-${candidate.laps}`} className={!candidate.feasible ? "blocked-row" : ""}><td>Alternative {index + 1}</td><td>{compoundLabel(candidate.compound)}</td><td>{candidate.laps} laps</td><td>±{candidate.sigmaBefore.toFixed(3)}</td><td>±{candidate.sigmaAfter.toFixed(3)}</td><td>{candidate.feasible ? "COMPARE" : candidate.blockedBy ?? "BLOCKED"}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="strategy-panel">
        <div className="panel-heading"><div><div className="section-kicker">KNOWLEDGE GAPS</div><h2>What could still change the call?</h2></div></div>
        <div className="gap-list strategy-gap-list">
          {decision.knowledge_gaps.map((gap) => <div className="gap-row" key={gap.compound}><span className={`dot ${gap.state}`} /><b>{compoundLabel(gap.compound).toUpperCase()}</b><span>±{gap.sigma.toFixed(3)} s/lap</span><span>{gap.blocks ? `Blocks ${gap.blocks}` : "No blocking gap"}</span></div>)}
        </div>
        <p className="strategy-note">This is a practice-data recommendation, not a live race command. A production pit call must add current position, gaps, pit-lane loss, tyre warm-up, safety-car probability and weather forecast from the telemetry backend.</p>
      </section>

      {plan.fuelKg !== Math.round(FUEL_REF_KG) && <p className="note">This plan assumes {plan.fuelKg.toFixed(0)} kg. <button className="link-btn" onClick={() => setFuelKg(60)}>Reset to 60 kg default</button>.</p>}
    </div>
  );
}

function Kpi({ label, value, meta }: { label: string; value: string; meta: string }) { return <div className="strategy-kpi"><span>{label}</span><strong>{value}</strong><small>{meta}</small></div>; }
function Factor({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "warn" }) { return <div className="strategy-factor"><span>{label}</span><strong className={tone === "warn" ? "factor-warn" : ""}>{value}</strong><small>{detail}</small></div>; }
