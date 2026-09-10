import { chromium } from "patchright";
import { writeFileSync } from "node:fs";

async function run(page, name, text, ext) {
  await page.goto("http://localhost:3000/sim", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("button", { timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.getByRole("button", { name: "Structured data" }).click();
  await page.waitForSelector('input[type="file"]', { state: "attached", timeout: 30000 });
  const path = `_test_${name}.${ext}`;
  writeFileSync(path, text);
  await page.setInputFiles('input[type="file"]', path);
  await page.waitForTimeout(5000);
  return page.evaluate(() => ({
    headline: document.querySelector(".sim-headline .sentence")?.innerText ?? null,
    kpiCount: document.querySelectorAll(".kpi-row > *").length,
    error: document.querySelector(".empty-state")?.innerText ?? null,
    warnings: [...document.querySelectorAll(".note")].map((n) => n.innerText.slice(0, 300)),
  }));
}

const b = await chromium.launch({ headless: false });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 400)));

// Case 1: JSON upload
const json = JSON.stringify(Array.from({ length: 24 }, (_, i) => ({
  lap: i + 1, lap_time_s: 80.4 + 0.08 * i + (i === 10 ? 3 : 0),
  compound: i < 12 ? "SOFT" : "HARD", tyre_age: i % 12, fuel_kg: 100 - 1.7 * i,
  pit_in: i === 11, pit_out: i === 12,
})));
console.log("JSON result:", JSON.stringify(await run(p, "json", json, "json"), null, 2));

// Case 2: real-world style CSV with mm:ss.mmm lap times + unfamiliar column names
const csv = `LapNumber,LapTime,Compound,TyreLife,PitInTime
1,1:38.123,SOFT,0,
2,1:37.987,SOFT,1,
3,1:38.045,SOFT,2,
4,1:38.221,SOFT,3,
5,1:38.410,SOFT,4,
6,1:38.650,SOFT,5,
7,1:38.900,SOFT,6,
8,1:39.180,SOFT,7,
9,1:39.470,SOFT,8,
10,1:39.760,SOFT,9,
11,1:40.060,SOFT,10,
12,1:40.370,SOFT,11,
13,2:09.500,HARD,0,2026-01-01 00:00:00
14,1:39.100,HARD,1,
15,1:39.050,HARD,2,
16,1:39.010,HARD,3,
17,1:38.980,HARD,4,
18,1:38.960,HARD,5,
19,1:38.950,HARD,6,
20,1:38.940,HARD,7,
21,1:38.930,HARD,8,
22,1:38.925,HARD,9,
23,1:38.920,HARD,10,
24,1:38.915,HARD,11,
`;
console.log("CSV-laptime result:", JSON.stringify(await run(p, "laptime", csv, "csv"), null, 2));
await b.close();
