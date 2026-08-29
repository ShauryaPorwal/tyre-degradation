"use client";

/* Screen 3 — Curves (docs/UI.md).
   Question: what is the actual degradation?
   Components: F78 curves with credible bands · F48 cliff markers ·
   F49 mechanism as a TAG (not a screen) · live replay as a toggle.
   RED sufficiency suppresses the curve entirely — designed empty state,
   never a greyed-out line (ADDITIONS.md F104). */

import { useMemo, useRef, useState } from "react";
import { niceTicks, ols, scaleLinear, svgPoint } from "@/lib/chart";
import {
  COMPOUND_HEX,
  COMPOUND_ORDER,
  features,
  laps,
  posterior,
  sessionMeta,
  type Compound,
} from "@/lib/data";
import { CompoundLegend, Tooltip, compoundLabel, type TooltipRow } from "@/components/ui";
import { ReplayView } from "@/components/ReplayView";
import { DriverCompare } from "@/components/DriverCompare";

const VB_W = 760;
const VB_H = 400;
const M = { l: 58, r: 96, t: 24, b: 46 };

type Mode = "clean" | "naive";

export function CurvesScreen() {
  const [mode, setMode] = useState<Mode>("clean");
  const [view, setView] = useState<"curves" | "replay" | "compare">("curves");
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ age: number; px: number; py: number } | null>(null);

  // Flying laps only for the scatter context (in/out laps are 8-15 s slower
  // and would stretch the axis into uselessness).
  const flying = useMemo(() => laps.filter((l) => l.is_accurate), []);
  const maxAge = Math.max(...flying.map((l) => l.tyre_life));

  // The gate decides what the clean model is allowed to show.
  const publishable = useMemo(
    () => COMPOUND_ORDER.filter((c) => sessionMeta.sufficiency[c]?.state !== "RED"),
    [],
  );
  const suppressed = COMPOUND_ORDER.filter((c) => !publishable.includes(c));

  // The naive fit can only exist for compounds actually run in the session.
  const present = useMemo(
    () => COMPOUND_ORDER.filter((c) => flying.some((l) => l.compound === c)),
    [flying],
  );

  const [focus, setFocus] = useState<Compound>(
    publishable.includes("MEDIUM") ? "MEDIUM" : publishable[0],
  );

  // Naive fit — Baseline A: lap_time ~ tyre_age, per compound, fuel ignored.
  const naiveFits = useMemo(() => {
    const out = {} as Record<Compound, { slope: number; intercept: number }>;
    for (const c of present) {
      const rows = flying.filter((l) => l.compound === c);
      out[c] = ols(rows.map((r) => r.tyre_life), rows.map((r) => r.lap_time));
    }
    return out;
  }, [flying, present]);

  // Clean model — posterior slopes as per-lap equivalents; CI scales with the
  // energy-slope CI ratio.
  const cleanFits = useMemo(() => {
    const out = {} as Record<Compound, { slope: number; intercept: number; lo: number; hi: number }>;
    for (const c of publishable) {
      const p = posterior.compounds[c];
      out[c] = {
        slope: p.slope_per_lap_equiv,
        intercept: p.base_pace,
        lo: p.slope_per_lap_equiv * (p.slope_ci[0] / p.slope_per_energy),
        hi: p.slope_per_lap_equiv * (p.slope_ci[1] / p.slope_per_energy),
      };
    }
    return out;
  }, [publishable]);

  // Energy → lap-age conversion for cliff markers: mean tyre energy per
  // clean lap, measured from the features data (never a magic constant).
  const meanEnergyPerLap = useMemo(() => {
    const energies = features.filter((f) => f.clean_flag && f.E_tyre > 0).map((f) => f.E_tyre);
    return energies.reduce((a, b) => a + b, 0) / Math.max(energies.length, 1);
  }, []);

  const cliffAge = (c: Compound): number | null => {
    const p = posterior.compounds[c];
    if (!p.cliff.accepted || p.cliff.knot_energy == null || meanEnergyPerLap <= 0) return null;
    return p.cliff.knot_energy / meanEnergyPerLap;
  };

  const yVals = flying.map((l) => l.lap_time);
  const yMin = Math.min(...yVals) - 0.4;
  const yMax = Math.max(...yVals) + 0.4;

  const x = scaleLinear([0, maxAge], [M.l, VB_W - M.r]);
  const y = scaleLinear([yMin, yMax], [VB_H - M.b, M.t]);

  const shown = mode === "clean" ? publishable : present;

  const lineAt = (c: Compound, age: number) =>
    mode === "clean"
      ? cleanFits[c].intercept + cleanFits[c].slope * age
      : naiveFits[c].intercept + naiveFits[c].slope * age;

  const onMove = (e: React.PointerEvent) => {
    if (!svgRef.current || !wrapRef.current) return;
    const p = svgPoint(e, svgRef.current, VB_W, VB_H);
    if (p.x < M.l || p.x > VB_W - M.r) return setHover(null);
    const age = Math.round(Math.min(Math.max(x.invert(p.x), 0), maxAge));
    const r = wrapRef.current.getBoundingClientRect();
    setHover({ age, px: e.clientX - r.left, py: e.clientY - r.top });
  };

  const xTicks = niceTicks(0, maxAge, 6);
  const yTicks = niceTicks(yMin, yMax, 6);

  const tipRows: TooltipRow[] = hover
    ? shown.map((c) => ({
        name: compoundLabel(c),
        value: `${lineAt(c, hover.age).toFixed(2)} s`,
        color: COMPOUND_HEX[c],
      }))
    : [];

  const suff = sessionMeta.sufficiency[focus];
  const focusSlope = mode === "clean" ? cleanFits[focus]?.slope : naiveFits[focus]?.slope;

  return (
    <>
      {/* Rule 3: number first. One compound headline with its interval. */}
      <div className="hero-row" style={{ marginBottom: 24 }}>
        <div>
          <div className="hero-number">
            {focusSlope !== undefined ? (
              <>
                {focusSlope >= 0 ? "" : "−"}
                {Math.abs(focusSlope).toFixed(3)}
                <span className="unit">± {suff.sigma_s_per_lap.toFixed(3)} s/lap</span>
              </>
            ) : (
              "—"
            )}
          </div>
          <div className="hero-sub" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className="seg" role="tablist" aria-label="Compound">
              {publishable.map((c) => (
                <button
                  key={c}
                  className={focus === c ? "on" : ""}
                  onClick={() => setFocus(c)}
                >
                  {compoundLabel(c)}
                </button>
              ))}
            </span>
            {suff.mechanism && <span className="mech-tag">{suff.mechanism}</span>}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <div className="seg" role="tablist" aria-label="View">
            <button className={view === "curves" ? "on" : ""} onClick={() => setView("curves")}>
              Curves
            </button>
            <button className={view === "replay" ? "on" : ""} onClick={() => setView("replay")}>
              Live replay
            </button>
            <button className={view === "compare" ? "on" : ""} onClick={() => setView("compare")}>
              Compare drivers
            </button>
          </div>
        </div>
      </div>

      {view === "replay" ? (
        <ReplayView />
      ) : view === "compare" ? (
        <DriverCompare />
      ) : (
        <section className="card">
          <div className="card-head">
            <CompoundLegend />
            <div className="seg" role="tablist" aria-label="Model">
              <button className={mode === "clean" ? "on" : ""} onClick={() => setMode("clean")}>
                Clean model
              </button>
              <button className={mode === "naive" ? "on" : ""} onClick={() => setMode("naive")}>
                Naive fit
              </button>
            </div>
          </div>

          <div className="chart-wrap" ref={wrapRef} onPointerLeave={() => setHover(null)}>
            <svg
              ref={svgRef}
              className="chart-svg"
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              role="img"
              aria-label="Lap pace against tyre age per compound"
              onPointerMove={onMove}
            >
              {yTicks.map((t) => (
                <g key={t}>
                  <line x1={M.l} x2={VB_W - M.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
                  <text x={M.l - 10} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" fontVariant="tabular-nums">
                    {t.toFixed(0)}
                  </text>
                </g>
              ))}
              {xTicks.map((t) => (
                <text key={t} x={x(t)} y={VB_H - M.b + 20} textAnchor="middle" fontSize={11} fill="var(--muted)" fontVariant="tabular-nums">
                  {t}
                </text>
              ))}
              <text x={M.l - 40} y={M.t - 8} fontSize={11} fill="var(--muted)">lap time, s</text>
              <text x={(M.l + VB_W - M.r) / 2} y={VB_H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
                tyre age, laps
              </text>
              <line x1={M.l} x2={VB_W - M.r} y1={y(yMin)} y2={y(yMin)} stroke="var(--baseline)" strokeWidth={1} />

              {/* scatter context: clean flying laps */}
              {flying.map((l, i) => (
                <circle
                  key={i}
                  cx={x(l.tyre_life)}
                  cy={y(l.lap_time)}
                  r={3.5}
                  fill={COMPOUND_HEX[l.compound as Compound]}
                  opacity={0.3}
                />
              ))}

              {/* filled credible bands (clean mode only) — UI.md: filled, not dashed */}
              {mode === "clean" &&
                publishable.map((c) => {
                  const f = cleanFits[c];
                  const pts = [
                    `${x(0)},${y(f.intercept)}`,
                    `${x(maxAge)},${y(f.intercept + f.hi * maxAge)}`,
                    `${x(maxAge)},${y(f.intercept + f.lo * maxAge)}`,
                  ];
                  return <polygon key={c} points={pts.join(" ")} fill={COMPOUND_HEX[c]} opacity={0.1} />;
                })}

              {/* model lines + end markers + direct labels */}
              {shown.map((c) => {
                const y0 = lineAt(c, 0);
                const y1 = lineAt(c, maxAge);
                return (
                  <g key={c}>
                    <line x1={x(0)} y1={y(y0)} x2={x(maxAge)} y2={y(y1)} stroke={COMPOUND_HEX[c]} strokeWidth={2} strokeLinecap="round" />
                    <circle cx={x(maxAge)} cy={y(y1)} r={4} fill={COMPOUND_HEX[c]} stroke="var(--surface)" strokeWidth={2} />
                    <text x={x(maxAge) + 10} y={y(y1) + 4} fontSize={12} fill="var(--ink-2)" fontWeight={600}>
                      {compoundLabel(c)}
                    </text>
                  </g>
                );
              })}

              {/* F48 cliff markers (clean mode) */}
              {mode === "clean" &&
                publishable.map((c) => {
                  const age = cliffAge(c);
                  if (age == null || age > maxAge) return null;
                  const cy = y(lineAt(c, age));
                  return (
                    <g key={`cliff-${c}`}>
                      <path
                        d={`M${x(age)},${cy - 12} l5,8 l-10,0 Z`}
                        fill="var(--warning)"
                      />
                      <text x={x(age) + 8} y={cy - 12} fontSize={10.5} fill="var(--warning)">
                        cliff ≈ lap {age.toFixed(0)}
                      </text>
                    </g>
                  );
                })}

              {/* crosshair */}
              {hover && (
                <line x1={x(hover.age)} x2={x(hover.age)} y1={M.t} y2={VB_H - M.b} stroke="var(--baseline)" strokeWidth={1} />
              )}
            </svg>
            {hover && (
              <Tooltip
                x={hover.px + 14}
                y={hover.py - 10}
                head={`Tyre age ${hover.age} laps — ${mode === "clean" ? "clean model" : "naive fit"}`}
                rows={tipRows}
              />
            )}
          </div>

          {/* naive-mode payoff: the broken-baseline slopes */}
          {mode === "naive" && (
            <div className="chip-row" style={{ marginTop: 16 }}>
              {present.map((c) => {
                const s = naiveFits[c].slope;
                const bad = s < 0;
                return (
                  <span className="chip" key={c}>
                    <span className="swatch" style={{ background: COMPOUND_HEX[c] }} />
                    {compoundLabel(c)}&nbsp;
                    <span style={{ fontVariant: "tabular-nums", color: bad ? "var(--critical)" : "var(--ink)" }}>
                      {s >= 0 ? "+" : "−"}
                      {Math.abs(s).toFixed(3)} s/lap
                    </span>
                    {bad && <span style={{ color: "var(--critical)" }}>⚠ impossible</span>}
                  </span>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Designed empty state for suppressed compounds (rule 7) */}
      {view === "curves" &&
        mode === "clean" &&
        suppressed.map((c) => {
          const s = sessionMeta.sufficiency[c];
          return (
            <div key={c} className="empty-state" style={{ marginBottom: 24 }}>
              <span className="e-head">Insufficient clean data for {compoundLabel(c).toUpperCase()}</span>
              <p className="e-body">
                {s.n_clean_laps} clean laps, minimum 6. Posterior would be ±
                {s.sigma_s_per_lap.toFixed(3)} s/lap — prior, not evidence. We are not going to
                guess.
              </p>
            </div>
          );
        })}
    </>
  );
}
