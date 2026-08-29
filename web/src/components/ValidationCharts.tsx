"use client";

import { useRef, useState } from "react";
import { niceTicks, scaleLinear, svgPoint } from "@/lib/chart";
import { validation } from "@/lib/data";
import { Tooltip, type TooltipRow } from "@/components/ui";

/* ------------------------------------------------ reliability diagram */

const R_VB = 380;
const R_M = { l: 46, r: 18, t: 22, b: 40 };

export function ReliabilityDiagram() {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; head: string; rows: TooltipRow[] } | null>(null);

  const pts = validation.reliability;
  const x = scaleLinear([0, 100], [R_M.l, R_VB - R_M.r]);
  const y = scaleLinear([0, 100], [R_VB - R_M.b, R_M.t]);
  const ticks = [0, 25, 50, 75, 100];

  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p.nominal)},${y(p.empirical)}`).join(" ");

  const onMove = (e: React.PointerEvent) => {
    if (!svgRef.current || !wrapRef.current) return;
    const p = svgPoint(e, svgRef.current, R_VB, R_VB);
    const nominal = x.invert(p.x);
    let best = pts[0];
    for (const q of pts) if (Math.abs(q.nominal - nominal) < Math.abs(best.nominal - nominal)) best = q;
    const r = wrapRef.current.getBoundingClientRect();
    setTip({
      x: e.clientX - r.left + 14,
      y: e.clientY - r.top - 10,
      head: `Nominal ${best.nominal}%`,
      rows: [
        { name: "Empirical coverage", value: `${best.empirical.toFixed(1)}%`, color: "#3987e5" },
        { name: "Perfect calibration", value: `${best.nominal}%` },
      ],
    });
  };

  return (
    <div className="chart-wrap" ref={wrapRef} onPointerLeave={() => setTip(null)}>
      <svg
        ref={svgRef}
        className="chart-svg"
        viewBox={`0 0 ${R_VB} ${R_VB}`}
        role="img"
        aria-label="Reliability diagram: empirical versus nominal interval coverage"
        onPointerMove={onMove}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={R_M.l} x2={R_VB - R_M.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={R_M.l - 8} y={y(t) + 4} textAnchor="end" fontSize={10.5} fill="var(--muted)" fontVariant="tabular-nums">{t}</text>
            <text x={x(t)} y={R_VB - R_M.b + 18} textAnchor="middle" fontSize={10.5} fill="var(--muted)" fontVariant="tabular-nums">{t}</text>
          </g>
        ))}
        <text x={R_M.l - 34} y={R_M.t - 6} fontSize={10.5} fill="var(--muted)">empirical %</text>
        <text x={(R_M.l + R_VB - R_M.r) / 2} y={R_VB - 6} textAnchor="middle" fontSize={10.5} fill="var(--muted)">nominal %</text>
        {/* perfect-calibration reference */}
        <line x1={x(0)} y1={y(0)} x2={x(100)} y2={y(100)} stroke="var(--baseline)" strokeWidth={1} />
        <path d={path} fill="none" stroke="#3987e5" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p) => (
          <circle key={p.nominal} cx={x(p.nominal)} cy={y(p.empirical)} r={4} fill="#3987e5" stroke="var(--surface)" strokeWidth={2} />
        ))}
        <text x={x(90)} y={y(pts[pts.length - 1].empirical) - 12} textAnchor="end" fontSize={11} fill="var(--ink-2)" fontWeight={600}>
          coverage
        </text>
      </svg>
      {tip && <Tooltip {...tip} />}
    </div>
  );
}

/* ------------------------------------------------ ablation bars */

const A_W = 380;
const A_ROW = 34;
const A_M = { l: 4, r: 60, t: 26, b: 8 };

export function AblationBars() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; head: string; rows: TooltipRow[] } | null>(null);

  const rows = validation.ablation.filter((r) => r.config !== "Full model");
  const H = A_M.t + rows.length * A_ROW + A_M.b;
  const maxDelta = Math.max(...rows.map((r) => r.delta));
  const x = scaleLinear([0, maxDelta * 1.15], [A_M.l + 4, A_W - A_M.r]);

  return (
    <div className="chart-wrap" ref={wrapRef} onPointerLeave={() => setTip(null)}>
      <svg
        className="chart-svg"
        viewBox={`0 0 ${A_W} ${H}`}
        role="img"
        aria-label="Ablation: MAE damage from removing each correction"
      >
        <text x={A_M.l + 4} y={14} fontSize={10.5} fill="var(--muted)">
          MAE damage when removed, s/lap
        </text>
        {rows.map((r, i) => {
          const cy = A_M.t + i * A_ROW + A_ROW / 2;
          const w = Math.max(x(r.delta) - x(0), 1.5);
          return (
            <g
              key={r.config}
              onPointerMove={(e) => {
                const rect = wrapRef.current?.getBoundingClientRect();
                if (!rect) return;
                setTip({
                  x: e.clientX - rect.left + 14,
                  y: e.clientY - rect.top - 10,
                  head: r.config,
                  rows: [
                    { name: "MAE", value: `${r.mae.toFixed(3)} s/lap`, color: "#3987e5" },
                    { name: "vs full model", value: `+${r.delta.toFixed(3)}` },
                  ],
                });
              }}
              onPointerLeave={() => setTip(null)}
            >
              <rect x={0} y={cy - A_ROW / 2} width={A_W} height={A_ROW} fill="transparent" />
              <text x={A_M.l + 4} y={cy - 6} fontSize={11} fill="var(--ink-2)">
                {r.config.replace("− ", "")}
              </text>
              <rect x={x(0)} y={cy} width={w} height={7} rx={3.5} fill="#3987e5" />
              <text x={x(r.delta) + 8} y={cy + 8} fontSize={11} fill="var(--ink)" fontWeight={650} fontVariant="tabular-nums">
                +{r.delta.toFixed(3)}
              </text>
            </g>
          );
        })}
      </svg>
      {tip && <Tooltip {...tip} />}
    </div>
  );
}
