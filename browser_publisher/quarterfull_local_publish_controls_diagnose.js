const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = '자정 이후의 콜센터';
const PROFILE = process.env.QUARTERFULL_PROFILE_DIR || path.join(process.env.LOCALAPPDATA || '', 'NovelFactory', 'QuarterFullProfile');
const REPORT_DIR = path.join(__dirname, 'reports');
fs.mkdirSync(REPORT_DIR, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: true, args: ['--profile-directory=Default'] });
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto('https://quarterfull.io/studio-cursor', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(7000);
    let body = await page.locator('body').innerText();
    if (!body.includes(TARGET)) throw new Error('TARGET_PROJECT_NOT_VISIBLE');
    if (!body.includes('작업 중: ' + TARGET)) {
      const nodes = page.getByText(TARGET, { exact: true });
      let chosen = null;
      for (let i = 0; i < await nodes.count(); i++) if (await nodes.nth(i).isVisible().catch(() => false)) { chosen = nodes.nth(i); break; }
      if (!chosen) chosen = nodes.first();
      await chosen.click({ force: true });
      await sleep(3000);
    }

    const publishButtons = await page.locator('button').evaluateAll(btns => btns.map((b, idx) => {
      const aria = b.getAttribute('aria-label');
      const txt = String(b.textContent || '').trim();
      if (!(aria === '출간' || txt === '출간')) return null;
      const s = getComputedStyle(b);
      if (s.display === 'none' || s.visibility === 'hidden') return null;
      const chain = [];
      let p = b;
      for (let i = 0; i < 8 && p; i++, p = p.parentElement) {
        chain.push({
          tag: p.tagName,
          text: String(p.textContent || '').trim().slice(0, 2500),
          role: p.getAttribute('role'),
          ariaLabel: p.getAttribute('aria-label'),
          dataState: p.getAttribute('data-state'),
          href: p.getAttribute('href'),
          cls: String(p.className || '').slice(0, 500)
        });
      }
      return { index: idx, text: txt, ariaLabel: aria, disabled: !!b.disabled, ariaDisabled: b.getAttribute('aria-disabled'), chain };
    }).filter(Boolean));

    const episodeButtons = await page.locator('button').evaluateAll(btns => btns.map((b, idx) => {
      const txt = String(b.textContent || '').trim();
      const m = txt.match(new RegExp('^' + '자정 이후의 콜센터' + ' · (\\d+)화'));
      if (!m) return null;
      const chain = [];
      let p = b;
      for (let i = 0; i < 6 && p; i++, p = p.parentElement) chain.push({ tag: p.tagName, text: String(p.textContent || '').trim().slice(0, 1800), ariaLabel: p.getAttribute('aria-label'), role: p.getAttribute('role') });
      return { index: idx, episode: Number(m[1]), text: txt, chain };
    }).filter(Boolean));

    const textHits = await page.locator('body').evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      return all.map((el, idx) => {
        const t = String(el.textContent || '').trim();
        if (!/회차 출간 안내|출간 대기|출간됨|공개됨|미출간|출간/.test(t)) return null;
        if (t.length > 800) return null;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') return null;
        return { idx, tag: el.tagName, text: t, ariaLabel: el.getAttribute('aria-label'), role: el.getAttribute('role') };
      }).filter(Boolean).slice(0, 200);
    });

    const report = { platform: 'quarterfull', target: TARGET, mode: 'PUBLISH_CONTROLS_READ_ONLY', publishButtons, episodeButtons, textHits };
    fs.writeFileSync(path.join(REPORT_DIR, 'quarterfull-local-publish-controls-diagnose.json'), JSON.stringify(report, null, 2));
    console.log('QF_PUBLISH_CONTROLS_DIAGNOSE_OK');
    console.log(JSON.stringify(report));
  } finally {
    if (ctx) await ctx.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
