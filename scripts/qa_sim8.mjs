export default async function run(page, ui) {
  const logs = [];
  page.on("console", (msg) => logs.push(`${msg.type()}: ${msg.text().slice(0, 300)}`));
  page.on("pageerror", (err) => logs.push(`PAGEERROR: ${err.message.slice(0, 600)}`));
  await page.goto("http://localhost:3000/sim", { waitUntil: "networkidle", timeout: 60000 });

  const respHeaders = {};
  const onResp = (r) => { if (r.url().includes("/sim")) Object.assign(respHeaders, r.headers()); };
  page.on("response", onResp);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const probe = await page.evaluate(() => ({
    webpack: typeof window.webpackChunk_N_E,
    webpackNext: typeof window.webpackChunk,
    swController: !!navigator.serviceWorker?.controller,
    inlineExec: (() => {
      try {
        const s = document.createElement("script");
        s.textContent = "window.__ok2 = 42;";
        document.body.appendChild(s);
        return window.__ok2 === 42;
      } catch (e) { return "err:" + e.message; }
    })(),
  }));
  return { probe, respHeaders, logs: logs.slice(0, 12) };
}
