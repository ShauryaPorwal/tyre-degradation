"use client";

import { useRef, useState } from "react";
import { niceTicks, scaleLinear } from "@/lib/chart";
import { sandbagging } from "@/lib/data";
import { Tooltip, type TooltipRow } from "@/components/ui";

const VB_W = 760;
const ROW_H = 30;
const M = { l: 64, r: 84, t: 30, b: 10 };

const TRUE_COLOR = "#3987e5"; // dumbbell: one hue, two shades
const SHEET_COLOR = "#86b6ef";

export function SandbaggingBoard() {
  const rows = sandbagging.rows;
  const VB_H = M.t + rows.length * ROW_H + M.b;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; head: string; rows: TooltipRow[] } | null>(null);

  const lo = Math.min(...rows.map((r) => r.true_pace)) - 0.15;
  const hi = Math.max(...rows.map((r) => r.timing_sheet_pace)) + 0.15;
  const x = scaleLinear([lo, hi], [M.l, VB_W - M.r]);
  const ticks = niceTicks(lo, hi, 6);

  return (
    <>
      <div className="card-head">
        <div className="legend" aria-label="Key">
          <span className="legend-item">
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: TRUE_COLOR }} />
            True pace (deconfounded)
          </span>
          <span className="legend-item">
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: SHEET_COLOR }} />
            Timing-sheet pace
          </span>
        </div>
      </div>
      <div className="chart-wrap" ref={wrapRef} onPointerLeave={() => setTip(null)}>
        <svg
          className="chart-svg"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          role="img"
          aria-label="Sandbagging leaderboard: timing-sheet pace versus deconfounded true pace per driver"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={M.t} y2={VB_H - M.b} stroke="var(--grid)" strokeWidth={1} />
              <text x={x(t)} y={M.t - 10} textAnchor="middle" fontSize={11} fill="var(--muted)" fontVariant="tabular-nums">
                {t.toFixed(1)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const cy = M.t + i * ROW_H + ROW_H / 2;
            return (
              <g
                key={r.driver}
                onPointerMove={(e) => {
                  const rect = wrapRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  setTip({
                    x: e.clientX - rect.left + 14,
                    y: e.clientY - rect.top - 10,
                    head: `${r.driver} · ${r.team}`,
                    rows: [
                      { name: "Timing sheet", value: `${r.timing_sheet_pace.toFixed(3)} s`, color: SHEET_COLOR },
                      { name: "True pace", value: `${r.true_pace.toFixed(3)} s`, color: TRUE_COLOR },
                      { name: "Hidden pace", value: `${r.delta_s.toFixed(3)} s` },
                      { name: "90% CI", value: `${r.ci[0].toFixed(2)} … ${r.ci[1].toFixed(2)}` },
                    ],
                  });
                }}
                onPointerLeave={() => setTip(null)}
              >
                <rect x={0} y={cy - ROW_H / 2} width={VB_W} height={ROW_H} fill="transparent" />
                <text x={M.l - 14} y={cy + 4} textAnchor="end" fontSize={12} fontWeight={650} fill="var(--ink)">
                  {r.driver}
                </text>
                <line x1={x(r.true_pace)} x2={x(r.timing_sheet_pace)} y1={cy} y2={cy} stroke="var(--baseline)" strokeWidth={2} strokeLinecap="round" />
                <circle cx={x(r.timing_sheet_pace)} cy={cy} r={5} fill={SHEET_COLOR} stroke="var(--surface)" strokeWidth={2} />
                <circle cx={x(r.true_pace)} cy={cy} r={5} fill={TRUE_COLOR} stroke="var(--surface)" strokeWidth={2} />
                <text x={VB_W - M.r + 16} y={cy + 4} fontSize={12} fill="var(--ink-2)" fontVariant="tabular-nums">
                  +{r.delta_s.toFixed(2)} s
                </text>
              </g>
            );
          })}
          <text x={VB_W - M.r + 16} y={M.t - 10} fontSize={10.5} fill="var(--muted)">
            hidden
          </text>
        </svg>
        {tip && <Tooltip {...tip} />}
      </div>
    </>
  );
}
