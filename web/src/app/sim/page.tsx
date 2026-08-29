/* Screen 5 — Live Simulation (docs/UI.md v2 addendum).
   Question: can this analyse a race as it happens?
   Structured data, video-derived lap times, or the bundled synthetic demo
   race stream through the online Bayesian decomposition engine; every
   panel updates lap by lap. All logic in components/sim/ + lib/sim/. */

import { SimScreen } from "@/components/sim/SimScreen";

export default function SimPage() {
  return <SimScreen />;
}
