const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = '자정 이후의 콜센터';
const PROFILE = process.env.QUARTERFULL_PROFILE_DIR || path.join(process.env.LOCALAPPDATA || '', 'NovelFactory', 'QuarterFullProfile');
const REPORT_DIR = path.join(__dirname, 'reports');
fs.mkdirSync(REPORT_DIR, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ensureTarget(page) {
  await page.goto('https://quarterfull.io/studio-cursor', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000);
  const body = await page.locator('body').innerText();
  if (!body.includes(TARGET)) throw new Error('TARGET_PROJECT_NOT_VISIBLE');
  if (!body.includes('작업 중: ' + TARGET)) {
    const matches = page.getByText(TARGET, { exact: true });
    let chosen = null;
    for (let i = 0; i < await matches.count(); i++) {
      if (await matches.nth(i).isVisible()) { chosen = matches.nth(i); break; }
    }
    if (!chosen) chosen = matches.first();
    await chosen.click({ force: true });
    await sleep(2500);
  }
  if (!(await page.locator('body').innerText()).includes('작업 중: ' + TARGET)) throw new Error('TARGET_PROJECT_NOT_SELECTED');
}

async function chooseEpisode(page, label) {
  const nodes = page.getByText(label, { exact: true });
  const found = [];
  let chosen = null;
  for (let i = 0; i < await nodes.count(); i++) {
    const n = nodes.nth(i);
    const visible = await n.isVisible().catch(() => false);
    const meta = await n.evaluate(e => {
      const chain = [];
      let p = e;
      for (let k = 0; k < 6 && p; k++, p = p.parentElement) {
        chain.push({
          tag: p.tagName,
          cls: String(p.className || '').slice(0, 300),
          ariaCurrent: p.getAttribute('aria-current'),
          ariaSelected: p.getAttribute('aria-selected'),
          dataState: p.getAttribute('data-state'),
          text: String(p.textContent || '').slice(0, 500)
        });
      }
      return chain;
    });
    const chainText = meta.map(x => x.text).join(' ');
    found.push({ index: i, visible, chain: meta });
    if (!chosen && chainText.includes(`/원고(출간용)/${label}`) && visible) chosen = n;
  }
  return { chosen, found };
}

async function inspectEpisode(page, ep) {
  const label = `${ep}화`;
  const api = [];
  const listener = async r => {
    const u = r.url();
    if (!u.includes('quarterfull.io') || !u.includes('/api/')) return;
    const rec = { url: u.replace(/([?&](token|access_token|refresh_token)=)[^&]+/gi, '$1[redacted]'), status: r.status(), method: r.request().method() };
    const ct = (r.headers()['content-type'] || '').toLowerCase();
    if (ct.includes('application/json')) {
      try {
        const j = await r.json();
        if (j && typeof j === 'object') {
          rec.shape = Array.isArray(j) ? `array:${j.length}` : Object.keys(j).slice(0, 20);
        }
      } catch {}
    }
    api.push(rec);
  };

  const beforeEditors = await page.locator('div.tiptap.ProseMirror[contenteditable="true"]').count();
  const { chosen, found } = await chooseEpisode(page, label);
  if (!chosen) return { episode: ep, label, found, exists: false, beforeEditors };

  page.on('response', listener);
  await chosen.click({ force: true });
  await sleep(5000);
  page.off('response', listener);

  const editors = page.locator('div.tiptap.ProseMirror[contenteditable="true"]');
  const editorInfo = [];
  for (let i = 0; i < await editors.count(); i++) {
    const e = editors.nth(i);
    const visible = await e.isVisible().catch(() => false);
    const text = await e.innerText().catch(() => '');
    editorInfo.push({ index: i, visible, chars: text.trim().length, prefix: text.trim().slice(0, 80) });
  }

  const activeHints = await page.locator('[aria-current="true"], [aria-selected="true"], [data-state="active"], [data-state="open"]').evaluateAll(nodes => nodes.slice(0, 30).map(n => ({
    tag: n.tagName,
    cls: String(n.className || '').slice(0, 200),
    ariaCurrent: n.getAttribute('aria-current'),
    ariaSelected: n.getAttribute('aria-selected'),
    dataState: n.getAttribute('data-state'),
    text: String(n.textContent || '').slice(0, 300)
  })));

  return { episode: ep, label, exists: true, found, editorInfo, activeHints, api };
}

(async () => {
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: true, args: ['--profile-directory=Default'] });
    const page = ctx.pages()[0] || await ctx.newPage();
    await ensureTarget(page);
    const episodes = [];
    for (const ep of [2, 3]) episodes.push(await inspectEpisode(page, ep));
    const report = { mode: 'READ_ONLY_DIAGNOSE', target: TARGET, episodes };
    fs.writeFileSync(path.join(REPORT_DIR, 'quarterfull-local-diagnose.json'), JSON.stringify(report, null, 2));
    console.log('QF_LOCAL_DIAGNOSE_OK');
    console.log(JSON.stringify(report));
  } finally {
    if (ctx) await ctx.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
