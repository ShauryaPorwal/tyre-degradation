import { chromium } from "patchright";
import { writeFileSync } from "node:fs";

const CSV = `lap,lap_time_s,compound,tyre_age,fuel_kg,gap_ahead_s,track_temp_c,pit_in,pit_out
1,80.51,MEDIUM,0,105,1.2,36,false,false
2,80.32,MEDIUM,1,103.4,1.4,36,false,false
3,80.41,MEDIUM,2,101.7,8.0,35.9,false,false
4,80.55,MEDIUM,3,100.0,1.1,35.8,false,false
5,80.70,MEDIUM,4,98.3,1.3,35.7,false,false
6,80.92,MEDIUM,5,96.6,1.2,35.6,false,false
7,81.15,MEDIUM,6,94.9,1.4,35.5,false,false
8,81.40,MEDIUM,7,93.2,1.1,35.4,false,false
9,81.68,MEDIUM,8,91.5,1.2,35.3,false,false
10,81.97,MEDIUM,9,89.8,1.3,35.2,false,false
11,82.28,MEDIUM,10,88.1,1.2,35.1,false,false
12,82.61,MEDIUM,11,86.4,1.4,35.0,false,false
13,82.95,MEDIUM,12,84.7,1.1,34.9,false,false
14,83.30,MEDIUM,13,83.0,1.2,34.8,false,false
15,83.66,MEDIUM,14,81.3,1.3,34.7,false,false
16,84.03,MEDIUM,15,79.6,1.1,34.6,false,false
17,84.41,MEDIUM,16,77.9,1.2,34.5,false,false
18,84.80,MEDIUM,17,76.2,1.4,34.4,false,false
19,85.20,MEDIUM,18,74.5,1.2,34.3,false,false
20,85.61,MEDIUM,19,72.8,1.3,34.2,false,false
21,80.10,HARD,0,70.0,1.2,34.1,true,false
22,80.25,HARD,1,68.3,1.1,34.0,false,true
23,80.40,HARD,2,66.6,1.2,33.9,false,false
24,80.56,HARD,3,64.9,1.3,33.8,false,false
25,80.73,HARD,4,63.2,1.1,33.7,false,false
26,80.91,HARD,5,61.5,1.2,33.6,false,false
27,81.10,HARD,6,59.8,1.4,33.5,false,false
28,81.30,HARD,7,58.1,1.2,33.4,false,false
29,81.51,HARD,8,56.4,1.1,33.3,false,false
30,81.73,HARD,9,54.7,1.2,33.2,false,false`;

const b = await chromium.launch({ headless: false });
const p = await b.newPage();
const logs = [];
p.on("console", (m) => logs.push(`${m.type()}: ${m.text().slice(0, 400)}`));
p.on("pageerror", (e) => logs.push(`PAGEERROR: ${e.message.slice(0, 600)}`));
await p.goto("http://localhost:3000/sim", { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForSelector("button", { timeout: 60000 });
await p.waitForTimeout(4000); // allow React hydration before clicking
await p.getByRole("button", { name: "Structured data" }).click();
await p.waitForTimeout(1000);
console.log("AFTER CLICK:", await p.evaluate(() => document.body.innerText.slice(0, 500)));
await p.waitForSelector('input[type="file"]', { state: "attached", timeout: 30000 });
writeFileSync("_live_test.csv", CSV);
await p.setInputFiles('input[type="file"]', "_live_test.csv");
await p.waitForTimeout(4000);
const state = await p.evaluate(() => ({
  bodyTextLen: document.body.innerText.length,
  eyebrow: document.querySelector(".eyebrow")?.innerText ?? null,
  headline: document.querySelector(".sim-headline .sentence")?.innerText ?? null,
  kpis: [...document.querySelectorAll(".kpi-row .tile, .kpi-row > *")].map((t) => t.innerText.replace(/\n/g, " | ")),
  panels: [...document.querySelectorAll("section.card")].map((c) => c.innerText.slice(0, 200)),
  error: document.querySelector(".empty-state")?.innerText ?? null,
}));
console.log(JSON.stringify(state, null, 2));
console.log("CONSOLE LOGS:\n" + logs.slice(0, 30).join("\n"));
await b.close();
