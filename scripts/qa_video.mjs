import { chromium } from "patchright";

const VIDEO = "_synth_race_long.webm";

const b = await chromium.launch({ headless: false });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 400)));
p.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE-ERR:", m.text().slice(0, 200)); });

await p.goto("http://localhost:3000/sim", { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForSelector("button", { timeout: 60000 });
await p.waitForTimeout(4000);
await p.getByRole("button", { name: "Race video" }).click();
await p.waitForSelector('input[accept="video/*"]', { state: "attached", timeout: 30000 });
await p.setInputFiles('input[accept="video/*"]', VIDEO);
await p.waitForTimeout(2000);

// 1) automatic processing
await p.getByRole("button", { name: /Auto-detect laps/ }).click();
await p.waitForTimeout(2500);
console.log("during processing:", await p.evaluate(() => document.body.innerText.match(/⏳ Processing…|Sampling frames[^\n]*/)?.[0] ?? "(no progress text)"));
// wait for extraction to finish (max 60s)
let reportText = null;
for (let i = 0; i < 30; i++) {
  await p.waitForTimeout(2000);
  reportText = await p.evaluate(() => document.body.innerText.match(/Extraction report[^\n]*/)?.[0] ?? null);
  const busy = await p.evaluate(() => document.body.innerText.includes("Processing…"));
  if (reportText && !busy) break;
}
console.log("REPORT:", reportText);
const marksAfterAuto = await p.evaluate(() => document.body.innerText.match(/(\d+) boundaries → (\d+) laps/)?.[0] ?? null);
console.log("after auto-detect:", marksAfterAuto);

// 2) analyse directly from auto-detected boundaries → CLEANROOM
const analyseBtn = p.getByRole("button", { name: /Analyse \d+ laps/ });
console.log("analyse button:", await analyseBtn.innerText());
await analyseBtn.click();
await p.waitForTimeout(4000);
const result = await p.evaluate(() => ({
  eyebrow: document.querySelector(".eyebrow")?.innerText ?? null,
  headline: document.querySelector(".sim-headline .sentence")?.innerText ?? null,
  kpis: [...document.querySelectorAll(".kpi-row > *")].map((t) => t.innerText.replace(/\n/g, " | ")),
  panels: [...document.querySelectorAll("section.card")].map((c) => c.querySelector(".card-title")?.innerText),
  note: document.querySelector(".sim-layout ~ p.note, body > p.note, p.note:last-of-type")?.innerText?.slice(0, 400) ?? null,
  tyrePanel: [...document.querySelectorAll("section.card")].map((c) => c.innerText).find((t) => t.includes("Fitted deg"))?.slice(0, 300) ?? null,
}));
console.log("RESULT:", JSON.stringify(result, null, 2));
await b.close();
