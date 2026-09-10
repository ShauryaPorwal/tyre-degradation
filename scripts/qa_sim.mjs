export default async function run(page, ui) {
  const snap = await ui.snapshot();
  const m = snap.match(/@(e\d+) button "Load demo race"/);
  if (!m) return { error: "no Load demo race button", snapshot: snap };
  await ui.click(m[1]);

  // wait for playback to advance past lap 1
  try {
    await page.waitForFunction(
      () => document.body.innerText.includes("lap 2 /") || document.body.innerText.includes("lap 3 /"),
      null,
      { timeout: 15000 },
    );
  } catch (e) {
    return { error: "playback never advanced past lap 1", text: await page.evaluate(() => document.body.innerText.slice(0, 2500)) };
  }
  const during = await page.evaluate(() => document.body.innerText.slice(0, 2500));
  // let it run to the end
  try {
    await page.waitForFunction(
      () => /lap \d+ \/ \d+/.test(document.body.innerText) && !document.body.innerText.includes("❚❚"),
      null,
      { timeout: 120000 },
    );
  } catch {}
  await page.waitForTimeout(500);
  const finalText = await page.evaluate(() => document.body.innerText.slice(0, 3500));
  return { during, finalText };
}
