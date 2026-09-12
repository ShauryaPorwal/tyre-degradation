import Link from "next/link";
import { SandbaggingBoard } from "@/components/SandbaggingBoard";
import { features, laps, sessionMeta } from "@/lib/data";

const sensorCoverage = [
  ["Lap timing", `${laps.length} records`, "AVAILABLE"],
  ["Fuel estimate", `${features.length} records`, "AVAILABLE"],
  ["Track / air temperature", "Lap-level", "AVAILABLE"],
  ["Tyre compound", "Soft · Medium · Hard", "PARTIAL"],
  ["Throttle / brake", "No records", "MISSING"],
  ["Tyre pressure / temperature", "No records", "MISSING"],
  ["GPS traffic gaps", "No records", "MISSING"],
  ["Intermediate / Wet", "No dry-session records", "MISSING"],
] as const;

export default function BrowsePage() {
  return (
    <div className="archive-page">
      <header>
        <div className="eyebrow">CLEANROOM / SESSION ARCHIVE</div>
        <div className="archive-title-row">
          <div>
            <h1>Choose a data session</h1>
            <p className="lede">Select the session that powers the pit wall, inspect what signals are available, and see which decisions the data can support.</p>
          </div>
          <span className="demo-pill">DEMO ARCHIVE</span>
        </div>
      </header>

      <section className="archive-featured">
        <div><div className="section-kicker">ACTIVE SESSION</div><h2>{sessionMeta.display_name}</h2><p>{sessionMeta.session_id} · synthetic fixture · health {sessionMeta.health.toFixed(0)} / 100</p></div>
        <div className="archive-actions"><Link href="/" className="btn accent">Open Pit Wall</Link><Link href="/telemetry" className="btn">Open Telemetry</Link></div>
      </section>

      <section className="archive-stat-grid">
        <ArchiveStat label="Recorded laps" value={String(sessionMeta.n_laps)} />
        <ArchiveStat label="Clean laps" value={String(sessionMeta.n_clean_laps)} />
        <ArchiveStat label="Drivers" value="20" />
        <ArchiveStat label="Session type" value="FP2" />
      </section>

      <div className="archive-columns">
        <section className="archive-panel"><div className="panel-heading"><div><div className="section-kicker">SESSION HEALTH</div><h2>Can this session answer the question?</h2></div></div><div className="archive-health"><div className="archive-health-number">{sessionMeta.health.toFixed(0)}</div><div><strong>Session health</strong><p>Based on clean-lap yield, compound coverage, traffic contamination and completeness.</p></div></div><div className="health-bars">{Object.entries(sessionMeta.health_components).map(([key, value]) => <div key={key}><span>{key.replaceAll("_", " ")}</span><i><b style={{ width: `${value * 100}%` }} /></i><strong>{(value * 100).toFixed(0)}%</strong></div>)}</div></section>

        <section className="archive-panel"><div className="panel-heading"><div><div className="section-kicker">SIGNAL COVERAGE</div><h2>What is inside?</h2></div></div><div className="coverage-list">{sensorCoverage.map(([label, detail, state]) => <div key={label}><span className={`coverage-dot ${state.toLowerCase()}`} /><div><strong>{label}</strong><small>{detail}</small></div><b>{state}</b></div>)}</div></section>
      </div>

      <section className="archive-panel"><div className="panel-heading"><div><div className="section-kicker">DATA ROUTES</div><h2>What can you do with this session?</h2></div></div><div className="archive-route-grid"><Link href="/deconfound"><strong>Deconfound</strong><span>Separate fuel, traffic and track evolution.</span></Link><Link href="/curves"><strong>Tyre Intelligence</strong><span>Estimate dry-compound degradation.</span></Link><Link href="/validation"><strong>Validation</strong><span>Check model error and uncertainty.</span></Link><Link href="/sim"><strong>Live Sim</strong><span>Replay the available lap sequence.</span></Link></div></section>

      <section className="archive-panel"><div className="panel-heading"><div><div className="section-kicker">SECONDARY ANALYSIS</div><h2>Sandbagging leaderboard</h2></div></div><p className="archive-description">Timing-sheet pace compared with deconfounded pace. This is an analysis view, not a pit command.</p><SandbaggingBoard /></section>

      <section className="archive-panel archive-roadmap"><div className="section-kicker">NEXT DATA DROP</div><h2>What the live archive still needs</h2><p>When a sensor session is uploaded, it should arrive with timestamps, driver/car identity, tyre events, C1–C5 or wet-compound labels, GPS position, fuel, throttle, brake, tyre temperatures, tyre pressure and weather context.</p></section>
    </div>
  );
}

function ArchiveStat({ label, value }: { label: string; value: string }) { return <div className="archive-stat"><span>{label}</span><strong>{value}</strong></div>; }
