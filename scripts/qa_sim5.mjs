export default async function run(page, ui) {
  const logs = [];
  page.on("console", (msg) => logs.push(`${msg.type()}: ${msg.text().slice(0, 300)}`));
  page.on("pageerror", (err) => logs.push(`PAGEERROR: ${err.message.slice(0, 400)}`));

  const probe = await page.evaluate(() => {
    const scripts = [...document.querySelectorAll("script[src]")].map((s) => s.getAttribute("src"));
    return {
      nextGlobal: typeof window.next,
      flightBuf: Array.isArray(self.__next_f) ? self.__next_f.length : "none",
      scriptCount: scripts.length,
      firstScripts: scripts.slice(0, 6),
      docReadyState: document.readyState,
    };
  });
  // wait a long moment for hydration to finish, then re-probe
  await page.waitForTimeout(6000);
  const probe2 = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent === "Load demo race");
    const fk = btn ? Object.keys(btn).find((k) => k.startsWith("__reactFiber")) : null;
    return { hasFiberAfterWait: !!fk, flightBuf: Array.isArray(self.__next_f) ? self.__next_f.length : "none" };
  });
  const failedReqs = [];
  return { probe, probe2, logs: logs.slice(0, 15) };
}
