"use client";

/* Top bar per docs/UI.md information architecture:
   4 screens in the nav · "How do we know?" drawer · Story Mode (▶). */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { sessionMeta, validation } from "@/lib/data";
import { ValidationDrawer } from "@/components/ValidationDrawer";
import { StoryMode } from "@/components/StoryMode";

const NAV = [
  { href: "/", label: "Session" },
  { href: "/deconfound", label: "Deconfound" },
  { href: "/curves", label: "Curves" },
  { href: "/next", label: "Next Run" },
  { href: "/sim", label: "Live Sim" },
];

export function Header() {
  const path = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [storyOn, setStoryOn] = useState(false);

  return (
    <>
      <header className="topbar">
        <Link href="/" className="wordmark" aria-label="CLEANROOM home">
          CLEANROOM<span className="dot">.</span>
        </Link>

        <nav className="topnav" aria-label="Screens">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={path === item.href ? "active" : ""}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="topbar-actions">
          {!validation.frozen && (
            <span className="badge-fixture" title={`${sessionMeta.session_id} — synthetic until results/frozen_v1.json exists`}>
              Synthetic fixtures
            </span>
          )}
          <button className="btn" onClick={() => setDrawerOpen(true)}>
            How do we know?
          </button>
          <button
            className="btn accent"
            onClick={() => setStoryOn(true)}
            aria-label="Play story mode"
            title="Story mode — auto-plays the whole argument"
          >
            ▶
          </button>
        </div>
      </header>

      <ValidationDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      {storyOn && (
        <StoryMode
          onExit={() => {
            setStoryOn(false);
            setDrawerOpen(false);
          }}
          setDrawer={setDrawerOpen}
        />
      )}
    </>
  );
}
