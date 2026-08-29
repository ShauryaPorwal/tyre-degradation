"use client";

/* The fuel-load slider — the demo's centre interaction. One input (kg of
   fuel for the next run) drives, live: expected pace, degradation rate,
   feasible stint length, the recommended run, and the strategy confidence
   that Screen 4 inherits. Input → model → changed prediction → changed
   decision, visibly.

   All coupling logic lives in lib/runplan.ts (shared with Screen 4);
   this file is only the surface. */

import Link from "next/link";
import { useEffect, useRef } from "react";
import { COMPOUND_HEX, type Compound } from "@/lib/data";
import { compoundLabel } from "@/components/ui";
import { STORY_FUEL_EVENT } from "@/components/StoryMode";
import {
  BURN_RATE_KG_LAP,
  FUEL_MAX_KG,
  FUEL_MIN_KG,
  FUEL_REF_KG,
  setFuelKg,
  useRunPlan,
} from "@/lib/runplan";

const FUEL_PRESETS = [
  { label: "Quali sim 15", kg: 15 },
  { label: "Short run 35", kg: 35 },
  { label: "Long run 60", kg: 60 },
  { label: "Race start 105", kg: 105 },
];

export function FuelPlanner() {
  const plan = useRunPlan();
  const fuel = plan.fuelKg;
  const animRef = useRef<number | null>(null);

  // Story Mode auto-drag: glide 60 → 105 (heavy) → 15 (quali) → 60. One
  // smooth movement so the judge sees every readout move with the input.
  useEffect(() => {
    const run = () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      const start = performance.now();
      const seq: { at: number; from: number; to: number }[] = [
        { at: 0, from: 60, to: 105 },
        { at: 1400, from: 105, to: 105 },
        { at: 2000, from: 105, to: 15 },
        { at: 3400, from: 15, to: 15 },
        { at: 4000, from: 15, to: 60 },
      ];
      const total = 5000;
      const tick = (now: number) => {
        const t = now - start;
        const seg = [...seq].reverse().find((s) => t >= s.at) ?? seq[0];
        const next = seq[seq.indexOf(seg) + 1];
        const segEnd = next ? next.at : total;
        const p = Math.min((t - seg.at) / Math.max(segEnd - seg.at, 1), 1);
        setFuelKg(Math.round(seg.from + (seg.to - seg.from) * p));
        if (t < total) animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
    };
    window.addEventListener(STORY_FUEL_EVENT, run);
    return () => {
      window.removeEventListener(STORY_FUEL_EVENT, run);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const focus = plan.compounds.find((c) => c.compound === plan.best.compound)!;
  const softPlan = plan.compounds.find((c) => c.compound === "SOFT");

  return (
    <>
      <div className="slider-row">
        <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
          {FUEL_MIN_KG} kg
        </span>
        <input
          type="range"
          min={FUEL_MIN_KG}
          max={FUEL_MAX_KG}
          step={1}
          value={fuel}
          onChange={(e) => setFuelKg(Number(e.target.value))}
          aria-label="Next-run fuel load, kilograms"
        />
        <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
          {FUEL_MAX_KG} kg
        </span>
        <span className="slider-readout">{fuel.toFixed(0)} kg</span>
      </div>

      <div className="chip-row" style={{ marginTop: 14 }}>
        {FUEL_PRESETS.map((p) => (
          <button
            key={p.label}
            className="btn"
            onClick={() => setFuelKg(p.kg)}
            style={{ opacity: fuel === p.kg ? 1 : 0.6 }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* live consequences — every figure recomputes on drag */}
      <div className="plan-grid" style={{ marginTop: 22 }}>
        <div className="plan-cell">
          <div className="k">Pace vs session mean load</div>
          <div className="v">
            {plan.paceDeltaVsRef >= 0 ? "+" : "−"}
            {Math.abs(plan.paceDeltaVsRef).toFixed(2)}
            <span className="u">s/lap</span>
          </div>
          <div className="m">
            fitted 0.032 s/kg × {(fuel - FUEL_REF_KG).toFixed(0)} kg
          </div>
        </div>

        <div className="plan-cell">
          <div className="k">Tyre energy per lap</div>
          <div className="v">
            ×{focus.degMultiplier.toFixed(3)}
          </div>
          <div className="m">
            mass scaling — degradation{" "}
            {focus.degPerLap != null
              ? `${focus.degPerLap.toFixed(3)} s/lap on ${compoundLabel(focus.compound)}`
              : "unknown on " + compoundLabel(focus.compound)}
          </div>
        </div>

        <div className="plan-cell">
          <div className="k">Fuel-limited run length</div>
          <div className="v">
            {focus.maxRunLaps}
            <span className="u">laps</span>
          </div>
          <div className="m">at {BURN_RATE_KG_LAP.toFixed(1)} kg/lap burn</div>
        </div>

        <div className="plan-cell">
          <div className="k">Soft cliff arrives</div>
          <div className="v">
            {softPlan?.cliffLap != null ? (
              <>
                lap {softPlan.cliffLap.toFixed(0)}
              </>
            ) : (
              "—"
            )}
          </div>
          <div className="m">fixed energy → earlier when heavy</div>
        </div>
      </div>

      {/* the changed decision, inherited by Screen 4 */}
      <div className="plan-rec">
        <div className="plan-rec-main">
          <span className="k">Recommended next run</span>
          <span className="rec-pill">
            <span
              className="swatch"
              style={{ background: COMPOUND_HEX[plan.best.compound as Compound] }}
            />
            {compoundLabel(plan.best.compound).toUpperCase()} × {plan.best.laps} laps
          </span>
          <span className="v" style={{ fontVariant: "tabular-nums" }}>
            ±{plan.best.sigmaBefore.toFixed(3)} → ±{plan.best.sigmaAfter.toFixed(3)} s/lap
          </span>
          <span className="delta">−{(plan.best.reduction * 100).toFixed(0)}%</span>
        </div>
        <div className="plan-rec-sub">
          One-stop call confidence {(plan.oneStopBefore * 100).toFixed(0)}% →{" "}
          {(plan.oneStopAfter * 100).toFixed(0)}%
          {plan.best.hitsCliff && " · run truncated at the cliff"}
          {" · "}
          <Link href="/next" className="carry-link">
            carried into Next Run →
          </Link>
        </div>
      </div>
    </>
  );
}
