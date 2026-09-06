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
      body: (await page.locator('body').innerText()).slice(0, 24000),
      controls: await page.evaluate(() => [...document.querySelectorAll('button,a,input,textarea,[role=button]')].map((e, i) => ({
        i,
        tag: e.tagName.toLowerCase(),
        text: (e.innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 300),
        href: e.getAttribute('href'),
        aria: e.getAttribute('aria-label'),
        placeholder: e.getAttribute('placeholder'),
        disabled: !!e.disabled || e.getAttribute('aria-disabled') === 'true',
        visible: !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length)
      })).slice(0, 500))
    });
  }

  async function clickVisibleText(name) {
    const matches = await page.getByText(name, { exact: true }).all();
    for (const m of matches) {
      if (await m.isVisible()) {
        await m.click({ timeout: 5000 });
        return true;
      }
    }
    return false;
  }

  await page.goto('https://quarterfull.io/studio-cursor', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  await snap('studio-home');

  for (const name of ['Library', 'Bookstore', 'Studio']) {
    try {
      if (await clickVisibleText(name)) {
        await page.waitForTimeout(1200);
        await snap(name.toLowerCase());
      } else {
        out.push({ label: `${name.toLowerCase()}-not-visible`, url: page.url() });
      }
    } catch (err) {
      out.push({ label: `${name.toLowerCase()}-error`, url: page.url(), error: String(err) });
    }
  }

  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/quarterfull-project-probe.json', JSON.stringify({ snapshots: out }, null, 2));
  console.log(JSON.stringify({ snapshots: out }, null, 2));
  await browser.close();
})().catch(err => { console.error(err); process.exit(1); });
