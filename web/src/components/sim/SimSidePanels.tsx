"use client";

/* Right-hand column of the Live Simulation: tyre condition, strategy call,
   and the model-state list (what is fitted vs still prior). */

import { COMPOUND_HEX } from "@/lib/data";
import { compoundLabel } from "@/components/ui";
import { TYPICAL_STINT_LAPS } from "@/lib/sim/constants";
import type { LapAnalysis, RaceData, RaceLap } from "@/lib/sim/types";

export function TyrePanel({ lap, analysis }: { lap: RaceLap; analysis: LapAnalysis }) {
  const t = analysis.tyre;
  const color =
    t.wearPct < 60 ? "var(--good)" : t.wearPct < 90 ? "var(--warning)" : "var(--critical)";
  const typical = TYPICAL_STINT_LAPS[lap.compound] ?? 25;
  return (
    <section className="card">
      <div className="card-head" style={{ marginBottom: 10 }}>
        <div className="card-title">
          Tyre —{" "}
          <span style={{ color: COMPOUND_HEX[lap.compound as keyof typeof COMPOUND_HEX] }}>
            {compoundLabel(lap.compound)}
          </span>
          , age {lap.tyre_age}
        </div>
      </div>
      <div className="tyre-meter">
        <div className="track">
          <div className="fill" style={{ width: `${Math.min(t.wearPct, 100)}%`, background: color }} />
        </div>
        <div className="lbl">
          <span>{t.wearPct.toFixed(0)}% of typical {typical}-lap stint</span>
          <span>{t.remainingLaps} laps to typical change</span>
        </div>
      </div>
      <div className="rec-lines" style={{ marginTop: 12 }}>
        <div className="rec-line">
          <span className="k">
            {analysis.evidence.state === "INSUFFICIENT" ? "Deg rate (preliminary)" : "Fitted deg rate"}
          </span>
          <span className="v">
            {t.degRate.toFixed(3)} ± {t.degRatePm.toFixed(3)} s/lap
          </span>
        </div>
        <div className="rec-line">
          <span className="k">Projected loss, +5 laps</span>
          <span className="v">+{t.projLossIn5.toFixed(2)} s</span>
        </div>
        {analysis.evidence.state === "INSUFFICIENT" && (
          <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--warn, #f59e0b)" }}>
            ⚠ Preliminary: {analysis.evidence.reason}
          </div>
        )}
      </div>
      <p className="note" style={{ marginTop: 10 }}>
        {analysis.evidence.state === "INSUFFICIENT"
          ? `Preliminary posterior — ${analysis.evidence.reason}. The estimate updates online as laps arrive.`
          : "Wear % is age vs measured average stint lengths (RESEARCH §1) — a yardstick, not a carcass measurement; nothing public measures actual wear."}
      </p>
    </section>
  );
}

export function StrategyPanel({ analysis, race }: { analysis: LapAnalysis; race: RaceData }) {
  const s = analysis.strategy;
  return (
    <section className="card">
      <div className="card-head" style={{ marginBottom: 10 }}>
        <div className="card-title">Strategy</div>
      </div>
      {s.optimalPitLap != null ? (
        <>
          <div className="hero-number" style={{ fontSize: 32 }}>
            Pit lap {s.optimalPitLap}
            {s.targetCompound && (
              <span className="unit">→ {compoundLabel(s.targetCompound)}</span>
            )}
          </div>
          <div className="rec-lines" style={{ marginTop: 10 }}>
            <div className="rec-line">
              <span className="k">Window (within 1 s)</span>
              <span className="v">
                laps {s.windowLo}–{s.windowHi}
              </span>
            </div>
            <div className="rec-line">
              <span className="k">P(optimal ≤ 3 laps away)</span>
              <span className="v">{(s.pitNowProb * 100).toFixed(0)}%</span>
            </div>
            <div className="rec-line">
              <span className="k">Pit loss assumed</span>
              <span className="v">{(race.pit_loss_s ?? 22).toFixed(1)} s</span>
            </div>
          </div>
        </>
      ) : (
        <div className="hero-number" style={{ fontSize: 32 }}>
          Stay out
        </div>
      )}
      <p className="rec-reason" style={{ marginTop: 10 }}>{s.reason}</p>
    </section>
  );
}

export function ModelStatePanel({ analysis }: { analysis: LapAnalysis }) {
  return (
    <section className="card">
      <div className="card-head" style={{ marginBottom: 10 }}>
        <div>
          <div className="card-title">Model state</div>
          <div className="card-sub">{analysis.nCleanFitted} clean laps fitted</div>
        </div>
      </div>
      <div className="gap-list">
        {analysis.components.map((c) => (
          <div className="gap-row" key={c.key} style={{ padding: "8px 14px" }}>
            <span className="g-comp" style={{ minWidth: 130, fontSize: 12 }}>{c.label}</span>
            <span className={`conf ${c.confidence}`} style={{ marginLeft: "auto" }}>
              {c.priorDominated ? "PRIOR-DOMINATED" : `${c.confidence} CONFIDENCE`}
            </span>
          </div>
        ))}
      </div>
      <p className="note" style={{ marginTop: 12 }}>
        Priors and their sources: <code>web/src/lib/sim/constants.ts</code> → docs/RESEARCH.md.
        A prior-dominated coefficient means this race hasn&apos;t yet taught the model more
        than the literature already said.
      </p>
    </section>
  );
}
