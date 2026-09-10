import { chromium } from "patchright";
import { writeFileSync } from "node:fs";

writeFileSync("scripts/_js_test.html", `<html><body><script>window.__ran = "YES";</script></body></html>`);

// args = {} : NO custom args at all
const b = await chromium.launch({ headless: false, channel: "chrome" });
const p = await b.newPage();
const fileUrl = "file:///" + process.cwd().replace(/\\/g, "/") + "/scripts/_js_test.html";
await p.goto(fileUrl);
await p.waitForTimeout(500);
console.log("system chrome, file://:", await p.evaluate(() => window.__ran ?? "NOT SET"));
await p.goto("http://localhost:3000/sim", { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(4000);
console.log("system chrome, sim:", JSON.stringify(await p.evaluate(() => ({ nextF: typeof self.__next_f, webpack: typeof window.webpackChunk_N_E }))));
await b.close();
