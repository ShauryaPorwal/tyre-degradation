/* E2E: demo race loads, live playback advances laps, provenance/stint checks. */
export default async function run(page) {
  const out = {};
  const clickBtn = (t) =>
    page.evaluate((txt) => {
      const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === txt);
      if (!b) return false;
      b.click();
      return true;
    }, t);

  for (let i = 0; i < 10; i++) {
    await clickBtn("Load demo race");
    await page.waitForTimeout(900);
    if (await page.evaluate(() => !!document.querySelector(".sim-headline"))) {
      await page.waitForTimeout(1200);
      if (await page.evaluate(() => !!document.querySelector(".sim-headline"))) break;
    }
  }
  out.loaded = await page.evaluate(() => document.querySelector(".sim-headline .sentence")?.innerText.slice(0, 120) ?? null);
  out.kpisAtLoad = await page.evaluate(() =>
    [...document.querySelectorAll(".kpi-row > *")].map((k) => k.innerText.replace(/\n/g, " | ")).slice(0, 4),
  );

  // run the race and verify the lap readout advances
  await clickBtn("Run race");
  await page.waitForTimeout(3000);
  const midLap = await page.evaluate(() => document.querySelector(".slider-readout")?.innerText ?? null);
  await page.waitForTimeout(4000);
  const laterLap = await page.evaluate(() => document.querySelector(".slider-readout")?.innerText ?? null);
  out.playback = { midLap, laterLap, advances: midLap !== laterLap };

  // scrub to the pit region (stint transition) and read the tyre panel
  await page.evaluate(() => {
    const slider = document.querySelector('input[aria-label="Scrub race laps"]');
    if (!slider) return;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(slider, "30");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(600);
  out.scrubLap30 = await page.evaluate(() => ({
    readout: document.querySelector(".slider-readout")?.innerText ?? null,
    tyre: [...document.querySelectorAll("section .card-title")].find((t) => t.textContent.includes("Tyre"))?.textContent ?? null,
    sources: [...document.querySelectorAll(".rec-lines .rec-line")].map((r) => r.innerText.replace(/\n/g, " | ")),
  }));

  return out;
}
