"use client";

import Link from "next/link";
import { useState } from "react";

const PRESETS = [
  {
    id: "safety-car",
    name: "Safety Car Pit Shuffle",
    tag: "RACE CONTROL",
    description: "A safety car compresses the field and creates a low-cost pit window.",
    call: "BOX NOW",
    compound: "MEDIUM",
    window: "LAP 18–20",
    gain: "+6.8 s",
    confidence: "89%",
    colour: "red",
    facts: ["Pit loss reduced by 11.4 s", "Traffic after stop: LOW", "Tyre warm-up: ACCEPTABLE"],
  },
  {
    id: "undercut",
    name: "Undercut Attack",
    tag: "TYRE STRATEGY",
    description: "Fresh rubber is fast enough to overtake the rival before their planned stop.",
    call: "PIT IN 2 LAPS",
    compound: "SOFT",
    window: "LAP 24–25",
    gain: "+3.4 s",
    confidence: "76%",
    colour: "green",
    facts: ["Fresh-tyre delta: −0.42 s/lap", "Rival ahead: +1.8 s", "Cliff risk: MEDIUM"],
  },
  {
    id: "wet-crossover",
    name: "Wet-Track Crossover",
    tag: "WEATHER",
    description: "Rain intensity crosses the slick-to-intermediate threshold during the next stint.",
    call: "PREPARE INTERMEDIATE",
    compound: "INTERMEDIATE",
    window: "LAP 31–33",
    gain: "+9.1 s",
    confidence: "68%",
    colour: "blue",
    facts: ["Rain probability: 78%", "Standing water: LOW", "Crossover uncertainty: HIGH"],
  },
] as const;

export function DemoMode() {
  const [selected, setSelected] = useState<(typeof PRESETS)[number]>(PRESETS[0]);
  const [applied, setApplied] = useState(false);

  const applyPreset = () => {
    window.sessionStorage.setItem("cleanroom.demo.preset", selected.id);
    setApplied(true);
    window.dispatchEvent(new CustomEvent("cleanroom:demo-preset", { detail: selected.id }));
  };

  return (
    <div className="demo-page">
      <header>
        <div className="eyebrow">CLEANROOM / DEMO MODE</div>
        <div className="demo-title-row"><div><h1>Pitch the pit wall</h1><p className="lede">Use controlled scenarios to demonstrate how telemetry, tyre state and race context change the recommendation. Every value on this page is synthetic.</p></div><span className="demo-pill">SYNTHETIC SCENARIOS</span></div>
      </header>

      <section className="demo-banner"><strong>DEMO MODE</strong><span>These scenarios are for presentation and UI testing. They do not replace a live sensor feed or a validated race strategy.</span></section>

      <section className="demo-preset-grid" aria-label="Demo scenarios">
        {PRESETS.map((preset) => <button key={preset.id} className={`demo-preset ${selected.id === preset.id ? "selected" : ""}`} onClick={() => { setSelected(preset); setApplied(false); }}><span className={`demo-preset-line ${preset.colour}`} /><span className="demo-preset-tag">{preset.tag}</span><strong>{preset.name}</strong><small>{preset.description}</small></button>)}
      </section>

      <section className={`demo-result demo-result--${selected.colour}`}>
        <div className="demo-result-main"><div className="section-kicker">SELECTED SCENARIO · {selected.tag}</div><div className="demo-call">{selected.call}</div><p>{selected.description}</p><button className="btn accent" onClick={applyPreset}>{applied ? "PRESET APPLIED" : "APPLY DEMO PRESET"}</button></div>
        <div className="demo-result-values"><DemoMetric label="Tyre call" value={selected.compound} /><DemoMetric label="Pit window" value={selected.window} /><DemoMetric label="Expected gain" value={selected.gain} /><DemoMetric label="Confidence" value={selected.confidence} /></div>
      </section>

      <section className="demo-panel"><div className="panel-heading"><div><div className="section-kicker">RACE ENGINEER READ-OUT</div><h2>Why this scenario matters</h2></div><span className="panel-note">Preset explanation</span></div><div className="demo-facts">{selected.facts.map((fact) => <div key={fact}><span>✓</span><strong>{fact}</strong></div>)}</div><div className="demo-next-links"><Link href="/telemetry">Inspect telemetry →</Link><Link href="/next">Open pit strategy →</Link><Link href="/validation">Show validation →</Link></div></section>

      <section className="demo-panel demo-limit"><div className="section-kicker">LIVE MODE HANDOFF</div><h2>What changes outside the demo?</h2><p>In production, this preset layer is replaced by current sensor data: GPS gaps, fuel, tyre pressure and temperature, throttle, brake, weather and race position. The strategy engine then recomputes the call instead of using preset values.</p></section>
    </div>
  );
}

function DemoMetric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
