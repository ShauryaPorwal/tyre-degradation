"use client";

/* "How do we know?" — docs/UI.md drawer. Validation is evidence, not a
   destination: one click from wherever the doubt arises. Escape or
   backdrop click dismisses. Components: F81 scoreboard · F57 reliability
   diagram · F58 ablation. */

import { useEffect } from "react";
import { validation } from "@/lib/data";
import { AblationBars, ReliabilityDiagram } from "@/components/ValidationCharts";

export function ValidationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const ours = validation.table.filter((r) => r.method.startsWith("CLEANROOM"));
  const best = ours.reduce((a, b) => (a.mae < b.mae ? a : b), ours[0]);
  const coverage = validation.reliability.find((p) => p.nominal === 90);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden />
      <aside className="drawer" role="dialog" aria-label="How do we know?">
        <div className="drawer-head">
          <span className="t">How do we know?</span>
          <button className="close-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="hero-number">
          {best.mae.toFixed(3)}
          <span className="unit">s/lap</span>
        </div>
        <div className="hero-sub">
          practice → race backtest MAE · {best.method.replace("CLEANROOM ", "")}
        </div>
        {!validation.frozen && (
          <p className="note" style={{ marginTop: 12 }}>
            {validation.note}
          </p>
        )}

        <div className="section-rule">Against the baselines</div>
        <table>
          <thead>
            <tr>
              <th>Method</th>
              <th className="num">MAE s/lap</th>
              <th className="num">Order %</th>
            </tr>
          </thead>
          <tbody>
            {validation.table.map((r) => (
              <tr key={r.method} className={r.method === best.method ? "highlight" : ""}>
                <td>{r.method}</td>
                <td className="num">{r.mae.toFixed(3)}</td>
                <td className="num">{r.compound_order_pct}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="section-rule">Interval coverage</div>
        <ReliabilityDiagram />
        {coverage && (
          <p className="note" style={{ marginTop: 8 }}>
            90% intervals cover {coverage.empirical.toFixed(1)}% of held-out laps — the
            difference between a model and a forecaster.
          </p>
        )}

        <div className="section-rule">Ablation — what each correction buys</div>
        <AblationBars />
      </aside>
    </>
  );
}
