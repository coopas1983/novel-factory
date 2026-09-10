const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = '자정 이후의 콜센터';
const PROFILE = process.env.QUARTERFULL_PROFILE_DIR || path.join(process.env.LOCALAPPDATA || '', 'NovelFactory', 'QuarterFullProfile');
const REPORT_DIR = path.join(__dirname, 'reports');
fs.mkdirSync(REPORT_DIR, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

function sanitizeChapterData(x, depth = 0) {
  if (depth > 5 || x == null) return x;
  if (Array.isArray(x)) return x.slice(0, 50).map(v => sanitizeChapterData(v, depth + 1));
  if (typeof x !== 'object') return (typeof x === 'string' && x.length > 500) ? x.slice(0, 500) : x;
  const out = {};
  const allowed = /^(id|chapter_id|work_id|title|name|episode|episode_no|episode_number|chapter|chapter_no|chapter_number|number|order|sequence|status|publication_status|publish_status|is_public|published|is_published|published_at|publication_at|released_at|created_at|updated_at|path|file_path|source_path|slug|visibility|public|private|draft|revision|version)$/i;
  for (const [k, v] of Object.entries(x)) {
    if (allowed.test(k)) out[k] = sanitizeChapterData(v, depth + 1);
    else if (depth < 2 && v && typeof v === 'object' && (Array.isArray(v) || /chapter|episode|publication|summary|data|item|result/i.test(k))) {
      out[k] = sanitizeChapterData(v, depth + 1);
    }
  }
  return out;
}

(async () => {
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: true, args: ['--profile-directory=Default'] });
    const page = ctx.pages()[0] || await ctx.newPage();

    let chapterSummaries = null;
    const network = [];
    page.on('response', async r => {
      try {
        const u = r.url();
        if (!u.includes('quarterfull.io/api/')) return;
        if (!/(chapter|bookstore|publish|work)/i.test(u)) return;
        network.push({ method: r.request().method(), url: u.replace(/([?&](token|access_token|refresh_token)=)[^&]+/gi, '$1[redacted]'), status: r.status() });
        if (r.status() === 200 && /\/chapter-summaries(?:\?|$)/.test(u)) {
          const j = await r.json().catch(() => null);
          if (j) chapterSummaries = sanitizeChapterData(j);
        }
      } catch {}
    });

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
    if (!targetCard) throw new Error('TARGET_MANAGE_CARD_NOT_FOUND');
    await targetCard.locator('button[aria-label="관리"]').first().click({ force: true });
    await sleep(6000);

    const chapterTab = page.getByRole('button', { name: '회차 관리', exact: true });
    if (!(await chapterTab.isVisible().catch(() => false))) throw new Error('CHAPTER_MANAGE_TAB_NOT_VISIBLE');
    await chapterTab.click({ force: true });
    await sleep(6000);

    const chapterPanelText = await page.locator('body').innerText();
    const visibleButtons = await page.locator('button').evaluateAll(btns => btns.map((b, i) => {
      const s = getComputedStyle(b);
      if (s.display === 'none' || s.visibility === 'hidden') return null;
      const text = String(b.textContent || '').trim();
      const ariaLabel = b.getAttribute('aria-label');
      if (!text && !ariaLabel) return null;
      if (!/화|공개|비공개|출간|회차|예약|수정|삭제|저장|관리|적용|반영/i.test((text || '') + ' ' + (ariaLabel || ''))) return null;
      const chain = [];
      let p = b;
      for (let k = 0; k < 4 && p; k++, p = p.parentElement) {
        chain.push({ tag: p.tagName, text: String(p.textContent || '').trim().slice(0, 1400), ariaLabel: p.getAttribute('aria-label'), role: p.getAttribute('role') });
      }
      return { index: i, text: text.slice(0, 300), ariaLabel, disabled: !!b.disabled, ariaDisabled: b.getAttribute('aria-disabled'), chain };
    }).filter(Boolean).slice(0, 200));

    const rows = await page.locator('tr, [role="row"], li').evaluateAll(nodes => nodes.map((n, i) => {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden') return null;
      const t = String(n.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/\b\d+화\b|공개|비공개|출간/.test(t)) return null;
      return { index: i, text: t.slice(0, 1800) };
    }).filter(Boolean).slice(0, 100));

    const lines = chapterPanelText.split(/\r?\n/).map(s => s.trim()).filter(Boolean).filter(s => /\d+화|공개|비공개|출간|회차|예약|상태|최신/i.test(s)).slice(0, 300);

    const report = {
      platform: 'quarterfull',
      target: TARGET,
      mode: 'CHAPTER_MANAGE_READ_ONLY_DIAGNOSE',
      chapterSummaries,
      rows,
      visibleButtons,
      interestingLines: lines,
      network: network.slice(-200)
    };
    fs.writeFileSync(path.join(REPORT_DIR, 'quarterfull-local-chapter-manage-diagnose.json'), JSON.stringify(report, null, 2));
    console.log('QF_CHAPTER_MANAGE_DIAGNOSE_OK');
    console.log(JSON.stringify(report));
  } finally {
    if (ctx) await ctx.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
