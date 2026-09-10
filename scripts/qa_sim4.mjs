export default async function run(page, ui) {
  const logs = [];
  page.on("console", (msg) => logs.push(`${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => logs.push(`PAGEERROR: ${err.message}`));

  const probe = await page.evaluate(() => {
    const root = document.querySelector("__next") || document.body.firstElementChild;
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent === "Structured data");
    const fiberKey = btn ? Object.keys(btn).find((k) => k.startsWith("__reactFiber")) : null;
    const propsKey = btn ? Object.keys(btn).find((k) => k.startsWith("__reactProps")) : null;
    return {
      rootTag: root?.tagName,
      hasFiber: !!fiberKey,
      hasProps: !!propsKey,
      hasOnClick: propsKey ? typeof btn[propsKey].onClick : "no props key",
    };
  });

  // click the Structured data tab via React-friendly click
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent === "Structured data");
    btn.click();
  });
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({
    hasTextarea: !!document.querySelector("textarea"),
    text: document.body.innerText.slice(0, 300),
  }));
  return { probe, after, logs: logs.slice(0, 8) };
}
