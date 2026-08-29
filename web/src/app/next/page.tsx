/* Screen 4 — Next Run (docs/UI.md).
   Question: so what should we do?
   Live: reads the shared run plan so the Screen-2 fuel slider's decision
   carries here. All logic in components/NextRunLive.tsx + lib/runplan.ts. */

import { NextRunLive } from "@/components/NextRunLive";

export default function NextRunPage() {
  return <NextRunLive />;
}
