/* Screen 2 — Deconfound (docs/UI.md).
   Question: why is everyone else's number wrong?
   Components: F77 waterfall · F79 single fuel slider. The naive-vs-clean
   toggle deliberately lives on Curves, where the difference is visible. */

import { WaterfallChart } from "@/components/WaterfallChart";
import { FuelSlider } from "@/components/FuelSlider";
import { FuelPlanner } from "@/components/FuelPlanner";
import { waterfall } from "@/lib/data";

export default function DeconfoundPage() {
  return (
    <>
      <div className="eyebrow">
        {waterfall.target_driver} vs {waterfall.reference_driver} · {waterfall.session_id}
      </div>

      {/* Rule 3: number first, chart second */}
      <div className="hero-row">
        <div>
          <div className="hero-number">
            {waterfall.apparent_gap_s.toFixed(2)}
            <span className="unit">s/lap</span>
          </div>
          <div className="hero-sub">apparent deficit on the timing sheet</div>
        </div>
        <div className="hero-arrow" aria-hidden>
          →
        </div>
        <div>
          <div className="hero-number">
            {waterfall.true_deficit_s.toFixed(2)}
            <span className="unit">s/lap</span>
          </div>
          <div className="hero-sub">
            true deficit · 90% CI {waterfall.true_deficit_ci[0].toFixed(2)} …{" "}
            {waterfall.true_deficit_ci[1].toFixed(2)}
          </div>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Where the gap actually comes from</div>
            <div className="card-sub">
              Each step is an estimated confounder, not an assumed constant. Whiskers are 90%
              credible intervals.
            </div>
          </div>
        </div>
        <WaterfallChart />
      </section>

      {/* The centre interaction: one fuel-load input drives pace, degradation,
          stint length, and the Screen-4 recommendation, live. */}
      <section className="card card-primary">
        <div className="card-head">
          <div>
            <div className="card-title">Plan the next run — fuel load</div>
            <div className="card-sub">
              Drag the load and watch pace, degradation, stint length and the recommended run
              change together. The recommendation carries into Next Run.
            </div>
          </div>
        </div>
        <FuelPlanner />
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Fuel effect assumed by industry tools</div>
            <div className="card-sub">
              Drag it and watch the compound ranking break. We don&apos;t assume this number —
              we estimate fuel mass from telemetry (SPEC §4.1).
            </div>
          </div>
        </div>
        <FuelSlider />
      </section>
    </>
  );
}
