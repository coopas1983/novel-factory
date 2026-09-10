const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = '자정 이후의 콜센터';
const PROFILE = path.join(process.env.LOCALAPPDATA || '', 'NovelFactory', 'QuarterFullProfile');
const WORK_ID = '0a091e56-ff71-4f3f-862b-fde86b61adb3';
const TRIGGER = fs.readFileSync(path.join(__dirname, 'quarterfull-local-publish-trigger.txt'), 'utf8').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseEpisodes(s) {
  let m = s.match(/episodes?\s+(\d+)\s*-\s*(\d+)/i);
  if (m) { const a=[]; for(let n=+m[1]; n<=+m[2]; n++) a.push(n); return a; }
  m = s.match(/episode\s+(\d+)/i);
  if (m) return [+m[1]];
  throw new Error('TRIGGER_INVALID');
}

async function getSummaries(page) {
  return page.evaluate(async workId => {
    const t = localStorage.getItem('cravi_access_token');
    if (!t) throw new Error('NO_ACCESS_TOKEN');
    const r = await fetch(`https://api.quarterfull.io/api/v1/studio/works/${workId}/chapter-summaries?_t=${Date.now()}`, {
      headers: { Authorization: t.startsWith('Bearer ') ? t : `Bearer ${t}` }
    });
    if (!r.ok) throw new Error(`SUMMARIES_${r.status}`);
    const j = await r.json();
    return Array.isArray(j) ? j : (j.chapters || j.items || j.data || []);
  }, WORK_ID);
}

async function targetManageCard(page) {
  const nodes = page.getByText(TARGET, { exact: true });
  for (let i=0; i<await nodes.count(); i++) {
    const n = nodes.nth(i);
    if (!(await n.isVisible().catch(() => false))) continue;
    const card = n.locator('xpath=ancestor::div[.//button[@aria-label="관리"]][1]');
    if (await card.count()) return card.first();
  }
  return null;
}

