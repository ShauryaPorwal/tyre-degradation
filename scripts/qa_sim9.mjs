export default async function run(page, ui) {
  const t1 = await page.evaluate(() => new Promise((r) => setTimeout(() => r("timer-ok"), 80)));
  // script tag with src to a known-good static asset served by the dev server
  const viaSrc = await page.evaluate(() => {
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "/_next/static/chunks/webpack.js?v=1788693199759";
      s.onload = () => resolve("loaded:" + typeof window.webpackChunk_N_E);
      s.onerror = (e) => resolve("error");
      document.head.appendChild(s);
      setTimeout(() => resolve("timeout:" + typeof window.webpackChunk_N_E), 3000);
    });
  });
  // does main-app.js define its entry? fetch + eval manually
  const manualEval = await page.evaluate(async () => {
    const res = await fetch("/_next/static/chunks/main-app.js?v=1788693199759");
    const txt = await res.text();
    return { bytes: txt.length, starts: txt.slice(0, 80) };
  });
  return { t1, viaSrc, manualEval };
}
