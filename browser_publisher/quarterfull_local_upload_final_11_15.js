const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = '자정 이후의 콜센터';
const PROFILE = path.join(process.env.LOCALAPPDATA || '', 'NovelFactory', 'QuarterFullProfile');
const PROJECT_ID = 138647;
const WORK_ID = '0a091e56-ff71-4f3f-862b-fde86b61adb3';
const API = 'https://api.quarterfull.io/api/v1';
const BASE = path.resolve(__dirname, '..', 'books', 'live-gemini-pilot', 'commercial');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').replace(/\s+/g, '');
let lastLoadedPath = null;

function canonical(ep) {
  const body = fs.readFileSync(path.join(BASE, `chapter-${ep}.md`), 'utf8').trim();
  const q = JSON.parse(fs.readFileSync(path.join(BASE, `chapter-${ep}-quality.json`), 'utf8'));
  if (q.gate !== 'PASS' || q.lexical_preflight !== 'PASS' || q.independent_reviewer !== 'PASS' || q.continuity_reviewer !== 'PASS') throw new Error(`QUALITY_GATE_BLOCK:${ep}`);
  const issues = [...(q.issues || []), ...(q.final_review_issues || []), ...(q.continuity_issues || [])];
  if (issues.length) throw new Error(`QUALITY_ISSUES_BLOCK:${ep}`);
  if (norm(body).length !== q.chars_without_whitespace) throw new Error(`QUALITY_COUNT_MISMATCH:${ep}`);
  return body;
}

function allowedPath(ep, p) {
  return p === `/project/원고/${ep}화.md` || p === `/project/원고(출간용)/${ep}화.md`;
}

function track(response) {
  try {
    const u = new URL(response.url());
    if (!u.hostname.endsWith('quarterfull.io') || !u.pathname.endsWith('/files/read') || response.status() !== 200) return;
    const p = u.searchParams.get('path');
    if (p) lastLoadedPath = p;
  } catch {}
}

