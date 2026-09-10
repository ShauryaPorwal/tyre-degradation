export default async function run(page, ui) {
  // capture console + page errors ourselves
  const logs = [];
  page.on("console", (msg) => logs.push(`${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => logs.push(`PAGEERROR: ${err.message}\n${err.stack?.slice(0, 1200)}`));

  const snap = await ui.snapshot();
  const m = snap.match(/@(e\d+) button "Load demo race"/);
  if (!m) return { error: "no button", snap };
  const before = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll("button")].map((b) => b.textContent),
  }));
  await ui.click(m[1]);
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() => document.body.innerText.slice(0, 1500));
  return { before, after, logs };
}
