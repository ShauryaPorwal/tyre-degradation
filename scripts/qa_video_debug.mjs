import { chromium } from "patchright";
const b = await chromium.launch({ headless: false });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 300)));
await p.goto("http://localhost:3000/sim", { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForSelector("button", { timeout: 60000 });
await p.waitForTimeout(3000);
await p.getByRole("button", { name: "Race video" }).click();
await p.waitForSelector('input[accept="video/*"]', { state: "attached" });
await p.setInputFiles('input[accept="video/*"]', "_synth_race.webm");
await p.waitForTimeout(2500);
const out = await p.evaluate(async () => {
  const v = document.querySelector("video");
  const seek = (t) => new Promise((res) => { v.addEventListener("seeked", () => res(), { once: true }); v.currentTime = t; setTimeout(res, 800); });
  await seek(0.1);
  const dur = v.duration, vw = v.videoWidth, vh = v.videoHeight;
  const c = document.createElement("canvas");
  c.width = 160; c.height = 90;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const means = [];
  for (let i = 0; i < 30; i++) {
    const t = Math.min(i * (dur / 90) + dur / 180, dur - 0.05);
    await seek(t);
    try { ctx.drawImage(v, 0, 0, 160, 90); } catch (e) { means.push("drawerr"); continue; }
    const { data } = ctx.getImageData(0, 0, 160, 90);
    let m = 0;
    for (let q = 0; q < data.length; q += 4) m += 0.2126 * data[q] + 0.7152 * data[q + 1] + 0.0722 * data[q + 2];
    means.push(Number((m / (160 * 90)).toFixed(1)));
  }
  return { dur, vw, vh, ready: v.readyState, means };
});
console.log(JSON.stringify(out, null, 2));
await b.close();
