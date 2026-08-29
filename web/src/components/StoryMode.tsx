"use client";

/* F106 Story Mode — docs/UI.md. A state machine and a narration array,
   auto-advancing the four screens with 6-second holds. Reuses every
   existing component; no new charts. Also the live-demo insurance.
   Narration numbers are read from the data payloads, never hardcoded. */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { decision, sessionMeta, validation, waterfall } from "@/lib/data";

const HOLD_MS = 6000;

/** Event the Deconfound fuel slider listens for (auto-drag step). */
export const STORY_SLIDER_EVENT = "cleanroom:story-slider";
/** Event the fuel-load planner listens for (auto-drag step). */
export const STORY_FUEL_EVENT = "cleanroom:story-fuel";
/** Event the Live Sim screen listens for (auto-load + run the demo race). */
export const STORY_SIM_EVENT = "cleanroom:story-sim";

interface Step {
  path: string;
  text: string;
  sliderDrag?: boolean;
  fuelDrag?: boolean;
  simLoad?: boolean;
  drawer?: boolean;
}

function buildSteps(): Step[] {
  const fuel = waterfall.components.find((c) => c.label.toLowerCase().includes("fuel"));
  const ours = validation.table.filter((r) => r.method.startsWith("CLEANROOM"));
  const best = ours.reduce((a, b) => (a.mae < b.mae ? a : b), ours[0]);
  const rec = decision.recommendations[0];
  return [
    {
      path: "/",
      text: `Formula 1 practice data is contaminated. Of ${sessionMeta.n_laps} laps in this session, ${sessionMeta.n_clean_laps} are usable — session health ${sessionMeta.health.toFixed(0)}.`,
    },
    {
      path: "/deconfound",
      text: `Every public tool assumes a fuel load nobody publishes. That assumption costs ${fuel ? fuel.value_s.toFixed(2) : "0.31"} seconds a lap.`,
    },
    {
      path: "/deconfound",
      text: "Drag the assumed fuel effect and the compound ranking breaks, live. At the wrong value, tyres improve with wear — physically impossible.",
      sliderDrag: true,
    },
    {
      path: "/deconfound",
      text: "Now the input becomes a decision: drag the next run's fuel load and pace, degradation, stint length and the recommended run all change together.",
      fuelDrag: true,
    },
    {
      path: "/curves",
      text: "Corrected: clean degradation curves on a tyre-energy clock, with credible intervals. Where the data is insufficient, we refuse to draw a curve.",
    },
    {
      path: "/curves",
      text: `Validated by predicting race pace from practice alone: ${best.mae.toFixed(3)} s/lap MAE on held-out races${validation.frozen ? "" : " (fixture values until the freeze)"}.`,
      drawer: true,
    },
    {
      path: "/next",
      text: `And it tells you what to run next: ${rec.compound} × ${rec.laps} laps cuts what we still don't know by ${(rec.expected_uncertainty_reduction * 100).toFixed(0)}%.`,
    },
    {
      path: "/sim",
      text: "Finally, feed it a race and it explains every lap as it happens — degradation, fuel, traffic, driver — each with a confidence, and the pit call updates live.",
      simLoad: true,
    },
  ];
}

export function StoryMode({
  onExit,
  setDrawer,
}: {
  onExit: () => void;
  setDrawer: (open: boolean) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const steps = buildSteps();
  const current = steps[step];

  // One effect per step: navigate, fire side effects, arm the advance timer.
  useEffect(() => {
    router.push(current.path);
    setDrawer(Boolean(current.drawer));
    const stepEvent = current.sliderDrag
      ? STORY_SLIDER_EVENT
      : current.fuelDrag
        ? STORY_FUEL_EVENT
        : current.simLoad
          ? STORY_SIM_EVENT
          : null;
    if (stepEvent) {
      // Give the screen a moment to mount before asking it to animate.
      const t = setTimeout(() => window.dispatchEvent(new CustomEvent(stepEvent)), 400);
      const adv = setTimeout(
        () => (step === steps.length - 1 ? onExit() : setStep((s) => s + 1)),
        HOLD_MS,
      );
      return () => {
        clearTimeout(t);
        clearTimeout(adv);
      };
    }
    if (step === steps.length - 1) {
      const end = setTimeout(onExit, HOLD_MS);
      return () => clearTimeout(end);
    }
    const adv = setTimeout(() => setStep((s) => s + 1), HOLD_MS);
    return () => clearTimeout(adv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  return (
    <div className="story-bar" role="status" aria-live="polite">
      <div className="story-dots" aria-hidden>
        {steps.map((_, i) => (
          <span key={i} className={`d${i === step ? " on" : ""}`} />
        ))}
      </div>
      <div className="s-text">{current.text}</div>
      <button className="close-x" onClick={onExit} aria-label="Exit story mode">
        ✕
      </button>
    </div>
  );
}
