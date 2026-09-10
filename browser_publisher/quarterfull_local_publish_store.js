const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = '자정 이후의 콜센터';
const PROFILE = process.env.QUARTERFULL_PROFILE_DIR || path.join(process.env.LOCALAPPDATA || '', 'NovelFactory', 'QuarterFullProfile');
const REPORT_DIR = path.join(__dirname, 'reports');
fs.mkdirSync(REPORT_DIR, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ensureTarget(page) {
  let projectsStatus = null;
  const listener = r => { if (r.url() === 'https://api.quarterfull.io/api/v1/studio-cursor/projects') projectsStatus = r.status(); };
  page.on('response', listener);
  await page.goto('https://quarterfull.io/studio-cursor', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000);
  page.off('response', listener);
  let text = await page.locator('body').innerText();
  if (projectsStatus !== 200) throw new Error(`QF_AUTH_INVALID:${projectsStatus ?? 'NO_PROJECT_RESPONSE'}`);
  if (!text.includes(TARGET)) throw new Error('TARGET_PROJECT_NOT_VISIBLE');
  if (!text.includes('작업 중: ' + TARGET)) {
    const nodes = page.getByText(TARGET, { exact: true });
    let chosen = null;
    for (let i = 0; i < await nodes.count(); i++) if (await nodes.nth(i).isVisible()) { chosen = nodes.nth(i); break; }
    if (!chosen) chosen = nodes.first();
    await chosen.click({ force: true });
    await sleep(2500);
    text = await page.locator('body').innerText();
  }
  if (!text.includes('작업 중: ' + TARGET)) throw new Error('TARGET_PROJECT_NOT_SELECTED');
}

(async () => {
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: true, args: ['--profile-directory=Default'] });
    const page = ctx.pages()[0] || await ctx.newPage();
    await ensureTarget(page);

    const button = page.locator('button[aria-label="서점에 반영하기"]');
    if (await button.count() === 0) throw new Error('STORE_APPLY_BUTTON_NOT_FOUND');
    if (!(await button.first().isVisible())) throw new Error('STORE_APPLY_BUTTON_NOT_VISIBLE');
    if (await button.first().isDisabled()) throw new Error('STORE_APPLY_BUTTON_DISABLED');

    const mutations = [];
    const listener = async r => {
      const req = r.request();
      if (req.method() === 'GET') return;
      const u = r.url();
      if (!u.includes('quarterfull.io/api/')) return;
      const rec = { method: req.method(), url: u.replace(/([?&](token|access_token|refresh_token)=)[^&]+/gi, '$1[redacted]'), status: r.status() };
      const ct = (r.headers()['content-type'] || '').toLowerCase();
      if (ct.includes('application/json')) {
        try {
          const j = await r.json();
          if (j && typeof j === 'object') rec.shape = Array.isArray(j) ? `array:${j.length}` : Object.keys(j).slice(0, 20);
        } catch {}
      }
      mutations.push(rec);
    };

    page.on('response', listener);
    await button.first().click({ force: true });
    await sleep(8000);

    const dialogs = await page.locator('[role="dialog"]').evaluateAll(nodes => nodes.filter(n => {
      const s = getComputedStyle(n); return s.visibility !== 'hidden' && s.display !== 'none';
    }).map(n => String(n.textContent || '').trim().slice(0, 1200)));

    let confirmationClicked = false;
    if (dialogs.length) {
      const candidates = ['확인', '반영하기', '서점에 반영', '출간하기', '출간'];
      for (const text of candidates) {
        const b = page.getByRole('button', { name: text, exact: true });
        for (let i = 0; i < await b.count(); i++) {
          if (await b.nth(i).isVisible().catch(() => false) && !(await b.nth(i).isDisabled().catch(() => true))) {
            await b.nth(i).click({ force: true });
            confirmationClicked = true;
            await sleep(10000);
            break;
          }
        }
        if (confirmationClicked) break;
      }
    }

    page.off('response', listener);
    const finalBody = await page.locator('body').innerText();
    const report = {
      platform: 'quarterfull',
      target: TARGET,
      action: 'STORE_APPLY_CLICKED',
      confirmationClicked,
      dialogsSeen: dialogs,
      mutations,
      successTextSeen: /완료|성공|반영되|출간되|published/i.test(finalBody),
      buttonStillVisible: await button.first().isVisible().catch(() => false)
    };
    fs.writeFileSync(path.join(REPORT_DIR, 'quarterfull-local-store-publish.json'), JSON.stringify(report, null, 2));
    console.log('QF_STORE_APPLY_ACTION_DONE');
    console.log(JSON.stringify(report));
  } finally {
    if (ctx) await ctx.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
