export default async function run(page, ui) {
  const logs = [];
  page.on("console", (msg) => logs.push(`${msg.type()}: ${msg.text().slice(0, 300)}`));
  page.on("pageerror", (err) => logs.push(`PAGEERROR: ${err.message.slice(0, 600)}`));
  await page.goto("http://localhost:3000/sim", { waitUntil: "domcontentloaded", timeout: 60000 });
  // try executing a trivial inline script to see if CSP blocks it
  const cspProbe = await page.evaluate(() => {
    return new Promise((resolve) => {
      try {
        const s = document.createElement("script");
        s.textContent = `window.__inlineOk = true;`;
        document.head.appendChild(s);
        setTimeout(() => resolve({ inlineExec: window.__inlineOk === true, cspHeader: null }), 500);
      } catch (e) {
        resolve({ inlineExec: false, err: String(e) });
      }
    });
  });
  const cspMeta = await page.evaluate(() => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return meta ? meta.content : null;
  });
  // check for CSP violations reported
  const firstInline = await page.evaluate(() => {
    const s = [...document.querySelectorAll("script:not([src])")][0];
    return s ? s.textContent.slice(0, 200) : null;
  });
  return { cspProbe, cspMeta, firstInline, logs };
}
