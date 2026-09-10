export default async function run(page, ui) {
  const logs = [];
  page.on("console", (msg) => logs.push(`${msg.type()}: ${msg.text().slice(0, 300)}`));
  page.on("pageerror", (err) => logs.push(`PAGEERROR: ${err.message.slice(0, 600)}`));
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  const home = await page.evaluate(() => ({
    nextF: typeof self.__next_f,
    webpack: typeof window.webpackChunk_N_E,
    fiber: (() => {
      const b = [...document.querySelectorAll("button, a")].find((x) => true);
      return b ? Object.keys(b).some((k) => k.startsWith("__reactFiber")) : false;
    })(),
  }));
  // and back to /sim
  await page.goto("http://localhost:3000/sim", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  const sim = await page.evaluate(() => ({
    nextF: typeof self.__next_f,
    webpack: typeof window.webpackChunk_N_E,
  }));
  return { home, sim, logs: logs.slice(0, 10) };
}
