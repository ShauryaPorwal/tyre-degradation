"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { StoryMode, STORY_SIM_EVENT } from "@/components/StoryMode";
import { ValidationDrawer } from "@/components/ValidationDrawer";

const NAV = [
  { href: "/", label: "Pit Wall", sub: "Session overview", icon: "▦" },
  { href: "/deconfound", label: "Deconfound", sub: "Remove the noise", icon: "≡" },
  { href: "/curves", label: "Tyre Curves", sub: "Read the wear rate", icon: "⌁" },
  { href: "/next", label: "Next Run", sub: "Make the call", icon: "⚑" },
  { href: "/sim", label: "Live Sim", sub: "Validate it live", icon: "⌁" },
  { href: "/model", label: "ML Model", sub: "Backend predictor", icon: "◇" },
  { href: "/browse", label: "Session Log", sub: "Browse the archive", icon: "▦" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [storyOn, setStoryOn] = useState(false);

  useEffect(() => {
    setCollapsed(false);
  }, [pathname]);

  const startStory = () => {
    setStoryOn(true);
    window.dispatchEvent(new Event(STORY_SIM_EVENT));
  };

  return (
    <div className={`f1-shell carbon-texture ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="f1-sidebar">
        <div className="f1-sidebar-head">
          <Link href="/" className="f1-brand" aria-label="CLEANROOM pit wall home">
            <span className="f1-brand-mark">C</span>
            <span className="f1-brand-copy">CLEANROOM<span>.</span><small>TYRE INTELLIGENCE</small></span>
          </Link>
          <button className="f1-collapse-btn" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? "›" : "‹"}
          </button>
        </div>

        <div className="f1-sidebar-kicker">CONTROL ROOM / 01</div>
        <nav className="f1-nav" aria-label="Dashboard sections">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={`f1-nav-item ${pathname === item.href ? "active" : ""}`}>
              <span className="f1-nav-icon" aria-hidden="true">{item.icon}</span>
              <span className="f1-nav-copy"><b>{item.label}</b><small>{item.sub}</small></span>
              {pathname === item.href && <span className="f1-nav-live" />}
            </Link>
          ))}
        </nav>

        <div className="f1-sidebar-status">
          <span><i className="status-dot good" /> Feed integrity <b>READY</b></span>
          <span><small>SESSION</small> SYNTHETIC V2</span>
          <span><small>ACTIVE</small> 2025_ESP_FP2</span>
        </div>
      </aside>

      <div className="f1-main-col">
        <header className="f1-topbar">
          <div className="f1-session-title"><span>PIT WALL / {pathname === "/" ? "PIT WALL" : pathname.slice(1).toUpperCase()}</span><b>Spanish Grand Prix 2025 · FP2</b></div>
          <div className="f1-topbar-metrics">
            <div><small>MODE</small><b><i className="status-dot live" /> LIVE MONITOR</b></div>
            <SessionTimer />
            <div><small>TRACK STATE</small><b><i className="status-dot good" /> GREEN</b></div>
          </div>
          <div className="f1-topbar-actions">
            <button className="f1-action-btn" onClick={() => setDrawerOpen(true)}>How do we know?</button>
            <button className="f1-action-btn accent" onClick={startStory}>▶ <span>Story</span></button>
          </div>
        </header>

        <main className="f1-content">
          <div className="f1-page-enter" key={pathname}>{children}</div>
        </main>
      </div>

      <ValidationDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      {storyOn && <StoryMode onExit={() => setStoryOn(false)} setDrawer={setDrawerOpen} />}
    </div>
  );
}

function SessionTimer() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <div><small>UPTIME</small><b>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</b></div>;
}

