/* End-to-end QA of the Live Simulation pipeline against localhost:3000/sim.
   Run: node skills/browser-automation/browser.mjs http://localhost:3000/sim --script scripts/qa_partial.mjs */
const clickBtn = (page, text) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === t);
    if (!b) return false;
    b.click();
    return true;
  }, text);

const setBox = (page, value) =>
  page.evaluate((v) => {
    const el = document.querySelector(".paste-box");
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, value);

export default async function run(page) {
  const out = {};
  const grab = () =>
    page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      return {
        headline: q(".sim-headline .sentence")?.innerText ?? null,
        tyreCard: [...document.querySelectorAll("section .card-title")].find((t) => t.textContent.includes("Tyre"))?.textContent ?? null,
        recLines: [...document.querySelectorAll(".rec-lines .rec-line")].map((r) => r.innerText.replace(/\n/g, " | ")),
        kpis: [...document.querySelectorAll(".kpi-row > *")].map((k) => k.innerText.replace(/\n/g, " | ")).slice(0, 4),
        strategy: [...document.querySelectorAll("section .card-title")].find((t) => t.textContent.trim() === "Strategy")?.parentElement?.parentElement?.innerText.replace(/\n/g, " | ") ?? null,
      };
    });

  // wait for hydration: try clicking the tab until the paste-box appears and stays
  for (let i = 0; i < 12; i++) {
    await clickBtn(page, "Structured data");
    await page.waitForTimeout(1000);
    if (await page.evaluate(() => !!document.querySelector(".paste-box"))) {
      await page.waitForTimeout(1200);
      if (await page.evaluate(() => !!document.querySelector(".paste-box"))) break;
    }
  }
  out.tabOpened = await page.evaluate(() => !!document.querySelector(".paste-box"));

  // 1a. partial input: lap + time + fuel only (no compound, no tyre age)
  await setBox(page, "lap,lap_time_s,fuel_kg\n1,80.5,105\n2,80.4,103.4\n3,80.6,101.7");
  await clickBtn(page, "Analyse");
  await page.waitForTimeout(500);
  out.partialNoCompound = await page.evaluate(() => document.querySelector(".e-head, .empty-state")?.innerText ?? null);

  // 1b. partial input WITH compound but NO tyre_age column
  await setBox(page, "lap,lap_time_s,compound,fuel_kg\n1,80.5,MEDIUM,105\n2,80.4,MEDIUM,103.4\n3,80.6,MEDIUM,101.7\n4,80.55,MEDIUM,100.1\n5,80.62,MEDIUM,98.4\n6,80.58,MEDIUM,96.8\n7,80.70,MEDIUM,95.1\n8,80.66,MEDIUM,93.5");
  await clickBtn(page, "Analyse");
  await page.waitForTimeout(700);
  out.partialWithCompound = {
    warnings: await page.evaluate(() => document.querySelector(".note")?.innerText ?? null),
    ...(await grab()),
  };

  // 1c. complete input with pit stop mid-race (tyre age resets)
  // The ingest screen was replaced by the analysis view after 1b — go back in.
  const dbg = [];
  for (let i = 0; i < 8; i++) {
    dbg.push(await clickBtn(page, "Change data"));
    await page.waitForTimeout(800);
    dbg.push(await clickBtn(page, "Structured data"));
    await page.waitForTimeout(800);
    if (await page.evaluate(() => !!document.querySelector(".paste-box"))) {
      dbg.push("box-open");
      break;
    }
    dbg.push(await page.evaluate(() => document.body.innerText.slice(0, 80)));
  }
  out.reopenDebug = dbg;
  await setBox(page,
    "lap,lap_time_s,compound,tyre_age,fuel_kg,pit_in,pit_out\n" +
      Array.from({ length: 12 }, (_, i) => {
        const lap = i + 1;
        if (lap <= 6) return `${lap},${(80.3 + i * 0.07).toFixed(2)},MEDIUM,${i},${(105 - i * 1.65).toFixed(1)},false,false`;
        if (lap === 7) return `7,103.9,MEDIUM,6,94.2,true,false`;
        if (lap === 8) return `8,82.6,HARD,0,92.6,false,true`;
        return `${lap},${(80.4 + (lap - 8) * 0.04).toFixed(2)},HARD,${lap - 8},${(92.6 - (lap - 8) * 1.65).toFixed(1)},false,false`;
      }).join("\n"),
  );
  await clickBtn(page, "Analyse");
  await page.waitForTimeout(700);
  out.completeWithPit = await grab();

  return out;
}
