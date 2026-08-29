import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "CLEANROOM — tyre degradation, deconfounded",
  description:
    "Isolating true tyre degradation from confounded F1 practice-session data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
