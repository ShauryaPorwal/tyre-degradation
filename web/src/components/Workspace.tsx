"use client";
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api, Catalog, Report, Selection, fmt } from "./types";

type Context = { catalog: Catalog; selection: Selection | null; select: (v: Selection) => void; report: Report | null; busy: boolean; error: string; reload: () => void };
const Context = createContext<Context | null>(null);
export function useWorkspace() { const value = useContext(Context); if (!value) throw new Error("Workspace missing"); return value; }
const nav = [["/", "Pit Wall"], ["/telemetry", "Telemetry & tyres"], ["/curves", "Tyre curves"], ["/deconfound", "Deconfounding"], ["/next", "Pit scenarios"], ["/model", "Model & timing"], ["/validation", "Validation"], ["/browse", "Session archive"], ["/demo", "Demo mode"]];

export function Workspace({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [catalog, setCatalog] = useState<Catalog>({ sessions: [], rejected_exports: [] });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [revision, setRevision] = useState(0);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const c = new AbortController(); setBusy(true); setError("");
    api<Catalog>("catalog", undefined, c.signal).then(data => {
      setCatalog(data);
      let saved: Selection | null = null;
      try { saved = JSON.parse(localStorage.getItem("cleanroom.selection") || "null"); } catch { /* select from catalog */ }
      const s = data.sessions.find(s => s.session_id === saved?.session_id) || data.sessions.find(s => s.session_id.endsWith("FP2")) || data.sessions[0];
      const d = s?.drivers.find(d => d.driver === saved?.driver) || s?.drivers.find(d => d.driver === "VER") || s?.drivers[0];
      if (!s || !d) { setError("No valid exports. Check rejected exports in Session archive."); setBusy(false); return; }
      setSelection({ session_id: s.session_id, driver: d.driver, lap: saved && d.laps.includes(saved.lap) ? saved.lap : d.laps[d.laps.length - 1] });
    }).catch(e => { if (!c.signal.aborted) { setError(e.message); setBusy(false); } });
    return () => c.abort();
  }, [catalogRevision]);
  useEffect(() => {
    if (!selection) return;
    const c = new AbortController(); setBusy(true); setError(""); setReport(null);
    try { localStorage.setItem("cleanroom.selection", JSON.stringify(selection)); } catch { /* storage optional */ }
    api<Report>("analyze", selection, c.signal).then(setReport).catch(e => { if (!c.signal.aborted) setError(e.message); }).finally(() => { if (!c.signal.aborted) setBusy(false); });
    return () => c.abort();
  }, [selection, revision]);
  const session = catalog.sessions.find(s => s.session_id === selection?.session_id);
  const driver = session?.drivers.find(d => d.driver === selection?.driver);
  function select(v: Selection) { setReport(null); setSelection(v); }
  return <Context.Provider value={{ catalog, selection, select, report, busy, error, reload: () => setRevision(r => r + 1) }}>
    <div className="shell">
      <aside className={menu ? "sidebar open" : "sidebar"}><Link href="/" className="brand"><b>C</b><span>CLEANROOM<small>MOTORSPORT INTELLIGENCE</small></span></Link><p className="eyebrow">ENGINEERING DESK</p><nav>{nav.map(([href, text]) => <Link onClick={() => setMenu(false)} key={href} href={href} aria-current={path === href ? "page" : undefined} className={path === href ? "active" : ""}>{text}</Link>)}</nav><div className="sidebar-foot">HISTORICAL REPLAY<br /><span>No live hardware connected</span></div></aside>
      <div className="main"><header><button className="menu" onClick={() => setMenu(!menu)} aria-label="Toggle navigation">☰</button><div><span className="eyebrow">{path === "/demo" ? "SYNTHETIC SCENARIOS" : "FASTF1 HISTORICAL ANALYSIS"}</span><strong>{selection?.session_id || "Connecting to backend"}</strong></div><div className="header-values">Track {fmt(report?.source_row.track_temp)} °C · Air {fmt(report?.source_row.air_temp)} °C</div></header>
        <div className="selection"><label>Session<select disabled={busy} value={selection?.session_id || ""} onChange={e => { const s = catalog.sessions.find(s => s.session_id === e.target.value)!; const d = s.drivers.find(d => d.driver === selection?.driver) || s.drivers[0]; select({ session_id: s.session_id, driver: d.driver, lap: d.laps[d.laps.length - 1] }); }}>{catalog.sessions.map(s => <option key={s.session_id}>{s.session_id}</option>)}</select></label>
          <label>Driver<select disabled={busy} value={selection?.driver || ""} onChange={e => { const d = session!.drivers.find(d => d.driver === e.target.value)!; select({ session_id: session!.session_id, driver: d.driver, lap: d.laps[d.laps.length - 1] }); }}>{session?.drivers.map(d => <option key={d.driver}>{d.driver}</option>)}</select></label>
          <label>Through lap<select disabled={busy} value={selection?.lap || ""} onChange={e => select({ ...selection!, lap: Number(e.target.value) })}>{driver?.laps.map(l => <option key={l}>{l}</option>)}</select></label><button disabled={busy} onClick={() => { setRevision(r => r + 1); setCatalogRevision(r => r + 1); }}>Refresh</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {busy && <p className="loading" role="status">Loading selected lap…</p>}
        <main className="content"><div key={JSON.stringify(selection)}>{children}</div></main><footer>Local export integrity checked · Model estimates and scenario assumptions are labelled separately.</footer>
      </div>
    </div>
  </Context.Provider>;
}
