import { chromium } from "patchright";

const b = await chromium.launch({ headless: false });
const p = await b.newPage();
p.on("console", (m) => console.log("CONSOLE", m.type(), m.text().slice(0, 200)));
p.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 300)));

// 1. data: URL page
await p.goto("data:text/html,<body><script>window.__x=1;console.log('DATA URL SCRIPT RAN', window.__x)</script><div id=d>hi</div></body>");
await p.waitForTimeout(800);
console.log("data-url:", await p.evaluate(() => ({ x: window.__x, d: document.getElementById("d")?.textContent })));

// 2. localhost page (dev server) minimal: check a static asset route? use the 404 page
await p.goto("http://localhost:3000/does-not-exist", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
console.log("404 page:", await p.evaluate(() => ({ nextF: typeof self.__next_f, webpack: typeof window.webpackChunk_N_E })));

await b.close();