async function chapterRow(page, ep) {
  const label = `${ep}화`;
  const nodes = page.getByText(label, { exact: true });
  let best = null, bestLen = Infinity;
  for (let i=0; i<await nodes.count(); i++) {
    const n = nodes.nth(i);
    if (!(await n.isVisible().catch(() => false))) continue;
    let p = n;
    for (let k=0; k<9; k++) {
      p = p.locator('xpath=..');
      if (!(await p.count())) break;
      const text = (await p.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      if (!text.includes(label) || !text.includes('비공개')) continue;
      const btns = p.locator('button');
      let has = false;
      for (let j=0; j<await btns.count(); j++) {
        const b = btns.nth(j);
        const t = (await b.innerText().catch(() => '')).trim();
        const a = await b.getAttribute('aria-label');
        if ((t === '공개' || a === '공개') && await b.isVisible().catch(() => false) && !(await b.isDisabled().catch(() => true))) { has = true; break; }
      }
      if (has && text.length < bestLen) { best = p; bestLen = text.length; }
    }
  }
  return best;
}

async function publicButton(row) {
  const btns = row.locator('button');
  for (let j=0; j<await btns.count(); j++) {
    const b = btns.nth(j);
    const t = (await b.innerText().catch(() => '')).trim();
    const a = await b.getAttribute('aria-label');
    if ((t === '공개' || a === '공개') && await b.isVisible().catch(() => false) && !(await b.isDisabled().catch(() => true))) return b;
  }
  return null;
}

async function confirmIfNeeded(page) {
  await sleep(700);
  const dialogs = page.locator('[role="dialog"]:visible');
  if (!(await dialogs.count())) return;
  const d = dialogs.last();
  const text = (await d.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  if (!/공개|출간/.test(text)) return;
  const btns = d.locator('button');
  for (let j=0; j<await btns.count(); j++) {
    const b = btns.nth(j);
    const t = (await b.innerText().catch(() => '')).trim();
    const a = await b.getAttribute('aria-label');
    const isConfirm = ['공개','확인','출간'].includes(t) || ['공개','확인','출간'].includes(a);
    const enabled = await b.isVisible().catch(() => false) && !(await b.isDisabled().catch(() => true));
    if (isConfirm && enabled) { await b.click(); return; }
  }
}

(async () => {
  const eps = parseEpisodes(TRIGGER);
  if (eps.some(x => x < 2 || x > 10)) throw new Error('EP_RANGE_INVALID');
  const ctx = await chromium.launchPersistentContext(PROFILE, { channel:'chrome', headless:true, args:['--profile-directory=Default'] });
  try {
    const page = ctx.pages()[0] || await ctx.newPage();
    const requests = [];
    page.on('request', r => {
      if (/quarterfull\.io\/api\//.test(r.url()) && /(chapter|publish|bookstore)/i.test(r.url())) {
        requests.push({ method:r.method(), url:r.url(), postData:r.postData() });
      }
    });
    await page.goto('https://quarterfull.io/studio-cursor', { waitUntil:'domcontentloaded', timeout:60000 });
    await sleep(6000);
    if (!(await page.locator('body').innerText()).includes(TARGET)) throw new Error('TARGET_NOT_VISIBLE');
    const card = await targetManageCard(page);
    if (!card) throw new Error('TARGET_MANAGE_NOT_FOUND');
    await card.locator('button[aria-label="관리"]').first().click({ force:true });
    await sleep(5000);
    const tab = page.getByRole('button', { name:'회차 관리', exact:true });
    if (!(await tab.isVisible().catch(() => false))) throw new Error('CHAPTER_TAB_NOT_VISIBLE');
    await tab.click({ force:true });
    await sleep(4000);

    const results = [];
    for (const ep of eps) {
      let s = await getSummaries(page);
      if (s.length !== 10) throw new Error(`EXPECTED_10_CHAPTERS:${s.length}`);
      const prev = s.find(x => x.title === `${ep-1}화`);
      const cur = s.find(x => x.title === `${ep}화`);
      if (!cur) throw new Error(`CHAPTER_NOT_FOUND:${ep}`);
      if (!prev?.is_published) throw new Error(`PREVIOUS_NOT_PUBLIC:${ep-1}`);
      if (cur.is_published) { results.push({ episode:ep, status:'ALREADY_PUBLISHED' }); continue; }

      const row = await chapterRow(page, ep);
      if (!row) throw new Error(`EXACT_PUBLIC_ROW_NOT_FOUND:${ep}`);
      const rowText = (await row.innerText()).replace(/\s+/g, ' ').trim();
      if (!rowText.includes(`${ep}화`) || !rowText.includes('비공개') || rowText.length > 800) throw new Error(`ROW_SAFETY_FAIL:${ep}:${rowText.slice(0,200)}`);
      const pub = await publicButton(row);
      if (!pub) throw new Error(`PUBLIC_BUTTON_MISSING:${ep}`);
      await pub.click();
      await confirmIfNeeded(page);

      let confirmed = null;
      for (let k=0; k<18; k++) {
        await sleep(700);
        s = await getSummaries(page);
        const c = s.find(x => x.title === `${ep}화`);
        if (c?.is_published) { confirmed = c; break; }
      }
      if (!confirmed) throw new Error(`UI_PUBLISH_NOT_CONFIRMED:${ep}`);
      results.push({ episode:ep, status:'PUBLISHED_CONFIRMED', published_at:confirmed.published_at || null });
      await sleep(700);
    }

    const final = await getSummaries(page);
    console.log('QF_UI_PUBLISH_OK');
    console.log(JSON.stringify({
      results,
      publicCount: final.filter(x => x.is_published).length,
      total: final.length,
      chapters: final.map(x => ({ title:x.title, is_published:x.is_published, published_at:x.published_at || null })),
      requests: requests.slice(-30)
    }));
  } finally { await ctx.close(); }
})().catch(e => { console.error(e); process.exit(1); });
