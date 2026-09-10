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
    const responses = [];
    page.on('response', async r => {
      try {
        const u = r.url();
        if (!u.includes('quarterfull.io/api/')) return;
        if (r.request().method() !== 'GET') return;
        if (!/(project|store|book|publish|manuscript|file|workspace|studio-cursor)/i.test(u)) return;
        responses.push({ method: 'GET', url: u.replace(/([?&](token|access_token|refresh_token)=)[^&]+/gi, '$1[redacted]'), status: r.status() });
      } catch {}
    });

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
      body = await page.locator('body').innerText();
    }
    if (!body.includes('작업 중: ' + TARGET)) throw new Error('TARGET_PROJECT_NOT_SELECTED');

    const button = page.locator('button[aria-label="서점에 반영하기"]').first();
    const count = await page.locator('button[aria-label="서점에 반영하기"]').count();
    let buttonInfo = { count };
    if (count) {
      buttonInfo = await button.evaluate(el => {
        const attrs = {};
        for (const a of el.attributes) attrs[a.name] = a.value;
        const chain = [];
        let p = el;
        for (let i = 0; i < 5 && p; i++, p = p.parentElement) {
          chain.push({ tag: p.tagName, text: String(p.textContent || '').trim().slice(0, 1500), attrs: { role: p.getAttribute('role'), title: p.getAttribute('title'), ariaLabel: p.getAttribute('aria-label'), ariaDisabled: p.getAttribute('aria-disabled') } });
        }
        return { disabled: !!el.disabled, attrs, text: String(el.textContent || '').trim(), chain };
      });
      buttonInfo.visible = await button.isVisible().catch(() => false);
    }

    const visibleButtons = await page.locator('button').evaluateAll(btns => btns.map((b, i) => {
      const s = getComputedStyle(b);
      if (s.display === 'none' || s.visibility === 'hidden') return null;
      const txt = String(b.textContent || '').trim();
      const aria = b.getAttribute('aria-label');
      if (!txt && !aria) return null;
      return { index: i, text: txt.slice(0, 250), ariaLabel: aria, disabled: !!b.disabled, ariaDisabled: b.getAttribute('aria-disabled'), title: b.getAttribute('title') };
    }).filter(Boolean).slice(0, 200));

    const interestingLines = body.split(/\r?\n/).map(s => s.trim()).filter(Boolean).filter(s => /서점|반영|출간|공개|저장|동기|변경|원고|검수|준비|승인|책|프로젝트/i.test(s)).slice(0, 250);

    const storageKeys = await page.evaluate(() => ({
      localStorageKeys: Object.keys(localStorage),
      sessionStorageKeys: Object.keys(sessionStorage)
    }));

    const report = {
      platform: 'quarterfull',
      target: TARGET,
      mode: 'STORE_BUTTON_READ_ONLY_DIAGNOSE',
      buttonInfo,
      visibleButtons,
      interestingLines,
      storageKeys,
      responses: responses.slice(-150)
    };
    fs.writeFileSync(path.join(REPORT_DIR, 'quarterfull-local-store-diagnose.json'), JSON.stringify(report, null, 2));
    console.log('QF_STORE_DIAGNOSE_OK');
    console.log(JSON.stringify(report));
  } finally {
    if (ctx) await ctx.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
