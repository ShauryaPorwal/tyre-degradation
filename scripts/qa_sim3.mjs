export default async function run(page, ui) {
  const logs = [];
  page.on("console", (msg) => logs.push(`${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => logs.push(`PAGEERROR: ${err.message}\n${err.stack?.slice(0, 2000)}`));

  // bypass React synthetic events: dispatch a real native click
  const r = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent === "Load demo race");
    if (!btn) return { error: "no button" };
    let calls = 0;
    // instrument: count React's onClick firing via getEventListeners is not available; use a capture listener
    btn.addEventListener("click", () => calls++, { capture: true });
    btn.click();
    return { clicked: true, nativeCalls: calls };
  });
  await page.waitForTimeout(4000);
  const after = await page.evaluate(() => document.body.innerText.slice(0, 600));
  return { r, after: after.slice(0, 400), logs: logs.slice(0, 10) };
}
