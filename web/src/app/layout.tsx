import type { Metadata } from "next";
import { Workspace } from "@/components/Workspace";
import "./globals.css";
export const metadata: Metadata = { title: "CLEANROOM — Motorsport Intelligence", description: "Historical telemetry, tyre pace analysis and transparent strategy scenarios." };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><Workspace>{children}</Workspace></body></html>; }
