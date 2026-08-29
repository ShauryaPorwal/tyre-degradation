"use client";

/* Per-lap decomposition: signed horizontal bars for each estimated component
   of the selected lap's delta vs the best clean lap, each with its ±1σ and a
   confidence label; prior-dominated coefficients are flagged, never dressed
   up as findings. On the synthetic demo race a truth overlay (◆) shows the
   generator's actual per-lap components — the honest way to demo a
   decomposition. */

import type { Component, LapAnalysis, RaceData } from "@/lib/sim/types";

const COLOR: Record<string, string> = {
  tyre: "#d95926",
  fuel: "#3987e5",
  traffic: "#199e70",
  temp: "#b58de0",
  evo: "#8a8a93",
  residual: "#f59e0b",
};

/** Truth delta per group vs the reference lap, for the overlay. */
function truthDeltas(race: RaceData, lap: number, refLap: number | null): Map<string, number> | null {
  if (!race.synthetic || refLap == null) return null;
  const cur = race.laps.find((l) => l.lap === lap)?.truth;
  const ref = race.laps.find((l) => l.lap === refLap)?.truth;
  if (!cur || !ref) return null;
  return new Map([
    ["fuel", cur.fuel_s - ref.fuel_s],
    ["tyre", cur.deg_s + cur.compound_s - (ref.deg_s + ref.compound_s)],
    ["traffic", cur.traffic_s - ref.traffic_s],
    ["temp", cur.temp_s - ref.temp_s],
    ["evo", cur.evo_s - ref.evo_s],
    ["residual", cur.event_s + cur.noise_s - (ref.event_s + ref.noise_s)],
  ]);
}

export function SimDecomp({
  race,
  analysis,
  showTruth,
}: {
  race: RaceData;
  analysis: LapAnalysis;
  showTruth: boolean;
}) {
  if (analysis.refLap == null || analysis.deltaVsRef == null) {
    return (
      <p className="note">
        Lap {analysis.lap}: {analysis.excludeReason ?? "first clean lap — this is the reference; decomposition starts on the next lap."}
      </p>
    );
  }

  const rows: (Component & { color: string })[] = [
    ...analysis.components.map((c) => ({ ...c, color: COLOR[c.key] ?? "#8a8a93" })),
    {
      key: "residual",
      label: analysis.excludeReason?.includes("overtake")
        ? "Overtake + driver inputs"
        : analysis.excludeReason?.includes("defending")
          ? "Defending + driver inputs"
          : "Driver inputs / unexplained",
      value_s: analysis.residual_s,
      pm_s: 0,
      confidence: "LOW" as const,
      priorDominated: false,
      color: COLOR.residual,
    },
  ].sort((a, b) => Math.abs(b.value_s) - Math.abs(a.value_s));

  const truth = showTruth ? truthDeltas(race, analysis.lap, analysis.refLap) : null;
  const extent = Math.max(...rows.map((r) => Math.abs(r.value_s) + r.pm_s), 0.15);

  return (
    <>
      {rows.map((r) => {
        const frac = (v: number) => 50 + (v / extent) * 48; // % position, zero at centre
        const left = Math.min(frac(0), frac(r.value_s));
        const width = Math.abs(frac(r.value_s) - frac(0));
        const t = truth?.get(r.key);
        return (
          <div className="decomp-row" key={r.key}>
            <span className="name">{r.label}</span>
            <span className="bar-track">
              <span className="bar-zero" style={{ left: "50%" }} />
              <span className="bar" style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%`, background: r.color, opacity: 0.85 }} />
              {t != null && (
                <span
                  aria-label={`fixture truth ${t.toFixed(2)} s`}
                  style={{
                    position: "absolute",
                    left: `calc(${frac(t)}% - 3px)`,
                    top: 3,
                    width: 6,
                    height: 6,
                    background: "var(--ink)",
                    transform: "rotate(45deg)",
                  }}
                />
              )}
            </span>
            <span className="val">
              {r.value_s >= 0 ? "+" : "−"}
              {Math.abs(r.value_s).toFixed(2)}
              {r.pm_s > 0 && <span style={{ color: "var(--muted)", fontWeight: 400 }}> ±{r.pm_s.toFixed(2)}</span>} s
            </span>
            <span className={`conf ${r.confidence}`}>
              {r.priorDominated ? "PRIOR" : r.confidence}
            </span>
          </div>
        );
      })}
      <p className="note" style={{ marginTop: 12 }}>
        vs lap {analysis.refLap} (best clean lap) · bars are posterior estimates ±1σ ·
        &ldquo;PRIOR&rdquo; = still mostly the documented prior, not this race&apos;s data
        {truth && " · ◆ fixture ground truth"}
      </p>
    </>
  );
}
