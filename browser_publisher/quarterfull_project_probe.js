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
      controls: await page.evaluate(() => [...document.querySelectorAll('button,a,[role="button"]')].map((e, i) => ({
        i,
        tag: e.tagName,
        text: (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
        aria: e.getAttribute('aria-label'),
        title: e.getAttribute('title'),
        testid: e.getAttribute('data-testid'),
        href: e.getAttribute('href'),
        disabled: !!e.disabled || e.getAttribute('aria-disabled') === 'true',
        visible: !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length),
        html: e.outerHTML.slice(0, 1200)
      })).filter(x => x.visible).slice(0, 400))
    });
  }

  // Direct route is more reliable than the SPA side-nav click in headless mode.
  await page.goto('https://quarterfull.io/studio-cursor', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await snap('studio-direct');

  const bodyText = await page.locator('body').innerText();
  const authenticated = bodyText.includes('내 서재') || bodyText.includes('Library') || bodyText.includes('작가 혜택') || bodyText.includes('Writer Benefits');
  out.push({ label: 'auth-check', authenticated, url: page.url() });

  // Capture author/project area for structural discovery.
  const author = page.locator('[data-testid="studio-cursor-author-profile-trigger"]');
  if (await author.count()) {
    const html = await author.first().evaluate(e => e.parentElement?.parentElement?.outerHTML || e.parentElement?.outerHTML || e.outerHTML);
    out.push({ label: 'author-area-html', html: html.slice(0, 16000) });
  }

  // Look for the known anonymous icon-only create action near Studio controls.
  const buttons = page.locator('button:visible');
  const candidates = [];
  for (let i = 0; i < await buttons.count(); i++) {
    const b = buttons.nth(i);
    if (!(await b.isEnabled())) continue;
    const text = ((await b.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const aria = await b.getAttribute('aria-label');
    const title = await b.getAttribute('title');
    const testid = await b.getAttribute('data-testid');
    if (!aria && !title && !testid && text.length > 0 && text.length <= 3) {
      candidates.push({ index: i, text, html: (await b.evaluate(e => e.outerHTML)).slice(0, 2000) });
    }
  }
  out.push({ label: 'icon-candidates', candidates });

  let target = null;
  // Earlier successful probe identified the create glyph as U+F172.
  const known = candidates.find(c => c.text === '\uf172');
  if (known) target = buttons.nth(known.index);
  else if (candidates.length === 1) target = buttons.nth(candidates[0].index);

  if (target) {
    await target.click({ timeout: 5000 });
    await page.waitForTimeout(1200);
    await snap('after-create-icon');
    const gate = page.locator('[data-testid="studio-login-gate-login"]');
    out.push({ label: 'login-gate', present: (await gate.count()) > 0, visible: (await gate.count()) ? await gate.first().isVisible() : false });
  } else {
    out.push({ label: 'create-icon-not-resolved' });
  }

  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/quarterfull-project-probe.json', JSON.stringify({ snapshots: out }, null, 2));
  console.log(JSON.stringify({ snapshots: out }, null, 2));
  await browser.close();
})().catch(err => { console.error(err); process.exit(1); });
