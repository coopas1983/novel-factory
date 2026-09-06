const { chromium } = require('playwright');
const { loadState } = require('./auth');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: loadState('quarterfull') });
  const page = await context.newPage();
  const out = [];

  async function snap(label) {
    out.push({
      label,
      url: page.url(),
      body: (await page.locator('body').innerText()).slice(0, 26000),
      buttons: await page.evaluate(() => [...document.querySelectorAll('button')].map((e, i) => ({
        i,
        text: (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300),
        aria: e.getAttribute('aria-label'),
        title: e.getAttribute('title'),
        disabled: !!e.disabled || e.getAttribute('aria-disabled') === 'true',
        visible: !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length),
        html: e.outerHTML.slice(0, 1000)
      })).slice(0, 300))
    });
  }

  await page.goto('https://quarterfull.io/bookstore', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  const studioMatches = await page.getByText('Studio', { exact: true }).all();
  for (const m of studioMatches) {
    if (await m.isVisible()) { await m.click(); break; }
  }
  await page.waitForTimeout(1200);
  await snap('studio-before-create');

  const buttons = page.locator('button');
  let clicked = false;
  for (let i = 0; i < await buttons.count(); i++) {
    const b = buttons.nth(i);
    if (!(await b.isVisible()) || !(await b.isEnabled())) continue;
    const text = ((await b.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const aria = await b.getAttribute('aria-label');
    if (!aria && text.length <= 3) {
      await b.click({ timeout: 5000 });
      clicked = true;
      out.push({ label: 'candidate-clicked', buttonIndex: i, text, aria });
      await page.waitForTimeout(1200);
      await snap('after-candidate-click');
      break;
    }
  }
  if (!clicked) out.push({ label: 'no-create-candidate' });

  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/quarterfull-project-probe.json', JSON.stringify({ snapshots: out }, null, 2));
  console.log(JSON.stringify({ snapshots: out }, null, 2));
  await browser.close();
})().catch(err => { console.error(err); process.exit(1); });
