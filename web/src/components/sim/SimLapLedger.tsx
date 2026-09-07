"use client";

/* Interactive lap-by-lap ledger & export center for Live Simulation.
   Provides a scannable grid of every lap's observed time, predicted pace,
   deconfounded component breakdown, exclusion state, and honest evidence
   status — plus one-click CSV export and a copyable Strategy Briefing. */

import { useMemo, useState } from "react";
import type { LapAnalysis, RaceData } from "@/lib/sim/types";
import { COMPOUND_HEX, type Compound } from "@/lib/data";

interface SimLapLedgerProps {
  race: RaceData;
  analyses: LapAnalysis[];
  upTo: number;
  selected: number;
  onSelect: (lap: number) => void;
}

export function SimLapLedger({
  race,
  analyses,
  upTo,
  selected,
  onSelect,
}: SimLapLedgerProps) {
  const [filter, setFilter] = useState<"all" | "clean" | "excluded">("all");
  const [viewAllLaps, setViewAllLaps] = useState(false);
  const [copied, setCopied] = useState(false);

  // The analysis slice to display: either up to the current scrub point or all laps
  const displayedAnalyses = useMemo(() => {
    const list = viewAllLaps ? analyses : analyses.slice(0, upTo + 1);
    if (filter === "clean") return list.filter((a) => !a.excluded);
    if (filter === "excluded") return list.filter((a) => a.excluded);
    return list;
  }, [analyses, upTo, viewAllLaps, filter]);

  // Session summary statistics computed honestly from clean laps
  const stats = useMemo(() => {
    const clean = analyses.filter((a) => !a.excluded);
    if (clean.length === 0) {
      return { minTime: null, minLap: null, meanTime: null, cleanCount: 0 };
    }
    let minTime = Infinity;
    let minLap = 0;
    let sum = 0;
    clean.forEach((a) => {
      sum += a.lapTime;
      if (a.lapTime < minTime) {
        minTime = a.lapTime;
        minLap = a.lap;
      }
    });
    return {
      minTime,
      minLap,
      meanTime: sum / clean.length,
      cleanCount: clean.length,
    };
  }, [analyses]);

  // Export full deconfounded dataset as CSV
  const handleExportCsv = () => {
    const headers = [
      "lap",
      "lap_time_s",
      "compound",
      "tyre_age",
      "fuel_kg",
      "predicted_s",
      "predicted_pm_s",
      "delta_vs_ref_s",
      "tyre_deg_delta_s",
      "fuel_delta_s",
      "traffic_delta_s",
      "temp_delta_s",
      "evo_delta_s",
      "driver_residual_s",
      "clean",
      "exclusion_reason",
      "evidence_state",
      "evidence_reason",
    ];

    const rows = analyses.map((a) => {
      const rawLap = race.laps.find((l) => l.lap === a.lap);
      const tyreComp = a.components.find((c) => c.key === "tyre")?.value_s ?? 0;
      const fuelComp = a.components.find((c) => c.key === "fuel")?.value_s ?? 0;
      const trafficComp = a.components.find((c) => c.key === "traffic")?.value_s ?? 0;
      const tempComp = a.components.find((c) => c.key === "temp")?.value_s ?? 0;
      const evoComp = a.components.find((c) => c.key === "evo")?.value_s ?? 0;

      return [
        a.lap,
        a.lapTime.toFixed(3),
        rawLap?.compound ?? "UNKNOWN",
        rawLap?.tyre_age ?? "",
        rawLap?.fuel_kg != null ? rawLap.fuel_kg.toFixed(1) : "",
        a.predicted.toFixed(3),
        a.predictedPm.toFixed(3),
        a.deltaVsRef != null ? a.deltaVsRef.toFixed(3) : "",
        tyreComp.toFixed(3),
        fuelComp.toFixed(3),
        trafficComp.toFixed(3),
        tempComp.toFixed(3),
        evoComp.toFixed(3),
        a.residual_s.toFixed(3),
        !a.excluded,
        a.excludeReason ? `"${a.excludeReason.replace(/"/g, '""')}"` : "",
        a.evidence.state,
        a.evidence.reason ? `"${a.evidence.reason.replace(/"/g, '""')}"` : "",
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `cleanroom_${race.display_name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_deconfounded.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Copy Strategy & Evidence Briefing to clipboard
  const handleCopyBriefing = async () => {
    const currentAnalysis = analyses[upTo] ?? analyses[analyses.length - 1];
    const strat = currentAnalysis?.strategy;
    const tyre = currentAnalysis?.tyre;

    const lines = [
      `# CLEANROOM STRATEGY & DECONFOUNDING BRIEFING`,
      `Session: ${race.display_name} (${race.source})`,
      `Driver / Car: ${race.driver}`,
      `Scrub Frontier: Lap ${currentAnalysis?.lap ?? 0} / ${race.total_laps}`,
      ``,
      `## 1. Fitted Tyre Degradation`,
      tyre
        ? `- Current Compound: ${race.laps[upTo]?.compound ?? "UNKNOWN"}`
        : `- No tyre data fitted`,
      tyre
        ? `- Degradation Rate: ${tyre.degRate.toFixed(3)} ± ${tyre.degRatePm.toFixed(3)} s/lap`
        : ``,
      tyre
        ? `- Projected 5-Lap Pace Loss: +${tyre.projLossIn5.toFixed(2)} s`
        : ``,
      tyre
        ? `- Model Evidence State: ${currentAnalysis.evidence.state}${currentAnalysis.evidence.reason ? ` (${currentAnalysis.evidence.reason})` : ""}`
        : ``,
      ``,
      `## 2. Strategic Pit Assessment`,
      strat?.optimalPitLap != null
        ? `- Recommended Pit Lap: L${strat.optimalPitLap} (Target: ${strat.targetCompound ?? "Second Compound"})`
        : `- Recommended Pit Lap: Stay out to the flag`,
      strat?.windowLo != null
        ? `- Pit Window (within 1.0 s of optimal): L${strat.windowLo}–L${strat.windowHi}`
        : ``,
      strat?.pitNowProb != null
        ? `- P(Optimal Stop within 3 laps): ${(strat.pitNowProb * 100).toFixed(0)}%`
        : ``,
      strat?.reason ? `- Reasoning: ${strat.reason}` : ``,
      ``,
      `## 3. Session Health & Exclusions`,
      `- Total Laps: ${race.total_laps}`,
      `- Clean Laps Fitted: ${stats.cleanCount} (${analyses.length - stats.cleanCount} excluded)`,
      stats.minTime != null
        ? `- Fastest Clean Lap: L${stats.minLap} (${stats.minTime.toFixed(2)} s)`
        : ``,
      stats.meanTime != null
        ? `- Average Clean Pace: ${stats.meanTime.toFixed(2)} s`
        : ``,
      ``,
      `## 4. Model Provenance & Integrity`,
      race.note ? `- Notes: ${race.note}` : ``,
      `- Active Channels: Fuel=${race.channels.fuel ? "Yes" : "Absent"}, Gaps=${race.channels.gaps ? "Yes" : "Absent"}, Temp=${race.channels.temp ? "Yes" : "Absent"}.`,
      `- Integrity: No fake tyre carcass temperatures, pressures, physical wear, or unobserved telemetry fabricated.`,
    ].filter(Boolean);

    const text = lines.join("\n");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        return;
      }
    } catch {
      // clipboard API denied or restricted (e.g. non-HTTPS iframe)
    }

    // Fallback: create temporary textarea to copy
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Final fallback: download as markdown file
      const blob = new Blob([text], { type: "text/markdown;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cleanroom_${race.display_name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_briefing.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <div className="card-head" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="card-title">Lap-by-lap ledger & deconfounded data</div>
          <div className="card-sub">
            Complete sequential record of observations, Bayesian predictions, and component
            attributions. Click any row to inspect its decomposition above.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn" onClick={handleExportCsv} title="Download tidy CSV of all deconfounded laps">
            ⬇ Export CSV
          </button>
          <button
            className="btn accent"
            onClick={handleCopyBriefing}
            title="Copy race engineering briefing summary to clipboard"
          >
            {copied ? "✓ Copied Briefing!" : "📋 Copy Strategy Briefing"}
          </button>
        </div>
      </div>

      {/* Summary metric bar */}
      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          padding: "10px 14px",
          background: "var(--bg, #0a0a0b)",
          borderRadius: 6,
          border: "1px solid var(--border, #26262a)",
          margin: "12px 0",
          fontSize: 12.5,
        }}
      >
        <span>
          <b>Driver:</b> {race.driver}
        </span>
        <span style={{ color: "var(--muted)" }}>|</span>
        <span>
          <b>Clean Laps:</b> {stats.cleanCount} / {race.total_laps} (
          {((stats.cleanCount / Math.max(race.total_laps, 1)) * 100).toFixed(0)}%)
        </span>
        <span style={{ color: "var(--muted)" }}>|</span>
        {stats.minTime != null && (
          <>
            <span>
              <b>Best Clean Lap:</b> L{stats.minLap} ({stats.minTime.toFixed(2)} s)
            </span>
            <span style={{ color: "var(--muted)" }}>|</span>
          </>
        )}
        {stats.meanTime != null && (
          <span>
            <b>Avg Clean Pace:</b> {stats.meanTime.toFixed(2)} s
          </span>
        )}
      </div>

      {/* Filter controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div className="seg" role="tablist" aria-label="Lap filter">
          <button
            className={filter === "all" ? "on" : ""}
            onClick={() => setFilter("all")}
          >
            All ({viewAllLaps ? analyses.length : upTo + 1})
          </button>
          <button
            className={filter === "clean" ? "on" : ""}
            onClick={() => setFilter("clean")}
          >
            Clean ({analyses.slice(0, viewAllLaps ? analyses.length : upTo + 1).filter((a) => !a.excluded).length})
          </button>
          <button
            className={filter === "excluded" ? "on" : ""}
            onClick={() => setFilter("excluded")}
          >
            Excluded ({analyses.slice(0, viewAllLaps ? analyses.length : upTo + 1).filter((a) => a.excluded).length})
          </button>
        </div>

        <label style={{ fontSize: 12.5, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={viewAllLaps}
            onChange={(e) => setViewAllLaps(e.target.checked)}
          />
          Show full session ({analyses.length} laps)
        </label>
      </div>

      {/* Table container */}
      <div style={{ maxHeight: 380, overflowY: "auto", border: "1px solid var(--border, #26262a)", borderRadius: 6 }}>
        <table style={{ margin: 0 }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--surface, #141416)", zIndex: 2 }}>
            <tr>
              <th className="num" style={{ width: 44 }}>Lap</th>
              <th style={{ width: 90 }}>Tyre</th>
              <th className="num" style={{ width: 75 }}>Observed</th>
              <th className="num" style={{ width: 95 }}>Pred ±1σ</th>
              <th className="num" style={{ width: 75 }}>Δ vs Best</th>
              <th className="num" style={{ width: 75 }}>Tyre Deg</th>
              <th className="num" style={{ width: 70 }}>Fuel</th>
              <th className="num" style={{ width: 75 }}>Residual</th>
              <th style={{ width: 140 }}>Status & Reason</th>
              <th style={{ width: 85 }}>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {displayedAnalyses.map((a) => {
              const rawLap = race.laps.find((l) => l.lap === a.lap);
              const compound = rawLap?.compound as Compound | undefined;
              const hex = compound && COMPOUND_HEX[compound] ? COMPOUND_HEX[compound] : "#8a8a93";
              const isSelected = a.lap === selected;
              const isCurrent = a.lap === analyses[upTo]?.lap;

              const tyreComp = a.components.find((c) => c.key === "tyre")?.value_s;
              const fuelComp = a.components.find((c) => c.key === "fuel")?.value_s;

              return (
                <tr
                  key={a.lap}
                  onClick={() => onSelect(a.lap)}
                  className={isSelected ? "highlight" : ""}
                  style={{
                    cursor: "pointer",
                    background: isSelected
                      ? "rgba(225, 6, 0, 0.08)"
                      : isCurrent
                      ? "rgba(255, 255, 255, 0.03)"
                      : undefined,
                  }}
                  title={`Click to inspect Lap ${a.lap} decomposition`}
                >
                  <td className="num">
                    <b>L{a.lap}</b>
                  </td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: hex,
                          display: "inline-block",
                        }}
                      />
                      <span style={{ fontSize: 12 }}>
                        {rawLap?.compound ? rawLap.compound.charAt(0) + rawLap.compound.slice(1).toLowerCase() : "—"}{" "}
                        <span style={{ color: "var(--muted)" }}>a{rawLap?.tyre_age ?? 0}</span>
                      </span>
                    </span>
                  </td>
                  <td className="num">
                    <b>{a.lapTime.toFixed(2)}</b>
                  </td>
                  <td className="num" style={{ color: "var(--muted)" }}>
                    {a.predicted.toFixed(2)} <span style={{ fontSize: 11 }}>±{a.predictedPm.toFixed(2)}</span>
                  </td>
                  <td className="num">
                    {a.deltaVsRef != null ? (
                      <span style={{ color: a.deltaVsRef > 0.1 ? "var(--warn, #f59e0b)" : undefined }}>
                        {a.deltaVsRef >= 0 ? "+" : "−"}
                        {Math.abs(a.deltaVsRef).toFixed(2)}
                      </span>
                    ) : (
                      <span style={{ color: "var(--good, #22c55e)" }}>best</span>
                    )}
                  </td>
                  <td className="num">
                    {tyreComp != null ? (
                      <span>
                        {tyreComp >= 0 ? "+" : "−"}
                        {Math.abs(tyreComp).toFixed(2)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num" style={{ color: "var(--muted)" }}>
                    {fuelComp != null ? `${fuelComp >= 0 ? "+" : "−"}${Math.abs(fuelComp).toFixed(2)}` : "—"}
                  </td>
                  <td className="num">
                    <span
                      style={{
                        color: Math.abs(a.residual_s) > 0.5 ? "var(--warn, #f59e0b)" : "var(--muted)",
                      }}
                    >
                      {a.residual_s >= 0 ? "+" : "−"}
                      {Math.abs(a.residual_s).toFixed(2)}
                    </span>
                  </td>
                  <td>
                    {a.excluded ? (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 6px",
                          borderRadius: 3,
                          background: "rgba(239, 68, 68, 0.15)",
                          color: "var(--bad, #ef4444)",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                        title={a.excludeReason ?? "Excluded lap"}
                      >
                        {a.excludeReason?.split("—")[0].trim() ?? "Excluded"}
                      </span>
                    ) : (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 6px",
                          borderRadius: 3,
                          background: "rgba(34, 197, 94, 0.12)",
                          color: "var(--good, #22c55e)",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        Clean
                      </span>
                    )}
                  </td>
                  <td>
                    {a.evidence.state === "INSUFFICIENT" ? (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 6px",
                          borderRadius: 3,
                          background: "rgba(245, 158, 11, 0.15)",
                          color: "var(--warn, #f59e0b)",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                        title={a.evidence.reason ?? "Insufficient clean lap evidence"}
                      >
                        Priors
                      </span>
                    ) : (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 6px",
                          borderRadius: 3,
                          background: "rgba(34, 197, 94, 0.12)",
                          color: "var(--good, #22c55e)",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        Fitted
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p className="note" style={{ margin: 0 }}>
          Clicking any lap selects it in the decomposition chart and side panels above. Values are
          online Bayesian posterior updates up to that lap.
        </p>
        <span style={{ fontSize: 11.5, color: "var(--muted)", whiteSpace: "nowrap" }}>
          Showing {displayedAnalyses.length} of {analyses.length} laps
        </span>
      </div>
    </section>
  );
}
