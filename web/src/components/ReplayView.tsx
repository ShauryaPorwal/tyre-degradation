"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { niceTicks, scaleLinear, svgPoint } from "@/lib/chart";
import { replay } from "@/lib/data";
import { Tile, Tooltip, type TooltipRow } from "@/components/ui";

const VB_W = 760;
const VB_H = 380;
const M = { l: 70, r: 24, t: 24, b: 46 };

const SERIES = "#3987e5";

export function ReplayView() {
  const frames = replay.frames;
  const [idx, setIdx] = useState(frames.length - 1);
  const [playing, setPlaying] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; head: string; rows: TooltipRow[] } | null>(null);

  useEffect(() => {
    if (!playing) return;
    if (idx >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIdx((i) => Math.min(i + 1, frames.length - 1)), 450);
    return () => clearTimeout(t);
  }, [playing, idx, frames.length]);

  const current = frames[idx];
  const visible = frames.slice(0, idx + 1);

  const { x, y, yTicks } = useMemo(() => {
    const lapMin = frames[0].lap;
    const lapMax = frames[frames.length - 1].lap;
    const lo = Math.min(...frames.map((f) => f.slope_ci[0]), replay.true_slope);
    const hi = Math.max(...frames.map((f) => f.slope_ci[1]), replay.true_slope);
    const pad = (hi - lo) * 0.15;
    const x = scaleLinear([lapMin, lapMax], [M.l, VB_W - M.r]);
    const y = scaleLinear([lo - pad, hi + pad], [VB_H - M.b, M.t]);
    return { x, y, yTicks: niceTicks(lo - pad, hi + pad, 5) };
  }, [frames]);

  const bandPath =
    visible.map((f, i) => `${i ? "L" : "M"}${x(f.lap)},${y(f.slope_ci[1])}`).join(" ") +
    [...visible].reverse().map((f) => ` L${x(f.lap)},${y(f.slope_ci[0])}`).join("") +
    " Z";
  const linePath = visible.map((f, i) => `${i ? "L" : "M"}${x(f.lap)},${y(f.slope)}`).join(" ");

  const onMove = (e: React.PointerEvent) => {
    if (!svgRef.current || !wrapRef.current) return;
    const p = svgPoint(e, svgRef.current, VB_W, VB_H);
    const lap = x.invert(p.x);
    let best = visible[0];
    for (const f of visible) if (Math.abs(f.lap - lap) < Math.abs(best.lap - lap)) best = f;
    const r = wrapRef.current.getBoundingClientRect();
    setTip({
      x: e.clientX - r.left + 14,
      y: e.clientY - r.top - 10,
      head: `After lap ${best.lap} · ${best.n_clean_laps} clean laps`,
      rows: [
        { name: "Slope", value: best.slope.toFixed(4), color: SERIES },
        { name: "90% CI", value: `${best.slope_ci[0].toFixed(4)} … ${best.slope_ci[1].toFixed(4)}` },
        { name: "Gate", value: best.gate },
      ],
    });
  };

  const ciWidth = current.slope_ci[1] - current.slope_ci[0];
  const lapTicks = frames.filter((_, i) => i % 3 === 0).map((f) => f.lap);

  return (
    <>
      <div className="kpi-row">
        <Tile label="Session lap" value={String(current.lap)} meta={`${replay.session_id} · ${replay.compound}`} />
        <Tile label="Posterior slope" value={current.slope.toFixed(4)} unit="s / energy" meta={`CI width ${ciWidth.toFixed(4)}`} />
        <Tile label="Clean laps so far" value={String(current.n_clean_laps)} meta="across all 20 cars" />
        <Tile
          label="Confidence gate"
          value={current.gate === "PASS" ? "PASS" : "WAIT"}
          tone={current.gate === "PASS" ? "gate-pass" : undefined}
          meta={current.gate === "PASS" ? "posterior narrow enough to publish" : "refusing to answer — too little data"}
        />
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Posterior convergence, soft-compound slope</div>
            <div className="card-sub">
              The band is the 90% credible interval; it narrows as clean laps arrive. Hairline:
              fixture ground truth.
            </div>
          </div>
          <button className="btn" onClick={() => { if (idx >= frames.length - 1) setIdx(0); setPlaying((p) => !p); }}>
            {playing ? "❚❚ Pause" : "▶ Replay session"}
          </button>
        </div>

        <div className="chart-wrap" ref={wrapRef} onPointerLeave={() => setTip(null)}>
          <svg
            ref={svgRef}
            className="chart-svg"
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            role="img"
            aria-label="Degradation-slope posterior narrowing as session laps arrive"
            onPointerMove={onMove}
          >
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={M.l} x2={VB_W - M.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
                <text x={M.l - 10} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" fontVariant="tabular-nums">
                  {t.toFixed(3)}
                </text>
              </g>
            ))}
            {lapTicks.map((t) => (
              <text key={t} x={x(t)} y={VB_H - M.b + 20} textAnchor="middle" fontSize={11} fill="var(--muted)" fontVariant="tabular-nums">
                {t}
              </text>
            ))}
            <text x={M.l - 52} y={M.t - 8} fontSize={11} fill="var(--muted)">slope, s / energy</text>
            <text x={(M.l + VB_W - M.r) / 2} y={VB_H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
              session lap
            </text>

            {/* ground-truth reference */}
            <line x1={M.l} x2={VB_W - M.r} y1={y(replay.true_slope)} y2={y(replay.true_slope)} stroke="var(--baseline)" strokeWidth={1} />
            <text x={VB_W - M.r} y={y(replay.true_slope) - 6} textAnchor="end" fontSize={10.5} fill="var(--muted)">
              fixture truth {replay.true_slope.toFixed(4)}
            </text>

            <path d={bandPath} fill={SERIES} opacity={0.1} />
            <path d={linePath} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(current.lap)} cy={y(current.slope)} r={4} fill={SERIES} stroke="var(--surface)" strokeWidth={2} />
          </svg>
          {tip && <Tooltip {...tip} />}
        </div>

        <div className="slider-row" style={{ marginTop: 18 }}>
          <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>Scrub laps</span>
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            step={1}
            value={idx}
            onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
            aria-label="Replay position, session lap"
          />
          <span className="slider-readout">lap {current.lap}</span>
        </div>

        <details className="data-table">
          <summary>Table view</summary>
          <table>
            <thead>
              <tr>
                <th className="num">Lap</th>
                <th className="num">Clean laps</th>
                <th className="num">Slope</th>
                <th className="num">CI low</th>
                <th className="num">CI high</th>
                <th>Gate</th>
              </tr>
            </thead>
            <tbody>
              {frames.map((f) => (
                <tr key={f.lap}>
                  <td className="num">{f.lap}</td>
                  <td className="num">{f.n_clean_laps}</td>
                  <td className="num">{f.slope.toFixed(4)}</td>
                  <td className="num">{f.slope_ci[0].toFixed(4)}</td>
                  <td className="num">{f.slope_ci[1].toFixed(4)}</td>
                  <td>{f.gate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>
    </>
  );
}
