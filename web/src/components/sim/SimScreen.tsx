"use client";

/* Live Simulation — orchestration. The engine runs once over the loaded race
   (each lap's analysis uses only the laps before it — the arrays are built
   sequentially, so "replay" is honest, not re-fitted hindsight); playback
   reveals the analyses on a tick, and every panel reads the revealed
   frontier. Charts, tyre state, prediction and strategy therefore update
   live as laps arrive. */

import { useEffect, useMemo, useState } from "react";
import { Tile, compoundLabel } from "@/components/ui";
import { STORY_SIM_EVENT } from "@/components/StoryMode";
import { demoRace } from "@/components/sim/SimIngest";
import { SimEngine } from "@/lib/sim/engine";
import type { LapAnalysis, RaceData } from "@/lib/sim/types";
import { SimIngest } from "@/components/sim/SimIngest";
import { SimPaceChart } from "@/components/sim/SimPaceChart";
import { SimDecomp } from "@/components/sim/SimDecomp";
import { ModelStatePanel, StrategyPanel, TyrePanel } from "@/components/sim/SimSidePanels";

const TICK_MS = 700;

function headline(a: LapAnalysis): string {
  if (a.excluded && !a.excludeReason?.includes("event")) {
    if (a.excludeReason?.startsWith("overtake") || a.excludeReason?.startsWith("defending")) {
      const event = a.excludeReason.startsWith("overtake") ? "overtake" : "defending";
      return `Lap ${a.lap} carries an ${event} event: ${a.residual_s >= 0 ? "+" : "−"}${Math.abs(a.residual_s).toFixed(2)} s above the model — attributed to the ${event} plus driver inputs, excluded from the fit.`;
    }
    return `Lap ${a.lap} excluded from the fit: ${a.excludeReason}.`;
  }
  if (a.refLap == null || a.deltaVsRef == null) {
    return `Lap ${a.lap} is the first clean lap — it becomes the reference.`;
  }
  if (a.deltaVsRef <= 0.005) {
    return `Lap ${a.lap} is a new best — it becomes the reference for the decomposition.`;
  }
  const parts = [...a.components]
    .filter((c) => Math.abs(c.value_s) >= 0.02)
    .sort((x, y) => Math.abs(y.value_s) - Math.abs(x.value_s))
    .slice(0, 4)
    .map(
      (c) =>
        `${c.value_s >= 0 ? "" : "−"}${Math.abs(c.value_s).toFixed(2)} s ${c.label.toLowerCase()}${c.priorDominated ? " (prior)" : ""}`,
    );
  if (Math.abs(a.residual_s) >= 0.02) {
    parts.push(`${a.residual_s >= 0 ? "" : "−"}${Math.abs(a.residual_s).toFixed(2)} s driver inputs / unexplained`);
  }
  return `Lap ${a.lap} was ${a.deltaVsRef.toFixed(2)} s slower than lap ${a.refLap}: ${parts.join(", ")}.`;
}

