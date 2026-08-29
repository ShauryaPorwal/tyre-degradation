/* Screen 3 — Curves (docs/UI.md). All logic lives in the client component. */

import { CurvesScreen } from "@/components/CurvesScreen";
import { sessionMeta } from "@/lib/data";

export default function CurvesPage() {
  return (
    <>
      <div className="eyebrow">{sessionMeta.display_name} · degradation</div>
      <CurvesScreen />
    </>
  );
}
