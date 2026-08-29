"use client";

import { useRef, useState } from "react";
import { scaleLinear, niceTicks } from "@/lib/chart";
import { waterfall } from "@/lib/data";
import { Tooltip, type TooltipRow } from "@/components/ui";

const VB_W = 760;
const VB_H = 380;
const M = { l: 58, r: 20, t: 30, b: 46 };

/** Bar with a 4px rounded data-end (top) and square baseline (bottom). */
function topRoundedRect(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.min(r, h / 2, w / 2);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y}
          L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

interface Bar {
  label: string;
  from: number; // running total before this bar
  to: number; // running total after
  color: string;
  ci?: [number, number];
  kind: "total" | "component" | "result";
}

export function WaterfallChart() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; head: string; rows: TooltipRow[] } | null>(
    null,
  );

  const place = (e: React.PointerEvent) => {
    const r = wrapRef.current?.getBoundingClientRect();
    return r
      ? { x: e.clientX - r.left + 14, y: e.clientY - r.top - 10 }
      : { x: 0, y: 0 };
  };

  const bars: Bar[] = [];
  bars.push({
    label: "Apparent gap",
    from: 0,
    to: waterfall.apparent_gap_s,
    color: "#6b6a64",
    kind: "total",
  });
  let run = waterfall.apparent_gap_s;
  for (const c of waterfall.components) {
    bars.push({ label: c.label, from: run, to: run - c.value_s, color: "#3987e5", ci: c.ci, kind: "component" });
    run -= c.value_s;
  }
  bars.push({
    label: "True deficit",
    from: 0,
    to: waterfall.true_deficit_s,
    color: "#199e70",
    ci: waterfall.true_deficit_ci,
    kind: "result",
  });

  const yMax = Math.max(waterfall.apparent_gap_s, ...bars.map((b) => Math.max(b.from, b.to))) * 1.12;
  const y = scaleLinear([0, yMax], [VB_H - M.b, M.t]);
  const plotW = VB_W - M.l - M.r;
  const slot = plotW / bars.length;
  const barW = Math.min(24, slot * 0.5);

  const ticks = niceTicks(0, yMax, 5);

  return (
    <div className="chart-wrap" ref={wrapRef} onPointerLeave={() => setTip(null)}>
      <svg
        className="chart-svg"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label="Waterfall decomposing the apparent lap-time gap into confounders"
      >
        {/* grid + y axis */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={VB_W - M.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={M.l - 10} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" fontVariant="tabular-nums">
              {t.toFixed(1)}
            </text>
          </g>
        ))}
        <text x={M.l - 40} y={M.t - 12} fontSize={11} fill="var(--muted)">
          seconds / lap
        </text>
        <line x1={M.l} x2={VB_W - M.r} y1={y(0)} y2={y(0)} stroke="var(--baseline)" strokeWidth={1} />

        {bars.map((b, i) => {
          const cx = M.l + slot * i + slot / 2;
          const x0 = cx - barW / 2;
          const top = Math.min(b.from, b.to);
          const bot = Math.max(b.from, b.to);
          const yTop = y(bot); // pixel of the higher value = top of the bar
          const h = Math.max(y(top) - y(bot), 2);
          const value = b.kind === "component" ? -(b.from - b.to) : b.to;

          // connector to the next bar's starting level (solid hairline)
          const next = bars[i + 1];
          const connY = next && next.kind === "component" ? y(b.to) : null;

          return (
            <g
              key={b.label}
              onPointerMove={(e) => {
                const rows: TooltipRow[] = [
                  { name: b.kind === "component" ? "Effect" : "Value", value: `${value >= 0 && b.kind === "component" ? "" : ""}${value.toFixed(2)} s`, color: b.color },
                ];
                if (b.ci) rows.push({ name: "90% CI", value: `${b.ci[0].toFixed(2)} … ${b.ci[1].toFixed(2)}` });
                setTip({ ...place(e), head: b.label, rows });
              }}
              onPointerLeave={() => setTip(null)}
            >
              {/* generous hit target */}
              <rect x={cx - slot / 2} y={M.t} width={slot} height={VB_H - M.t - M.b} fill="transparent" />
              <path d={topRoundedRect(x0, yTop, barW, h)} fill={b.color} />
              {connY !== null && (
                <line x1={cx + barW / 2} x2={cx + slot - barW / 2} y1={connY} y2={connY} stroke="var(--baseline)" strokeWidth={1} />
              )}
              {/* CI whisker on the result bar */}
              {b.kind === "result" && b.ci && (
                <g stroke="var(--ink-2)" strokeWidth={1.5}>
                  <line x1={cx} x2={cx} y1={y(Math.max(b.ci[1], 0))} y2={y(Math.max(b.ci[0], 0))} />
                  <line x1={cx - 5} x2={cx + 5} y1={y(Math.max(b.ci[1], 0))} y2={y(Math.max(b.ci[1], 0))} />
                </g>
              )}
              {/* direct label at the cap — text token, never the series color */}
              <text x={cx} y={yTop - 8} textAnchor="middle" fontSize={12} fontWeight={650} fill="var(--ink)" fontVariant="tabular-nums">
                {b.kind === "component" ? `−${Math.abs(value).toFixed(2)}` : value.toFixed(2)}
              </text>
              <text x={cx} y={VB_H - M.b + 18} textAnchor="middle" fontSize={11} fill="var(--muted)">
                {b.label.split(" ")[0]}
              </text>
              <text x={cx} y={VB_H - M.b + 32} textAnchor="middle" fontSize={11} fill="var(--muted)">
                {b.label.split(" ").slice(1).join(" ")}
              </text>
            </g>
          );
        })}
      </svg>
      {tip && <Tooltip {...tip} />}
    </div>
  );
}