async function api(page, method, url, body) {
  return page.evaluate(async ({ method, url, body }) => {
    const t = localStorage.getItem('cravi_access_token');
    if (!t) throw new Error('NO_ACCESS_TOKEN');
    const r = await fetch(url, {
      method,
      headers: { Authorization: t.startsWith('Bearer ') ? t : `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, ok: r.ok, json: j };
  }, { method, url, body });
}

async function readFile(page, p) {
  return api(page, 'GET', `${API}/studio-cursor/projects/${PROJECT_ID}/files/read?path=${encodeURIComponent(p)}`);
}

function contentOf(r) {
  return r?.json?.file?.content ?? r?.json?.content ?? '';
}

async function ensureTarget(page) {
  let projectsStatus = null;
  const listener = r => { if (r.url() === `${API}/studio-cursor/projects`) projectsStatus = r.status(); };
  page.on('response', listener);
  await page.goto('https://quarterfull.io/studio-cursor', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000);
  page.off('response', listener);
  const text = await page.locator('body').innerText();
  if (projectsStatus !== 200) throw new Error(`QF_AUTH_INVALID:${projectsStatus ?? 'NO_PROJECT_RESPONSE'}`);
  if (!text.includes(TARGET)) throw new Error('TARGET_PROJECT_NOT_VISIBLE');
  if (!text.includes('작업 중: ' + TARGET)) {
    const nodes = page.getByText(TARGET, { exact: true });
    let chosen = null;
    for (let i = 0; i < await nodes.count(); i++) if (await nodes.nth(i).isVisible().catch(() => false)) { chosen = nodes.nth(i); break; }
    if (!chosen) throw new Error('TARGET_PROJECT_CLICK_NODE_MISSING');
    await chosen.click({ force: true });
    await sleep(2500);
  }
  if (!(await page.locator('body').innerText()).includes('작업 중: ' + TARGET)) throw new Error('TARGET_PROJECT_NOT_SELECTED');
}

async function nodeFor(page, ep) {
  const label = `${ep}화`;
  const nodes = page.getByText(label, { exact: true });
  for (let i = 0; i < await nodes.count(); i++) {
    const n = nodes.nth(i);
    if (!(await n.isVisible().catch(() => false))) continue;
    const chain = await n.evaluate(e => { let s='',p=e; for(let k=0;k<8&&p;k++,p=p.parentElement)s+=' '+(p.textContent||''); return s; });
    if (chain.includes('원고(출간용)') && chain.includes(`/${label}`)) return n;
  }
  return null;
}

async function waitForNode(page, ep, timeout = 45000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const n = await nodeFor(page, ep);
    if (n) return n;
    await sleep(500);
  }
  return null;
}

async function visibleEditor(page) {
  const editors = page.locator('div.tiptap.ProseMirror[contenteditable="true"]');
  for (let i = 0; i < await editors.count(); i++) {
    const e = editors.nth(i);
    if (await e.isVisible().catch(() => false)) return e;
  }
  return null;
}

async function openEpisode(page, ep) {
  const node = await waitForNode(page, ep, 6000);
  if (!node) return null;
  lastLoadedPath = null;
  await node.click({ force: true });
  const end = Date.now() + 15000;
  while (Date.now() < end && !allowedPath(ep, lastLoadedPath)) await sleep(250);
  if (!allowedPath(ep, lastLoadedPath)) throw new Error(`EPISODE_LOAD_UNVERIFIED:${ep}:${lastLoadedPath || 'NONE'}`);
  let editor = null;
  const eEnd = Date.now() + 10000;
  while (Date.now() < eEnd && !editor) { editor = await visibleEditor(page); if (!editor) await sleep(250); }
  if (!editor) throw new Error(`EDITOR_NOT_VISIBLE:${ep}`);
  await sleep(800);
  return { editor, loadedPath: lastLoadedPath };
}

async function createEpisode(page, ep) {
  const label = `${ep}화`;
  const ai = page.locator('textarea[placeholder="무엇을 만들고 싶은지 말해주세요."]');
  if (await ai.count() === 0) throw new Error(`AI_COMMAND_BOX_NOT_FOUND:${ep}`);
  await ai.fill(`현재 작업 중인 작품 ${TARGET}에서 기존 회차는 절대 수정하지 말고, 원고(출간용) 폴더 아래에 새 문서 ${label}를 생성만 해줘. ${label} 본문은 작성하거나 수정하지 마.`);
  const send = page.locator('button[aria-label="전송"]');
  await page.waitForFunction(() => { const b=document.querySelector('button[aria-label="전송"]'); return b && !b.disabled; }, { timeout: 5000 });
  await send.click();
  const node = await waitForNode(page, ep, 45000);
  if (!node) throw new Error(`EPISODE_CREATE_FAILED:${ep}`);
  await sleep(1500);
}

async function replaceEditor(page, editor, body) {
  await editor.click();
  await editor.press('Control+A');
  await page.keyboard.insertText(body);
  await sleep(2500);
  const readback = (await editor.innerText()).trim();
  if (norm(readback) !== norm(body)) throw new Error(`IMMEDIATE_READBACK_MISMATCH:${readback.length}:${body.length}`);
  await editor.press('End');
  await editor.press(' ');
  await editor.press('Backspace');
  await sleep(7000);
}

async function verifyPersisted(page, ep, body) {
  const sentinel = 10;
  const s = await openEpisode(page, sentinel);
  if (!s) throw new Error('SENTINEL_10_MISSING');
  await sleep(600);
  const cur = await openEpisode(page, ep);
  if (!cur) throw new Error(`VERIFY_EPISODE_MISSING:${ep}`);
  const text = (await cur.editor.innerText()).trim();
  if (norm(text) !== norm(body)) throw new Error(`PERSISTENCE_VERIFY_FAILED:${ep}:${text.length}:${body.length}`);
  return cur.loadedPath;
}

async function ensureDraft(page, ep, body) {
  const dst = `/project/원고/${ep}화.md`;
  const src = `/project/원고(출간용)/${ep}화.md`;
  let d = await readFile(page, dst);
  if (d.ok) {
    if (norm(contentOf(d)) !== norm(body)) throw new Error(`DEST_CONTENT_MISMATCH:${ep}`);
    return { episode: ep, status: 'ALREADY_READY', path: dst };
  }

  let s = await readFile(page, src);
  if (!s.ok) {
    await createEpisode(page, ep);
  }

  const opened = await openEpisode(page, ep);
  if (!opened) throw new Error(`EPISODE_NOT_OPENABLE:${ep}`);
  const current = (await opened.editor.innerText()).trim();
  if (norm(current) !== norm(body)) {
    if (norm(current).length > 0) throw new Error(`NONEMPTY_MISMATCH_STOP:${ep}:${current.length}:${body.length}`);
    await replaceEditor(page, opened.editor, body);
  }
  const persistedPath = await verifyPersisted(page, ep, body);

  if (persistedPath === dst) return { episode: ep, status: 'DRAFT_SAVED_VERIFIED', path: dst };
  if (persistedPath !== src) throw new Error(`UNEXPECTED_PERSISTED_PATH:${ep}:${persistedPath}`);

  s = await readFile(page, src);
  d = await readFile(page, dst);
  if (d.ok) throw new Error(`DEST_ALREADY_EXISTS_BEFORE_MOVE:${ep}`);
  if (!s.ok) throw new Error(`SOURCE_MISSING_BEFORE_MOVE:${ep}:${s.status}`);
  const f = s.json?.file || s.json;
  if (norm(f?.content || '') !== norm(body)) throw new Error(`SOURCE_CONTENT_MISMATCH:${ep}`);
  if (typeof f?.revision !== 'number') throw new Error(`SOURCE_REVISION_MISSING:${ep}`);
  const mv = await api(page, 'POST', `${API}/studio-cursor/projects/${PROJECT_ID}/files/move`, { path: src, new_path: dst, expected_revision: f.revision });
  if (!mv.ok) throw new Error(`MOVE_FAILED:${ep}:${mv.status}:${JSON.stringify(mv.json)}`);
  await sleep(800);
  d = await readFile(page, dst);
  s = await readFile(page, src);
  if (!d.ok || norm(contentOf(d)) !== norm(body) || s.ok) throw new Error(`MOVE_VERIFY_FAILED:${ep}`);
  return { episode: ep, status: 'DRAFT_SAVED_MOVED_VERIFIED', path: dst };
}

(async () => {
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: true, args: ['--profile-directory=Default'] });
    const page = ctx.pages()[0] || await ctx.newPage();
    page.on('response', track);
    await ensureTarget(page);

    const results = [];
    for (let ep = 11; ep <= 15; ep++) results.push(await ensureDraft(page, ep, canonical(ep)));

    const reg = await api(page, 'POST', `${API}/studio-cursor/projects/${PROJECT_ID}/bookstore-chapters/register-missing`, {});
    if (!reg.ok) throw new Error(`REGISTER_MISSING_FAILED:${reg.status}:${JSON.stringify(reg.json)}`);
    await sleep(1200);
    const sum = await api(page, 'GET', `${API}/studio/works/${WORK_ID}/chapter-summaries?_t=${Date.now()}`);
    if (!sum.ok) throw new Error(`SUMMARIES_FAILED:${sum.status}`);
    const arr = Array.isArray(sum.json) ? sum.json : (sum.json?.chapters || sum.json?.items || sum.json?.data || []);
    for (let ep=1; ep<=15; ep++) if (!arr.find(x => x.title === `${ep}화`)) throw new Error(`REGISTERED_CHAPTER_MISSING:${ep}`);
    if (arr.length !== 15) throw new Error(`EXPECTED_15_CHAPTERS:${arr.length}`);

    const report = { platform:'quarterfull', target:TARGET, auth:'PASS', mode:'UPLOAD_FINAL_11_15', results, chapterCount:arr.length, publicCount:arr.filter(x=>x.is_published).length };
    fs.mkdirSync(path.join(__dirname,'reports'),{recursive:true});
    fs.writeFileSync(path.join(__dirname,'reports','quarterfull-local-upload-final-11-15.json'),JSON.stringify(report,null,2));
    console.log('QF_FINAL_UPLOAD_OK');
    console.log(JSON.stringify(report));
  } finally { if (ctx) await ctx.close(); }
})().catch(e => { console.error(e); process.exit(1); });
