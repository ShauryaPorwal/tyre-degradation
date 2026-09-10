export default async function run(page, ui) {
  // capture console from BEFORE navigation completes
  const logs = [];
  page.on("console", (msg) => logs.push(`${msg.type()}: ${msg.text().slice(0, 400)}`));
  page.on("pageerror", (err) => logs.push(`PAGEERROR: ${err.message.slice(0, 600)}`));
  await page.goto("http://localhost:3000/sim", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  const probe = await page.evaluate(() => ({
    inlineScripts: document.querySelectorAll("script:not([src])").length,
    totalScripts: document.querySelectorAll("script").length,
    nextF: typeof self.__next_f,
    nextFLen: Array.isArray(self.__next_f) ? self.__next_f.length : -1,
    htmlLen: document.documentElement.outerHTML.length,
    bodyChildren: document.body.children.length,
  }));
  return { probe, logs };
}
