"use client";

/* Screen 3 — driver comparison. Two drivers, same compound: degradation
   rate, pace drop-off, consistency, tyre life. Everything is fitted from
   this session's clean laps in front of the viewer (fuel-corrected OLS per
   driver) — no pre-baked "driver ratings". Drivers with fewer than 6 clean
   laps on the compound are refused, same threshold as the F104 amber gate. */

import { useMemo, useState } from "react";
import { niceTicks, ols, scaleLinear } from "@/lib/chart";
import { COMPOUND_ORDER, mergedCleanLaps, type Compound } from "@/lib/data";
import { compoundLabel } from "@/components/ui";
import { FITTED_FUEL_EFFECT_S_PER_KG } from "@/lib/runplan";

const MIN_LAPS = 6; // F104 amber threshold — below this we refuse to compare

const VB_W = 760;
const VB_H = 320;
const M = { l: 58, r: 24, t: 20, b: 42 };

/* Two-driver palette: identity colours distinct from the compound palette
   (drivers are the series here, not compounds). */
const DRIVER_COLOR = ["#3987e5", "#d95926"];

interface DriverFit {
  driver: string;
  n: number;
  slope: number; // s/lap of tyre age, fuel-corrected
  intercept: number;
  residSd: number; // lap-to-lap consistency
  maxAge: number;
  dropOff: number; // fitted loss first→last observed age, s
  lapsPerSecond: number | null; // laps until 1.0 s cumulative loss (yardstick)
  points: { age: number; t: number }[];
}

function fitDriver(
  rows: { tyre_life: number; lap_time: number; fuel_kg: number }[],
  driver: string,
): DriverFit {
  const xs = rows.map((r) => r.tyre_life);
  /* Correct with the FITTED fuel coefficient (not the industry constant) so
     the comparison is degradation, not who ran less fuel. */
  const ys = rows.map((r) => r.lap_time - FITTED_FUEL_EFFECT_S_PER_KG * r.fuel_kg);
  const f = ols(xs, ys);
  const resid = rows.map((r, i) => ys[i] - (f.intercept + f.slope * xs[i]));
  const residSd = Math.sqrt(resid.reduce((a, v) => a + v * v, 0) / Math.max(resid.length - 2, 1));
  const maxAge = Math.max(...xs);
  return {
    driver,
    n: rows.length,
    slope: f.slope,
    intercept: f.intercept,
    residSd,
    maxAge,
    dropOff: f.slope * maxAge,
    lapsPerSecond: f.slope > 1e-4 ? 1.0 / f.slope : null,
    points: rows.map((r, i) => ({ age: r.tyre_life, t: ys[i] })),
  };
}

