"use client";

/* Screen 4 — Next Run, live. Reads the shared run plan (lib/runplan.ts) so
   the recommendation here is the same object the Screen-2 fuel slider
   manipulates: change the fuel load there, the decision changes here.
   Components: F101 VOI recommendation · F103 strategic value · F102 gaps ·
   the consequence line ("why this matters"). */

import Link from "next/link";
import { decision, sessionMeta } from "@/lib/data";
import { compoundLabel } from "@/components/ui";
import { FUEL_REF_KG, setFuelKg, useRunPlan } from "@/lib/runplan";

export function NextRunLive() {
  const plan = useRunPlan();
  const rec = plan.best;
  const alternatives = plan.candidates
    .filter((c) => !(c.compound === rec.compound && c.laps === rec.laps))
    .sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.reduction - a.reduction);

  return (
    <>
      <div className="eyebrow">{sessionMeta.display_name} · recommended next run</div>

      <div className="rec-card">
        <div className="rec-headline">
          {compoundLabel(rec.compound).toUpperCase()} × {rec.laps} laps
        </div>

        <div className="rec-lines">
          <div className="rec-line">
            <span className="k">Uncertainty</span>
            <span className="v">
              ±{rec.sigmaBefore.toFixed(3)} → ±{rec.sigmaAfter.toFixed(3)} s/lap
            </span>
            <span className="delta">−{(rec.reduction * 100).toFixed(0)}%</span>
          </div>
          <div className="rec-line">
            <span className="k">One-stop probability</span>
            <span className="v">
              {(plan.oneStopBefore * 100).toFixed(0)}% → {(plan.oneStopAfter * 100).toFixed(0)}%
            </span>
          </div>
          <div className="rec-line">
            <span className="k">Planned fuel load</span>
            <span className="v">{plan.fuelKg.toFixed(0)} kg</span>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
              set on{" "}
              <Link href="/deconfound" style={{ textDecoration: "underline" }}>
                Deconfound
              </Link>
            </span>
          </div>
        </div>

        <p className="rec-reason">{plan.reason}</p>

        {/* Why this matters — the consequence of NOT running it. Derived from
            the EVSI fixture anchors: forced to call the strategy now you take
            the likelier branch and are wrong with P = min(p, 1−p). */}
        <p className="consequence">
          Without this run, there is a{" "}
          <b>{(plan.wrongCallNow * 100).toFixed(0)}% chance of choosing the wrong pit
          strategy</b>
          . After it, {(plan.wrongCallAfter * 100).toFixed(0)}%.
        </p>

        <details className="data-table">
          <summary>See alternatives ({alternatives.length})</summary>
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th className="num">σ now</th>
                <th className="num">σ after</th>
                <th className="num">Reduction</th>
                <th>Feasible at {plan.fuelKg.toFixed(0)} kg</th>
              </tr>
            </thead>
            <tbody>
              {alternatives.map((r) => (
                <tr key={`${r.compound}-${r.laps}`} style={r.feasible ? undefined : { opacity: 0.5 }}>
                  <td>
                    {compoundLabel(r.compound)} × {r.laps} laps
                  </td>
                  <td className="num">±{r.sigmaBefore.toFixed(3)}</td>
                  <td className="num">±{r.sigmaAfter.toFixed(3)}</td>
                  <td className="num">−{(r.reduction * 100).toFixed(0)}%</td>
                  <td>{r.feasible ? "yes" : r.blockedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      {/* F102 — what we still don't know (fuel-independent posterior state) */}
      <div className="section-rule">What we still don&apos;t know</div>
      <div className="gap-list">
        {decision.knowledge_gaps.map((g) => (
          <div key={g.compound} className="gap-row">
            <span className={`dot ${g.state}`} aria-label={g.state} />
            <span className="g-comp">{compoundLabel(g.compound).toUpperCase()}</span>
            <span className="g-sigma">±{g.sigma.toFixed(3)} s/lap</span>
            <span className="g-blocks">
              {g.blocks ? (
                <>
                  blocks: <b>{g.blocks}</b>
                </>
              ) : (
                "blocks: nothing"
              )}
            </span>
          </div>
        ))}
      </div>

      {plan.fuelKg !== Math.round(FUEL_REF_KG) && (
        <p className="note" style={{ marginTop: 20 }}>
          This plan assumes the {plan.fuelKg.toFixed(0)} kg load set on Deconfound.{" "}
          <button
            className="link-btn"
            onClick={() => setFuelKg(60)}
            style={{ textDecoration: "underline" }}
          >
            Reset to the 60 kg long-run default
          </button>
          .
        </p>
      )}

      {/* ADDITIONS.md F101 honest limitation — stated, not hidden */}
      <p className="note" style={{ marginTop: 12 }}>
        A recommendation is only as trustworthy as the posterior beneath it. The validated
        backtest (see &ldquo;How do we know?&rdquo;) is the proof; this screen is what the proof
        buys you.
      </p>
    </>
  );
}
