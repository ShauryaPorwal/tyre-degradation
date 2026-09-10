import { chromium } from "patchright";
import { writeFileSync } from "node:fs";

writeFileSync("scripts/_js_test.html", `<html><body><script>window.__ran = "YES";</script><div id=d>x</div></body></html>`);

const b = await chromium.launch({ headless: false });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 200)));

const fileUrl = "file:///" + process.cwd().replace(/\\/g, "/") + "/scripts/_js_test.html";
await p.goto(fileUrl);
await p.waitForTimeout(400);
console.log("file://:", await p.evaluate(() => window.__ran ?? "NOT SET"));

await p.goto("http://127.0.0.1:3000/sim", { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(3000);
console.log("http://127.0.0.1:3000:", await p.evaluate(() => ({ nextF: typeof self.__next_f, webpack: typeof window.webpackChunk_N_E })));

await b.close();
