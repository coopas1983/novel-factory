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

  await page.goto('https://quarterfull.io/bookstore', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  const studio = page.locator('[data-testid="personal-canary-side-nav-newStudio"]');
  if (await studio.count() && await studio.first().isVisible()) await studio.first().click();
  else {
    const matches = await page.getByText('Studio', { exact: true }).all();
    for (const m of matches) if (await m.isVisible()) { await m.click(); break; }
  }
  await page.waitForTimeout(1800);
  await snap('studio-authenticated');

  // The previously discovered create/start icon is the unique enabled icon-only
  // button beside the author/project controls. Locate it by structure rather than
  // by raw DOM index, which changes between renders.
  const author = page.locator('[data-testid="studio-cursor-author-profile-trigger"]');
  if (await author.count()) {
    const parent = author.first().locator('xpath=..');
    out.push({ label: 'author-parent-html', html: (await parent.evaluate(e => e.parentElement?.outerHTML || e.outerHTML)).slice(0, 12000) });
  }

  const iconCandidates = page.locator('button:visible');
  const candidates = [];
  for (let i = 0; i < await iconCandidates.count(); i++) {
    const b = iconCandidates.nth(i);
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

  // Prefer the known glyph from the earlier successful discovery; fall back only
  // when there is exactly one anonymous icon candidate.
  let target = null;
  for (const c of candidates) if (c.text === '\uf172') { target = iconCandidates.nth(c.index); break; }
  if (!target && candidates.length === 1) target = iconCandidates.nth(candidates[0].index);

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
