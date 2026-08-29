"use client";

/* F79 — the single fuel-coefficient slider (docs/UI.md Screen 2).
   One control, one purpose: drag the assumed s/kg value and watch the
   fitted compound picture break, live. The full bar-chart lab from v1 was
   cut — the waterfall above is this screen's chart (rule 2).
   Listens for the Story Mode auto-drag event. */

import { useEffect, useMemo, useRef, useState } from "react";
import { ols } from "@/lib/chart";
import { COMPOUND_HEX, COMPOUND_ORDER, mergedCleanLaps, type Compound } from "@/lib/data";
import { compoundLabel } from "@/components/ui";
import { STORY_SLIDER_EVENT } from "@/components/StoryMode";

// Slider presets. 0.03 s/kg: the industry rule-of-thumb every public tool
// assumes; 0.032: the coefficient CLEANROOM fits from telemetry (fixture truth).
const PRESETS = [
  { label: "Naive (0)", k: 0 },
  { label: "Industry 0.030", k: 0.03 },
  { label: "CLEANROOM fit 0.032", k: 0.032 },
];

export function FuelSlider() {
  const [k, setK] = useState(0.032);
  const animRef = useRef<number | null>(null);

  const clean = useMemo(() => mergedCleanLaps(), []);

  // Only compounds actually run in this session — never fit on an empty set
  // (fail loudly, don't render a fake zero slope).
  const present = useMemo(
    () => COMPOUND_ORDER.filter((c) => clean.some((l) => l.compound === c)),
    [clean],
  );
  const absent = COMPOUND_ORDER.filter((c) => !present.includes(c));

  // Re-fit per compound at the chosen coefficient: naive age regression on
  // fuel-corrected lap times. This is Baseline B with k as a free dial.
  const fits = useMemo(() => {
    const out = {} as Record<Compound, { slope: number; intercept: number; n: number }>;
    for (const c of present) {
      const rows = clean.filter((l) => l.compound === c);
      const f = ols(
        rows.map((r) => r.tyre_life),
        rows.map((r) => r.lap_time - k * r.fuel_kg),
      );
      out[c] = { ...f, n: rows.length };
    }
    return out;
  }, [clean, k, present]);

  // Story Mode auto-drag: glide to 0 (breaks the fit), hold, glide back to
  // the fitted 0.032. One smooth movement, per the demo note in UI.md.
  useEffect(() => {
    const run = () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      const start = performance.now();
      const seq = [
        { at: 0, from: 0.032, to: 0 },
        { at: 1600, from: 0, to: 0 }, // hold on the broken value
        { at: 2800, from: 0, to: 0.032 },
      ];
      const total = 4400;
      const tick = (now: number) => {
        const t = now - start;
        const seg = [...seq].reverse().find((s) => t >= s.at) ?? seq[0];
        const next = seq[seq.indexOf(seg) + 1];
        const segEnd = next ? next.at : total;
        const p = Math.min((t - seg.at) / Math.max(segEnd - seg.at, 1), 1);
        setK(Number((seg.from + (seg.to - seg.from) * p).toFixed(4)));
        if (t < total) animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
    };
    window.addEventListener(STORY_SLIDER_EVENT, run);
    return () => {
      window.removeEventListener(STORY_SLIDER_EVENT, run);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // Compound ranking by fresh-tyre pace (fitted intercept). Physical
  // ordering: softer compound is faster fresh.
  const ranking = [...present].sort((a, b) => fits[a].intercept - fits[b].intercept);
  const orderOk = ranking.join() === present.join();
  const anyNegative = present.some((c) => fits[c].slope < 0);

  return (
    <>
      <div className="slider-row">
        <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
          0.00
        </span>
        <input
          type="range"
          min={0}
          max={0.06}
          step={0.001}
          value={k}
          onChange={(e) => setK(Number(e.target.value))}
          aria-label="Assumed fuel effect, seconds per kilogram"
        />
        <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
          0.06
        </span>
        <span className="slider-readout">{k.toFixed(3)} s/kg</span>
      </div>

      <div className="chip-row" style={{ marginTop: 14 }}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className="btn"
            onClick={() => setK(p.k)}
            style={{ opacity: Math.abs(k - p.k) < 1e-9 ? 1 : 0.6 }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div className="chip-row" aria-label="Fitted degradation slope per compound">
          {present.map((c) => {
            const s = fits[c].slope;
            const bad = s < 0;
            return (
              <span className="chip" key={c}>
                <span className="swatch" style={{ background: COMPOUND_HEX[c] }} />
                {compoundLabel(c)}&nbsp;
                <span
                  style={{
                    fontVariant: "tabular-nums",
                    color: bad ? "var(--critical)" : "var(--ink)",
                  }}
                >
                  {s >= 0 ? "+" : "−"}
                  {Math.abs(s).toFixed(3)} s/lap
                </span>
              </span>
            );
          })}
        </div>
        <span className={`verdict ${orderOk && !anyNegative ? "ok" : "bad"}`}>
          {orderOk && !anyNegative
            ? "✓ physical — tyres degrade, softer is faster fresh"
            : anyNegative
              ? "✗ tyres improving with wear — this coefficient is wrong"
              : "✗ compound ordering inverted — physically wrong"}
        </span>
      </div>

      {absent.length > 0 && (
        <p className="note" style={{ marginTop: 14 }}>
          Not run in this session: {absent.map((c) => c.toLowerCase()).join(", ")} — nothing is
          fitted on zero laps.
        </p>
      )}
    </>
  );
}
