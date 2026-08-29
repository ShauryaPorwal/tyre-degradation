"use client";

/* Live pace chart: actual laps (dots, compound-coloured) against the
   engine's one-step-ahead prediction (line) with a ±1σ predictive band.
   The prediction at lap n uses only laps 1..n−1 — genuine out-of-sample,
   which is why the band is wide early and narrows as the posterior tightens.
   Excluded laps (pit / SC / events) are hollow markers pinned into view. */

import { useMemo, useRef, useState } from "react";
import { niceTicks, scaleLinear, svgPoint } from "@/lib/chart";
import { COMPOUND_HEX } from "@/lib/data";
import { Tooltip, type TooltipRow } from "@/components/ui";
import type { LapAnalysis, RaceData } from "@/lib/sim/types";

const VB_W = 760;
const VB_H = 340;
const M = { l: 56, r: 20, t: 18, b: 40 };
const PRED = "#8a8a93";

export function SimPaceChart({
  race,
  analyses,
  upTo,
  selected,
  onSelect,
}: {
  race: RaceData;
  analyses: LapAnalysis[];
  upTo: number; // reveal index (analyses[0..upTo])
  selected: number;
  onSelect: (lap: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; head: string; rows: TooltipRow[] } | null>(null);

  const visible = analyses.slice(0, upTo + 1);

  const { x, y, yTicks, yMax } = useMemo(() => {
    const cleanTimes = analyses.filter((a) => !a.excluded).map((a) => a.lapTime);
    const lo = Math.min(...cleanTimes) - 0.5;
    const hi = Math.max(...cleanTimes) + 0.8;
    return {
      x: scaleLinear([1, race.total_laps], [M.l, VB_W - M.r]),
      y: scaleLinear([lo, hi], [VB_H - M.b, M.t]),
      yTicks: niceTicks(lo, hi, 5),
      yMax: hi,
    };
  }, [analyses, race.total_laps]);

  const shown = visible.filter((a) => !a.excluded);
  const bandPath =
    shown.map((a, i) => `${i ? "L" : "M"}${x(a.lap)},${y(a.predicted + a.predictedPm)}`).join(" ") +
    [...shown].reverse().map((a) => ` L${x(a.lap)},${y(a.predicted - a.predictedPm)}`).join("") +
    " Z";
  const predPath = shown.map((a, i) => `${i ? "L" : "M"}${x(a.lap)},${y(a.predicted)}`).join(" ");

  const lapByNumber = new Map(race.laps.map((l) => [l.lap, l]));

  const onMove = (e: React.PointerEvent) => {
    if (!svgRef.current || !wrapRef.current || visible.length === 0) return;
    const p = svgPoint(e, svgRef.current, VB_W, VB_H);
    const lapAt = Math.round(x.invert(p.x));
    const a = visible.find((v) => v.lap === lapAt);
    if (!a) return setTip(null);
    const r = wrapRef.current.getBoundingClientRect();
    const rows: TooltipRow[] = [
      { name: "Actual", value: `${a.lapTime.toFixed(2)} s`, color: COMPOUND_HEX[lapByNumber.get(a.lap)?.compound as keyof typeof COMPOUND_HEX] },
      { name: "Predicted", value: `${a.predicted.toFixed(2)} ± ${a.predictedPm.toFixed(2)} s`, color: PRED },
    ];
    if (a.excluded) rows.push({ name: "Excluded", value: a.excludeReason ?? "" });
    setTip({ x: e.clientX - r.left + 14, y: e.clientY - r.top - 10, head: `Lap ${a.lap}`, rows });
  };

  return (
    <div className="chart-wrap" ref={wrapRef} onPointerLeave={() => setTip(null)}>
      <svg
        ref={svgRef}
        className="chart-svg"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label="Actual lap times against the model's one-step-ahead prediction"
        onPointerMove={onMove}
        onClick={() => tip && onSelect(Number(tip.head.replace("Lap ", "")))}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={VB_W - M.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" fontVariant="tabular-nums">
              {t.toFixed(0)}
            </text>
          </g>
        ))}
        {niceTicks(1, race.total_laps, 8).map((t) => (
          <text key={t} x={x(t)} y={VB_H - M.b + 18} textAnchor="middle" fontSize={11} fill="var(--muted)" fontVariant="tabular-nums">
            {t}
          </text>
        ))}
        <text x={M.l - 40} y={M.t - 4} fontSize={11} fill="var(--muted)">lap time, s</text>
        <text x={(M.l + VB_W - M.r) / 2} y={VB_H - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">lap</text>

        <path d={bandPath} fill={PRED} opacity={0.12} />
        <path d={predPath} fill="none" stroke={PRED} strokeWidth={1.5} strokeDasharray="1 3" strokeLinecap="round" />

        {visible.map((a) => {
          const compound = lapByNumber.get(a.lap)?.compound ?? "MEDIUM";
          const color = COMPOUND_HEX[compound as keyof typeof COMPOUND_HEX] ?? "#8a8a93";
          const cy = a.excluded && a.lapTime > yMax ? y(yMax) : y(a.lapTime);
          return (
            <g key={a.lap} style={{ cursor: "pointer" }}>
              {a.excluded ? (
                <circle cx={x(a.lap)} cy={cy} r={3.5} fill="none" stroke={color} strokeWidth={1.5} opacity={0.8} />
              ) : (
                <circle cx={x(a.lap)} cy={cy} r={3.5} fill={color} opacity={0.85} />
              )}
              {a.lap === selected && (
                <circle cx={x(a.lap)} cy={cy} r={7} fill="none" stroke="var(--ink)" strokeWidth={1.2} />
              )}
            </g>
          );
        })}
      </svg>
      {tip && <Tooltip {...tip} />}
    </div>
  );
}
