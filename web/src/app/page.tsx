/* Screen 1 — Session (docs/UI.md).
   Question: what am I looking at, and can I trust it?
   Components: F105 health score · F104 sufficiency meters · F107 presets.
   Deliberately absent: exclusion ledger, session dropdown, weather, charts. */

import Link from "next/link";
import { sessionMeta } from "@/lib/data";
import { SufficiencyCards } from "@/components/SufficiencyCards";

export default function SessionPage() {
  const m = sessionMeta;
  const hc = m.health_components;

  return (
    <>
      <div className="eyebrow">{m.display_name}</div>

      {/* F105 — one number, components on hover only */}
      <div className="hero-row">
        <div className="health-wrap" tabIndex={0}>
          <div className="hero-number">{m.health.toFixed(0)}</div>
          <div className="hero-sub">
            Session Health · {m.n_clean_laps} clean laps of {m.n_laps}
          </div>
          <div className="health-pop" role="tooltip">
            <div className="row">
              <span>Clean-lap yield</span>
              <b>{(hc.clean_lap_yield * 100).toFixed(0)}%</b>
            </div>
            <div className="row">
              <span>Compound coverage</span>
              <b>{(hc.compound_coverage * 100).toFixed(0)}%</b>
            </div>
            <div className="row">
              <span>Traffic contamination</span>
              <b>{(hc.traffic_rate * 100).toFixed(0)}%</b>
            </div>
            <div className="row">
              <span>Session completeness</span>
              <b>{(hc.session_completeness * 100).toFixed(0)}%</b>
            </div>
          </div>
        </div>
      </div>

      {/* F104 — per-compound traffic lights */}
      <SufficiencyCards />

      {/* F107 — curated presets instead of a dropdown of 96 sessions */}
      <div className="section-rule">Choose a session</div>
      <div className="preset-grid">
        {m.presets.map((p) =>
          p.available ? (
            <Link key={p.key} href="/deconfound" className="preset">
              <div className="p-title">{p.title}</div>
              <div className="p-purpose">{p.purpose}</div>
            </Link>
          ) : (
            <div key={p.key} className="preset pending" aria-disabled>
              <div className="p-title">{p.title}</div>
              <div className="p-purpose">{p.purpose}</div>
              <span className="p-pending">assigned after harvest</span>
            </div>
          ),
        )}
      </div>
      <Link href="/browse" className="browse-link">
        browse all sessions →
      </Link>
    </>
  );
}
