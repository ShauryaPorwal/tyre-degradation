import { chromium } from "patchright";
import { writeFileSync } from "node:fs";

writeFileSync("scripts/_js_test.html", `<html><body><script>window.__ran = "YES";</script></body></html>`);

const b = await chromium.launch({ headless: false });
const p = await b.newPage();

// collect ALL CDP console + runtime exceptions from the start
p.on("console", (m) => console.log("CONSOLE", m.type(), m.text().slice(0, 200)));
p.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 300)));

const cdp = await p.context().newCDPSession(p);
cdp.on("Log.entryAdded", (e) => console.log("CDPLOG", e.entry.level, e.entry.text?.slice(0, 200)));
await cdp.send("Log.enable");
await cdp.send("Runtime.enable");
cdp.on("Runtime.exceptionThrown", (e) => console.log("EXCEPTION", JSON.stringify(e.exceptionDetails).slice(0, 400)));

const fileUrl = "file:///" + process.cwd().replace(/\\/g, "/") + "/scripts/_js_test.html";
await p.goto(fileUrl);
await p.waitForTimeout(800);
console.log("file://:", await p.evaluate(() => window.__ran ?? "NOT SET"));

// check script settings via CDP
const settings = await cdp.send("Page.getNavigationHistory").catch(() => null);
const emb = await cdp.send("Emulation.setScriptExecutionDisabled", { value: false }).catch((e) => "err:" + e.message);
await p.reload();
await p.waitForTimeout(600);
console.log("after force-enable:", await p.evaluate(() => window.__ran ?? "NOT SET"), "emb:", JSON.stringify(emb));

// what does the browser think the setting is?
const cp = await cdp.send("Page.getCookies").catch(() => null);
const html = await p.content();
console.log("has script tag:", html.includes("<script"));
await b.close();
