"use client";

import { useEffect, useMemo, useState } from "react";
import { features, laps, type Lap } from "@/lib/data";

type TelemetryLap = Lap & {
  s1?: number;
  s2?: number;
  s3?: number;
  speed_st?: number;
  track_temp?: number;
  air_temp?: number;
  rainfall?: boolean;
  fuel_kg?: number;
  traffic_exposure?: number;
};

const driver = laps[0]?.driver ?? "VER";
const featureByLap = new Map(features.filter((f) => f.driver === driver).map((f) => [f.lap_number, f]));
const rows = laps
  .filter((lap) => lap.driver === driver)
  .sort((a, b) => a.lap_number - b.lap_number)
  .map((lap) => ({ ...lap, ...featureByLap.get(lap.lap_number) })) as TelemetryLap[];

export function TelemetryStream() {
  const [index, setIndex] = useState(Math.max(rows.length - 1, 0));
  const [playing, setPlaying] = useState(false);
  const current = rows[index];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setIndex((value) => {
        if (value >= rows.length - 1) {
          setPlaying(false);
          return value;
        }
        return value + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing]);

  const recent = useMemo(() => rows.slice(Math.max(0, index - 7), index + 1), [index]);
  if (!current) return <p>No demo telemetry is available.</p>;

  return (
    <div className="telemetry-page">
      <header className="telemetry-page-head">
        <div>
          <div className="eyebrow">CLEANROOM / TELEMETRY STREAM</div>
          <h1>Sensor Feed</h1>
          <p className="lede">A timestamped view of the signals that power the pit-wall decision. This replay uses demo lap telemetry.</p>
        </div>
        <span className="demo-pill">DEMO DATA · {driver}</span>
      </header>

      <section className="telemetry-controls pit-panel">
        <div className="stream-status"><span className="stream-dot" /> {playing ? "REPLAYING STREAM" : "STREAM PAUSED"}</div>
        <button className="btn accent" onClick={() => { if (index >= rows.length - 1) setIndex(0); setPlaying((value) => !value); }}>
          {playing ? "Pause stream" : "Play stream"}
        </button>
        <input type="range" min={0} max={Math.max(rows.length - 1, 0)} value={index} onChange={(event) => { setPlaying(false); setIndex(Number(event.target.value)); }} aria-label="Telemetry lap position" />
        <strong>Lap {current.lap_number} / {rows.at(-1)?.lap_number ?? "—"}</strong>
      </section>

      <section className="sensor-grid" aria-label="Current telemetry readings">
        <Sensor label="Lap time" value={`${current.lap_time.toFixed(3)} s`} state="LIVE" />
        <Sensor label="Tyre" value={`${current.compound} · age ${current.tyre_life}`} state="LIVE" />
        <Sensor label="Fuel" value={typeof current.fuel_kg === "number" ? `${current.fuel_kg.toFixed(1)} kg` : "Unavailable"} state={typeof current.fuel_kg === "number" ? "LIVE" : "MISSING"} />
        <Sensor label="Speed trap" value={typeof current.speed_st === "number" ? `${current.speed_st.toFixed(1)} km/h` : "Unavailable"} state={typeof current.speed_st === "number" ? "LIVE" : "MISSING"} />
        <Sensor label="Track temperature" value={typeof current.track_temp === "number" ? `${current.track_temp.toFixed(1)}°C` : "Unavailable"} state={typeof current.track_temp === "number" ? "LIVE" : "MISSING"} />
        <Sensor label="Air temperature" value={typeof current.air_temp === "number" ? `${current.air_temp.toFixed(1)}°C` : "Unavailable"} state={typeof current.air_temp === "number" ? "LIVE" : "MISSING"} />
        <Sensor label="Throttle" value="Awaiting sensor" state="MISSING" />
        <Sensor label="Brake pressure" value="Awaiting sensor" state="MISSING" />
      </section>

      <section className="pit-panel">
        <div className="panel-heading"><div><div className="section-kicker">RECENT LAPS</div><h2>Live signal history</h2></div><span className="panel-note">1 Hz demo replay</span></div>
        <div className="telemetry-table-wrap">
          <table className="telemetry-table">
            <thead><tr><th>Lap</th><th>Time</th><th>Compound</th><th>Tyre age</th><th>Fuel</th><th>Track °C</th><th>Traffic exposure</th></tr></thead>
            <tbody>{recent.map((row) => { const feature = featureByLap.get(row.lap_number); return <tr key={row.lap_number} className={row.lap_number === current.lap_number ? "current-telemetry-row" : ""}><td>{row.lap_number}</td><td>{row.lap_time.toFixed(3)} s</td><td>{row.compound}</td><td>{row.tyre_life}</td><td>{typeof feature?.fuel_kg === "number" ? `${feature.fuel_kg.toFixed(1)} kg` : "—"}</td><td>{typeof row.track_temp === "number" ? row.track_temp.toFixed(1) : "—"}</td><td>{typeof feature?.traffic_exposure === "number" ? feature.traffic_exposure.toFixed(2) : "—"}</td></tr>; })}</tbody>
          </table>
        </div>
      </section>

      <section className="telemetry-missing pit-panel">
        <div className="section-kicker">DATA CONTRACT</div>
        <h2>Signals still required for live pit decisions</h2>
        <p>Throttle, brake pressure, wheel slip, tyre pressure, tyre inner/middle/outer temperatures, GPS gaps and live weather are not present in this demo fixture. The backend must ingest these signals before this page can make a real-time tyre-change call.</p>
      </section>
    </div>
  );
}

function Sensor({ label, value, state }: { label: string; value: string; state: "LIVE" | "MISSING" }) {
  return <div className="sensor-card"><div><span>{label}</span><b className={state === "MISSING" ? "missing" : ""}>{state}</b></div><strong>{value}</strong></div>;
}