export function SimScreen() {
  const [race, setRace] = useState<RaceData | null>(null);
  const [upTo, setUpTo] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [showTruth, setShowTruth] = useState(false);

  const analyses = useMemo(() => {
    if (!race) return [];
    const engine = new SimEngine(race);
    return race.laps.map((l) => engine.processLap(l));
  }, [race]);

  // Story Mode: load the demo race and run it at speed.
  useEffect(() => {
    const run = () => {
      setRace(demoRace());
      setUpTo(0);
      setSelected(null);
      setSpeed(4);
      setPlaying(true);
    };
    window.addEventListener(STORY_SIM_EVENT, run);
    return () => window.removeEventListener(STORY_SIM_EVENT, run);
  }, []);

  useEffect(() => {
    if (!playing || !race) return;
    if (upTo >= analyses.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setUpTo((i) => Math.min(i + 1, analyses.length - 1)), TICK_MS / speed);
    return () => clearTimeout(t);
  }, [playing, upTo, analyses.length, speed, race]);

  if (!race) {
    return (
      <>
        <div className="eyebrow">Live simulation · choose a data source</div>
        <SimIngest
          onLoad={(r) => {
            setRace(r);
            setUpTo(0);
            setSelected(null);
            setPlaying(true);
          }}
        />
      </>
    );
  }

  const current = analyses[upTo];
  const currentLap = race.laps[upTo];
  const sel = selected != null ? analyses.find((a) => a.lap === selected) ?? current : current;
  const selLap = race.laps.find((l) => l.lap === sel.lap) ?? currentLap;

  return (
    <>
      <div className="eyebrow">
        {race.display_name}
        {race.synthetic && " · synthetic demo with known ground truth"}
      </div>

      <div className="sim-controls">
        <button
          className="btn accent"
          onClick={() => {
            if (upTo >= analyses.length - 1) setUpTo(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? "❚❚ Pause" : "▶ Run race"}
        </button>
        {[1, 2, 4].map((s) => (
          <button key={s} className="btn" style={{ opacity: speed === s ? 1 : 0.6 }} onClick={() => setSpeed(s)}>
            {s}×
          </button>
        ))}
        <input
          type="range"
          min={0}
          max={analyses.length - 1}
          value={upTo}
          onChange={(e) => {
            setPlaying(false);
            setUpTo(Number(e.target.value));
            setSelected(null);
          }}
          aria-label="Scrub race laps"
          style={{ flex: 1, minWidth: 160 }}
        />
        <span className="slider-readout">
          lap {current.lap} / {race.total_laps}
        </span>
        {race.synthetic && (
          <button className="btn" style={{ opacity: showTruth ? 1 : 0.6 }} onClick={() => setShowTruth((s) => !s)}>
            ◆ truth overlay
          </button>
        )}
        <button
          className="btn"
          onClick={() => {
            setRace(null);
            setPlaying(false);
          }}
        >
          Change data
        </button>
      </div>

      <div className="kpi-row">
        <Tile
          label="Last lap"
          value={current.lapTime.toFixed(2)}
          unit="s"
          meta={`${compoundLabel(currentLap.compound)} · age ${currentLap.tyre_age}${currentLap.fuel_kg != null ? ` · ${currentLap.fuel_kg.toFixed(0)} kg` : ""}`}
        />
        <Tile
          label="Predicted next lap"
          value={current.nextPredicted != null ? current.nextPredicted.toFixed(2) : "—"}
          unit={current.nextPredicted != null ? `± ${current.nextPredictedPm!.toFixed(2)} s` : undefined}
          meta="one-step-ahead, ±1σ"
        />
        <Tile
          label="Clean laps fitted"
          value={String(current.nCleanFitted)}
          meta={`${upTo + 1 - current.nCleanFitted} excluded, with reasons`}
        />
        <Tile
          label="Pit call"
          value={
            current.strategy.optimalPitLap != null ? `L${current.strategy.optimalPitLap}` : "stay out"
          }
          meta={
            current.strategy.optimalPitLap != null
              ? `window ${current.strategy.windowLo}–${current.strategy.windowHi} · P(≤3 laps) ${(current.strategy.pitNowProb * 100).toFixed(0)}%`
              : "no further stop"
          }
        />
      </div>

      {/* the quotable line — why THIS lap was slow, with attribution */}
      <div className="sim-headline" role="status" aria-live="polite">
        <div className="lap-tag">
          Lap {sel.lap} read-out{sel.lap !== current.lap ? " (selected)" : ""}
        </div>
        <div className="sentence">{headline(sel)}</div>
      </div>

      <div className="sim-layout">
        <div>
          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Pace vs model prediction</div>
                <div className="card-sub">
                  Dots: laps (hollow = excluded, with reason on hover). Dashed line: one-step-ahead
                  prediction, band ±1σ. Click a lap to decompose it.
                </div>
              </div>
            </div>
            <SimPaceChart
              race={race}
              analyses={analyses}
              upTo={upTo}
              selected={sel.lap}
              onSelect={(lap) => setSelected(lap)}
            />
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Why lap {sel.lap} ran the time it did</div>
                <div className="card-sub">
                  Attribution vs the best clean lap, from the posterior at that point in the race.
                </div>
              </div>
            </div>
            <SimDecomp race={race} analysis={sel} showTruth={showTruth} />
          </section>
        </div>

        <div>
          <TyrePanel lap={selLap} analysis={sel} />
          <StrategyPanel analysis={current} race={race} />
          <ModelStatePanel analysis={sel} />
        </div>
      </div>

      {race.note && (
        <p className="note" style={{ marginTop: 8 }}>
          {race.note}
        </p>
      )}
    </>
  );
}
