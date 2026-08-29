/* Browse — the secondary path behind the presets (docs/UI.md Screen 1).
   Off the demo path by design. Sandbagging (F71) lives here after the v2
   consolidation: it does not survive "one question per screen" on the demo
   path, but stays available for Q&A. */

import Link from "next/link";
import { sessionMeta } from "@/lib/data";
import { SandbaggingBoard } from "@/components/SandbaggingBoard";

export default function BrowsePage() {
  return (
    <>
      <div className="eyebrow">All sessions</div>
      <h1>Browse</h1>
      <p className="lede">
        One session exists until the harvest completes; the full 2023–2026 practice archive
        lands here afterwards.
      </p>

      <div className="preset-grid" style={{ marginBottom: 40 }}>
        <Link href="/" className="preset">
          <div className="p-title">{sessionMeta.display_name}</div>
          <div className="p-purpose">
            {sessionMeta.session_id} · health {sessionMeta.health.toFixed(0)} ·{" "}
            {sessionMeta.n_clean_laps} clean laps
          </div>
        </Link>
        <div className="preset pending" aria-disabled>
          <div className="p-title">2023–2026 archive</div>
          <div className="p-purpose">Every FP1/FP2/FP3 across four seasons</div>
          <span className="p-pending">harvest in progress</span>
        </div>
      </div>

      <div className="section-rule">Sandbagging leaderboard</div>
      <p className="lede" style={{ marginBottom: 16 }}>
        Timing-sheet pace vs deconfounded true pace — who is hiding the most. Kept off the
        main path; interesting, but a different question.
      </p>
      <section className="card">
        <SandbaggingBoard />
      </section>
    </>
  );
}
