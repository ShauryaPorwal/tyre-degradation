import { chromium } from "patchright";

const b = await chromium.launch({ headless: false });
const p = await b.newPage();
p.on("console", (m) => console.log("CONSOLE", m.type(), m.text().slice(0, 300)));
p.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 500)));
p.on("requestfailed", (r) => console.log("REQFAIL", r.url(), r.failure()?.errorText));
p.on("response", async (r) => {
  const u = r.url();
  if (u.includes("/_next/static/chunks/") && (u.includes("webpack") || u.includes("main-app"))) {
    const body = await r.text().catch(() => "<no body>");
    console.log("RESP", r.status(), u.split("/").pop(), "len", body.length, "head:", body.slice(0, 100).replace(/\n/g, " "));
  }
});
await p.goto("http://localhost:3000/sim", { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(4000);
const r = await p.evaluate(() => ({
  nextF: typeof self.__next_f,
  webpack: typeof window.webpackChunk_N_E,
  scripts: [...document.querySelectorAll("script")].map((s) => (s.src ? "src:" + s.src.split("/").pop() : "inline:" + (s.textContent || "").slice(0, 40))),
}));
console.log(JSON.stringify(r, null, 1));
await b.close();