export function DriverCompare() {
  const clean = useMemo(() => mergedCleanLaps(), []);

  /* Which (compound, driver) pairs have enough clean laps to fit at all. */
  const eligible = useMemo(() => {
    const m = new Map<Compound, string[]>();
    for (const c of COMPOUND_ORDER) {
      const byDriver = new Map<string, number>();
      for (const l of clean) if (l.compound === c) byDriver.set(l.driver, (byDriver.get(l.driver) ?? 0) + 1);
      const drivers = [...byDriver.entries()]
        .filter(([, n]) => n >= MIN_LAPS)
        .map(([d]) => d)
        .sort();
      if (drivers.length >= 2) m.set(c, drivers);
    }
    return m;
  }, [clean]);

  const compounds = [...eligible.keys()];
  const [compound, setCompound] = useState<Compound>(compounds[0]);
  const drivers = eligible.get(compound) ?? [];
  const [dA, setDA] = useState(drivers[0] ?? "");
  const [dB, setDB] = useState(drivers[1] ?? "");

  if (compounds.length === 0) {
    return (
      <div className="empty-state">
        <span className="e-head">No compound has two drivers with ≥{MIN_LAPS} clean laps</span>
        <p className="e-body">A comparison fitted on fewer laps would be noise presented as insight. We are not going to guess.</p>
      </div>
    );
  }

  const pick = (d: string) =>
    fitDriver(clean.filter((l) => l.compound === compound && l.driver === d), d);
  const a = drivers.includes(dA) ? pick(dA) : pick(drivers[0]);
  const b = drivers.includes(dB) && dB !== a.driver ? pick(dB) : pick(drivers.find((d) => d !== a.driver)!);

  const fits = [a, b];
  const maxAge = Math.max(a.maxAge, b.maxAge);
  const allT = [...a.points, ...b.points].map((p) => p.t);
  const yMin = Math.min(...allT) - 0.3;
  const yMax = Math.max(...allT) + 0.3;
  const x = scaleLinear([0, maxAge], [M.l, VB_W - M.r]);
  const y = scaleLinear([yMin, yMax], [VB_H - M.b, M.t]);

  const rows: { label: string; fmt: (f: DriverFit) => string; better: "low" | "high" | null }[] = [
    { label: "Clean laps fitted", fmt: (f) => String(f.n), better: null },
    { label: "Degradation rate", fmt: (f) => `${f.slope >= 0 ? "+" : "−"}${Math.abs(f.slope).toFixed(3)} s/lap`, better: "low" },
    { label: `Pace drop-off over ${maxAge} laps`, fmt: (f) => `${(f.slope * maxAge).toFixed(2)} s`, better: "low" },
    { label: "Consistency (residual sd)", fmt: (f) => `${f.residSd.toFixed(3)} s`, better: "low" },
    {
      label: "Laps per 1.0 s lost (yardstick)",
      fmt: (f) => (f.lapsPerSecond ? f.lapsPerSecond.toFixed(0) : "— flat fit"),
      better: "high",
    },
  ];

  const degDelta = a.slope - b.slope;
  const manager = degDelta < 0 ? a : b;

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Driver comparison — same compound</div>
          <div className="card-sub">
            Fuel-corrected clean laps only (fitted 0.032 s/kg), so the difference is tyre
            management, not fuel load. Minimum {MIN_LAPS} clean laps each.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="select" value={compound} onChange={(e) => setCompound(e.target.value as Compound)} aria-label="Compound">
            {compounds.map((c) => (
              <option key={c} value={c}>
                {compoundLabel(c)}
              </option>
            ))}
          </select>
          <select className="select" value={a.driver} onChange={(e) => setDA(e.target.value)} aria-label="Driver A">
            {drivers.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <span style={{ color: "var(--muted)", alignSelf: "center", fontSize: 13 }}>vs</span>
          <select className="select" value={b.driver} onChange={(e) => setDB(e.target.value)} aria-label="Driver B">
            {drivers
              .filter((d) => d !== a.driver)
              .map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
          </select>
        </div>
      </div>

      <svg
        className="chart-svg"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label={`Fuel-corrected pace against tyre age: ${a.driver} vs ${b.driver} on ${compoundLabel(compound)}`}
      >
        {niceTicks(yMin, yMax, 5).map((t) => (
          <g key={t}>
            <line x1={M.l} x2={VB_W - M.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={M.l - 10} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" fontVariant="tabular-nums">
              {t.toFixed(1)}
            </text>
          </g>
        ))}
        {niceTicks(0, maxAge, 6).map((t) => (
          <text key={t} x={x(t)} y={VB_H - M.b + 20} textAnchor="middle" fontSize={11} fill="var(--muted)" fontVariant="tabular-nums">
            {t}
          </text>
        ))}
        <text x={M.l - 40} y={M.t - 6} fontSize={11} fill="var(--muted)">fuel-corrected lap time, s</text>
        <text x={(M.l + VB_W - M.r) / 2} y={VB_H - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">
          tyre age, laps
        </text>

        {fits.map((f, i) => (
          <g key={f.driver}>
            {f.points.map((p, j) => (
              <circle key={j} cx={x(p.age)} cy={y(p.t)} r={3.5} fill={DRIVER_COLOR[i]} opacity={0.35} />
            ))}
            <line
              x1={x(0)}
              y1={y(f.intercept)}
              x2={x(f.maxAge)}
              y2={y(f.intercept + f.slope * f.maxAge)}
              stroke={DRIVER_COLOR[i]}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <text
              x={x(f.maxAge) - 4}
              y={y(f.intercept + f.slope * f.maxAge) - 8}
              textAnchor="end"
              fontSize={12}
              fontWeight={600}
              fill={DRIVER_COLOR[i]}
            >
              {f.driver}
            </text>
          </g>
        ))}
      </svg>

      <table>
        <thead>
          <tr>
            <th>Metric</th>
            {fits.map((f, i) => (
              <th key={f.driver} className="num" style={{ color: DRIVER_COLOR[i] }}>
                {f.driver}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const vals = fits.map((f) => r.fmt(f));
            let winner = -1;
            if (r.better) {
              const nums = fits.map((f) =>
                r.label.startsWith("Degradation")
                  ? f.slope
                  : r.label.startsWith("Pace")
                    ? f.slope * maxAge
                    : r.label.startsWith("Consistency")
                      ? f.residSd
                      : f.lapsPerSecond ?? -Infinity,
              );
              winner =
                r.better === "low"
                  ? nums.indexOf(Math.min(...nums))
                  : nums.indexOf(Math.max(...nums));
            }
            return (
              <tr key={r.label}>
                <td>{r.label}</td>
                {vals.map((v, i) => (
                  <td key={i} className="num" style={i === winner ? { color: "var(--ink)", fontWeight: 600 } : undefined}>
                    {v}
                    {i === winner && " ◂"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="note" style={{ marginTop: 16 }}>
        {manager.driver} manages the {compoundLabel(compound).toLowerCase()} better in this
        session: {Math.abs(degDelta).toFixed(3)} s/lap less degradation. Single-session,
        single-stint evidence — a driver trait needs this to repeat across sessions before it
        is more than a session effect.
      </p>
    </section>
  );
}
