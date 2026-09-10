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
    const body = await page.locator('body').innerText();
    if (!body.includes(TARGET)) throw new Error('TARGET_PROJECT_NOT_VISIBLE');

    const targetText = page.getByText(TARGET, { exact: true });
    let targetCard = null;
    for (let i = 0; i < await targetText.count(); i++) {
      const n = targetText.nth(i);
      if (!(await n.isVisible().catch(() => false))) continue;
      const card = n.locator('xpath=ancestor::div[.//button[@aria-label="관리"]][1]');
      if (await card.count()) { targetCard = card.first(); break; }
    }
    if (!targetCard) {
      const cards = page.locator('div').filter({ hasText: TARGET }).filter({ has: page.locator('button[aria-label="관리"]') });
      if (await cards.count()) targetCard = cards.last();
    }
    if (!targetCard) throw new Error('TARGET_MANAGE_CARD_NOT_FOUND');

    const cardText = (await targetCard.innerText()).trim();
    const manage = targetCard.locator('button[aria-label="관리"]').first();
    if (!(await manage.isVisible().catch(() => false))) throw new Error('TARGET_MANAGE_BUTTON_NOT_VISIBLE');

    const responses = [];
    page.on('response', r => {
      try {
        const u = r.url();
        if (!u.includes('quarterfull.io/api/')) return;
        if (!/(publish|episode|book|work|series|store|chapter|manuscript|project)/i.test(u)) return;
        responses.push({ method: r.request().method(), url: u.replace(/([?&](token|access_token|refresh_token)=)[^&]+/gi, '$1[redacted]'), status: r.status() });
      } catch {}
    });

    await manage.click({ force: true });
    await sleep(8000);

    const finalUrl = page.url();
    const finalBody = await page.locator('body').innerText();
    const visibleButtons = await page.locator('button').evaluateAll(btns => btns.map((b, i) => {
      const s = getComputedStyle(b);
      if (s.display === 'none' || s.visibility === 'hidden') return null;
      const text = String(b.textContent || '').trim();
      const ariaLabel = b.getAttribute('aria-label');
      if (!text && !ariaLabel) return null;
      return { index: i, text: text.slice(0, 300), ariaLabel, disabled: !!b.disabled, ariaDisabled: b.getAttribute('aria-disabled') };
    }).filter(Boolean).slice(0, 250));
    const interestingLines = finalBody.split(/\r?\n/).map(s => s.trim()).filter(Boolean).filter(s => /자정 이후|\d+화|출간|공개|비공개|관리|회차|연재|서점|반영|상태|예약/i.test(s)).slice(0, 400);

    const report = { platform: 'quarterfull', target: TARGET, mode: 'MANAGE_READ_ONLY_DIAGNOSE', cardText, finalUrl, visibleButtons, interestingLines, responses: responses.slice(-200) };
    fs.writeFileSync(path.join(REPORT_DIR, 'quarterfull-local-manage-diagnose.json'), JSON.stringify(report, null, 2));
    console.log('QF_MANAGE_DIAGNOSE_OK');
    console.log(JSON.stringify(report));
  } finally {
    if (ctx) await ctx.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
