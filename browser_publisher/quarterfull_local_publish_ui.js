const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = '자정 이후의 콜센터';
const PROFILE = path.join(process.env.LOCALAPPDATA || '', 'NovelFactory', 'QuarterFullProfile');
const WORK_ID = '0a091e56-ff71-4f3f-862b-fde86b61adb3';
const TRIGGER = fs.readFileSync(path.join(__dirname, 'quarterfull-local-publish-trigger.txt'), 'utf8').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const compact = s => String(s || '').replace(/\s+/g, '');

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

async function clickExactChapterPublic(page, ep) {
  return page.evaluate(epNum => {
    const c = s => String(s || '').replace(/\s+/g, '');
    const label = `${epNum}화`;
    const leaves = [...document.querySelectorAll('*')].filter(el => el.children.length === 0 && c(el.textContent) === label);
    const debug = [];

    for (const leaf of leaves) {
      const status = leaf.parentElement;
      if (!status) continue;
      const statusText = c(status.textContent);
      debug.push({ leafTag: leaf.tagName, statusTag: status.tagName, statusText: statusText.slice(0,120) });
      if (statusText !== `${label}비공개`) continue;

      const row = status.parentElement;
      if (!row) continue;
      const rowText = c(row.textContent);
      if (!rowText.startsWith(`${label}비공개`) || !rowText.includes('소제목저장') || !rowText.includes('공개') || rowText.length > 250) continue;

      const all = [...row.querySelectorAll('*')];
      const candidates = all.filter(el => {
        const txt = c(el.textContent);
        const aria = c(el.getAttribute('aria-label'));
        const role = c(el.getAttribute('role'));
        const style = getComputedStyle(el);
        const clickable = el.tagName === 'BUTTON' || role === 'button' || el.tabIndex >= 0 || style.cursor === 'pointer';
        const namesPublic = txt === '공개' || aria === '공개' || (txt.length <= 8 && txt.endsWith('공개'));
        const visible = style.display !== 'none' && style.visibility !== 'hidden' && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
        const disabled = el.disabled === true || el.getAttribute('aria-disabled') === 'true';
        return clickable && namesPublic && visible && !disabled;
      }).sort((a,b) => {
        const ad = a.querySelectorAll('*').length, bd = b.querySelectorAll('*').length;
        if (ad !== bd) return ad - bd;
        return c(a.textContent).length - c(b.textContent).length;
      });

      if (candidates.length !== 1) {
        return {
          ok:false,
          reason:`PUBLIC_CONTROL_COUNT_${candidates.length}`,
          rowText: rowText.slice(0,250),
          candidates: candidates.map(el => ({ tag:el.tagName, text:c(el.textContent), aria:el.getAttribute('aria-label'), role:el.getAttribute('role'), tabIndex:el.tabIndex, cursor:getComputedStyle(el).cursor })).slice(0,20),
          debug
        };
      }

      const btn = candidates[0];
      const info = { tag:btn.tagName, text:c(btn.textContent), aria:btn.getAttribute('aria-label'), role:btn.getAttribute('role'), rowText:rowText.slice(0,250) };
      btn.click();
      return { ok:true, clicked:info };
    }

    return { ok:false, reason:'EXACT_CHAPTER_CARD_NOT_FOUND', debug };
  }, ep);
}

async function confirmIfNeeded(page) {
  await sleep(900);
  const clicked = await page.evaluate(() => {
    const c = s => String(s || '').replace(/\s+/g, '');
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(d => {
      const r=d.getBoundingClientRect(), s=getComputedStyle(d);
      return s.display!=='none' && s.visibility!=='hidden' && r.width>0 && r.height>0;
    });
    if (!dialogs.length) return { found:false };
    const d = dialogs[dialogs.length-1];
    const text = c(d.textContent);
    if (!/공개|출간/.test(text)) return { found:true, text:text.slice(0,500), clicked:false };
    const candidates = [...d.querySelectorAll('*')].filter(el => {
      const t=c(el.textContent), a=c(el.getAttribute('aria-label')), role=c(el.getAttribute('role'));
      const s=getComputedStyle(el), r=el.getBoundingClientRect();
      const clickable=el.tagName==='BUTTON'||role==='button'||el.tabIndex>=0||s.cursor==='pointer';
      const name=['공개','확인','출간'].includes(t)||['공개','확인','출간'].includes(a);
      return clickable&&name&&s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0&&el.disabled!==true&&el.getAttribute('aria-disabled')!=='true';
    }).sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length);
    if (candidates.length!==1) return { found:true, text:text.slice(0,500), clicked:false, candidateCount:candidates.length, candidates:candidates.map(x=>({tag:x.tagName,text:c(x.textContent),aria:x.getAttribute('aria-label'),role:x.getAttribute('role')})).slice(0,20) };
    const b=candidates[0]; b.click();
    return { found:true, clicked:true, control:{tag:b.tagName,text:c(b.textContent),aria:b.getAttribute('aria-label'),role:b.getAttribute('role')} };
  });
  return clicked;
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
    await page.setViewportSize({width:1440,height:1200});
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

      const click = await clickExactChapterPublic(page, ep);
      console.log('QF_EXACT_CARD_CLICK', JSON.stringify({ep, click}));
      if (!click.ok) throw new Error(`${click.reason}:${ep}`);
      const confirm = await confirmIfNeeded(page);
      console.log('QF_CONFIRM_STATE', JSON.stringify({ep, confirm}));

      let confirmed = null;
      for (let k=0; k<22; k++) {
        await sleep(700);
        s = await getSummaries(page);
        const c = s.find(x => x.title === `${ep}화`);
        if (c?.is_published) { confirmed = c; break; }
      }
      if (!confirmed) {
        const body = compact(await page.locator('body').innerText().catch(() => '')).slice(-4000);
        console.log('QF_UI_PUBLISH_DEBUG', JSON.stringify({ ep, body, requests: requests.slice(-40) }));
        throw new Error(`UI_PUBLISH_NOT_CONFIRMED:${ep}`);
      }
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
      requests: requests.slice(-40)
    }));
  } finally { await ctx.close(); }
})().catch(e => { console.error(e); process.exit(1); });
