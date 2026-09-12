import type { Metadata } from "next";
import { Rajdhani, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { RaceBackground } from "@/components/RaceBackground";

const rajdhani = Rajdhani({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-rajdhani" });
const robotoMono = Roboto_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-roboto-mono" });

export const metadata: Metadata = {
  title: "CLEANROOM — tyre degradation, deconfounded",
  description:
    "Isolating true tyre degradation from confounded F1 practice-session data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${rajdhani.variable} ${robotoMono.variable}`}>
      <body>
        <div className="site-root">
          <RaceBackground />
          <AppShell>{children}</AppShell>
        </div>
      </body>
    </html>
  );
}
