/* F104 — per-compound data sufficiency traffic lights (docs/ADDITIONS.md).
   The confidence-gate logic finally given a visible surface. */

import { COMPOUND_ORDER, sessionMeta } from "@/lib/data";
import { compoundLabel } from "@/components/ui";

const STATE_TEXT: Record<string, string> = {
  GREEN: "sufficient evidence",
  AMBER: "usable, wide interval",
  RED: "insufficient — curve suppressed",
};

export function SufficiencyCards() {
  return (
    <div className="suff-grid">
      {COMPOUND_ORDER.map((c) => {
        const s = sessionMeta.sufficiency[c];
        if (!s) return null;
        return (
          <div key={c} className="suff-card">
            <div className="name">{compoundLabel(c).toUpperCase()}</div>
            <div className="state-row">
              <span className={`dot ${s.state}`} aria-label={s.state} />
              <span className="laps">
                {s.n_clean_laps}
                <span className="unit"> clean laps</span>
              </span>
            </div>
            <div className="meta">
              ±{s.sigma_s_per_lap.toFixed(3)} s/lap · {STATE_TEXT[s.state]}
            </div>
          </div>
        );
      })}
    </div>
  );
}
