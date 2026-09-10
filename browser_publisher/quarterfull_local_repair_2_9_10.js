const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = '자정 이후의 콜센터';
const PROFILE = process.env.QUARTERFULL_PROFILE_DIR || path.join(process.env.LOCALAPPDATA || '', 'NovelFactory', 'QuarterFullProfile');
const REPORT_DIR = path.join(__dirname, 'reports');
const BACKUP_DIR = path.join(process.env.LOCALAPPDATA || '.', 'NovelFactory', 'QuarterFullBackups');
fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').replace(/\s+/g, '');
let lastLoadedPath = null;

function allowedPath(label, p) {
  return p === `/project/원고/${label}.md` || p === `/project/원고(출간용)/${label}.md`;
}

function track(response) {
  try {
    const u = new URL(response.url());
    if (!u.hostname.endsWith('quarterfull.io') || !u.pathname.endsWith('/files/read') || response.status() !== 200) return;
    const p = u.searchParams.get('path');
    if (p) lastLoadedPath = p;
  } catch {}
}

function loadEpisode(ep) {
  const base = path.resolve(__dirname, '..', 'books', 'live-gemini-pilot', 'commercial');
  const body = fs.readFileSync(path.join(base, `chapter-${ep}.md`), 'utf8').trim();
  const q = JSON.parse(fs.readFileSync(path.join(base, `chapter-${ep}-quality.json`), 'utf8'));
  if (q.gate !== 'PASS' || q.lexical_preflight !== 'PASS' || q.independent_reviewer !== 'PASS' || q.continuity_reviewer !== 'PASS') {
    throw new Error(`QUALITY_GATE_BLOCK:${ep}`);
  }
  const issues = [...(q.issues || []), ...(q.final_review_issues || []), ...(q.continuity_issues || [])];
  if (issues.length) throw new Error(`QUALITY_ISSUES_BLOCK:${ep}`);
  return body;
}

async function ensureTarget(page) {
  let projectsStatus = null;
  const listener = r => { if (r.url() === 'https://api.quarterfull.io/api/v1/studio-cursor/projects') projectsStatus = r.status(); };
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
    for (let i = 0; i < await nodes.count(); i++) if (await nodes.nth(i).isVisible()) { chosen = nodes.nth(i); break; }
    if (!chosen) chosen = nodes.first();
    await chosen.click({ force: true });
    await sleep(2500);
  }
  if (!(await page.locator('body').innerText()).includes('작업 중: ' + TARGET)) throw new Error('TARGET_PROJECT_NOT_SELECTED');
}

async function nodeFor(page, label) {
  const nodes = page.getByText(label, { exact: true });
  for (let i = 0; i < await nodes.count(); i++) {
    const n = nodes.nth(i);
    if (!(await n.isVisible().catch(() => false))) continue;
    const chain = await n.evaluate(e => { let s='',p=e; for(let k=0;k<7&&p;k++,p=p.parentElement)s+=' '+(p.textContent||''); return s; });
    if (chain.includes(`/원고(출간용)/${label}`)) return n;
  }
  return null;
}

async function waitForNode(page, label, timeout = 4000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const n = await nodeFor(page, label);
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
  const label = `${ep}화`;
  const node = await waitForNode(page, label, 5000);
  if (!node) return null;
  lastLoadedPath = null;
  await node.click({ force: true });
  const end = Date.now() + 15000;
  while (Date.now() < end && !allowedPath(label, lastLoadedPath)) await sleep(250);
  if (!allowedPath(label, lastLoadedPath)) throw new Error(`EPISODE_LOAD_UNVERIFIED:${label}:${lastLoadedPath || 'NONE'}`);
  let editor = null;
  const eEnd = Date.now() + 10000;
  while (Date.now() < eEnd && !editor) { editor = await visibleEditor(page); if (!editor) await sleep(250); }
  if (!editor) throw new Error(`EDITOR_NOT_VISIBLE:${label}`);
  await sleep(1000);
  if (!allowedPath(label, lastLoadedPath)) throw new Error(`EPISODE_CHANGED:${label}`);
  return editor;
}

async function createEpisode(page, ep) {
  const label = `${ep}화`;
  const ai = page.locator('textarea[placeholder="무엇을 만들고 싶은지 말해주세요."]');
  if (await ai.count() === 0) throw new Error(`AI_COMMAND_BOX_NOT_FOUND:${ep}`);
  await ai.fill(`현재 작업 중인 작품 ${TARGET}에서 기존 회차는 절대 수정하지 말고, 원고(출간용) 폴더 아래에 새 문서 ${label}를 생성만 해줘. ${label} 본문은 작성하거나 수정하지 마.`);
  const send = page.locator('button[aria-label="전송"]');
  await page.waitForFunction(() => { const b=document.querySelector('button[aria-label="전송"]'); return b && !b.disabled; }, { timeout: 5000 });
  await send.click();
  const node = await waitForNode(page, label, 40000);
  if (!node) throw new Error(`EPISODE_CREATE_FAILED:${ep}`);
  return node;
}

function backup(ep, text) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(BACKUP_DIR, `chapter-${ep}-before-repair-${stamp}.txt`);
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

async function replaceEditor(page, editor, body) {
  await editor.click();
  await editor.press('Control+A');
  await page.keyboard.insertText(body);
  await sleep(3000);
  const readback = (await editor.innerText()).trim();
  if (norm(readback) !== norm(body)) throw new Error(`IMMEDIATE_READBACK_MISMATCH:${readback.length}:${body.length}`);
  await editor.press('End');
  await editor.press(' ');
  await editor.press('Backspace');
  await sleep(7000);
}

async function verifyPersisted(page, ep, body) {
  const sentinel = ep === 3 ? 4 : 3;
  const sentinelEditor = await openEpisode(page, sentinel);
  if (!sentinelEditor) throw new Error(`SENTINEL_MISSING:${sentinel}`);
  await sleep(1200);
  const editor = await openEpisode(page, ep);
  if (!editor) throw new Error(`VERIFY_EPISODE_MISSING:${ep}`);
  const current = (await editor.innerText()).trim();
  if (norm(current) !== norm(body)) throw new Error(`PERSISTENCE_VERIFY_FAILED:${ep}:${current.length}:${body.length}`);
  return current.length;
}

async function repair(page, ep, mode) {
  const body = loadEpisode(ep);
  let editor = await openEpisode(page, ep);
  if (!editor) {
    if (ep !== 10) throw new Error(`UNEXPECTED_MISSING_EPISODE:${ep}`);
    await createEpisode(page, ep);
    editor = await openEpisode(page, ep);
    if (!editor) throw new Error(`CREATED_EPISODE_NOT_OPENABLE:${ep}`);
  }

  const current = (await editor.innerText()).trim();
  if (norm(current) === norm(body)) return { episode: ep, status: 'ALREADY_MATCHED', chars: current.length };

  let backupPath = null;
  if (norm(current).length > 0) {
    if (mode !== 'replace-with-backup') throw new Error(`NONEMPTY_MISMATCH_STOP:${ep}:${current.length}:${body.length}`);
    backupPath = backup(ep, current);
  }

  await replaceEditor(page, editor, body);
  const persistedChars = await verifyPersisted(page, ep, body);
  return { episode: ep, status: 'REPAIRED_AND_PERSISTED', chars: persistedChars, backupPath };
}

(async () => {
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: true, args: ['--profile-directory=Default'] });
    const page = ctx.pages()[0] || await ctx.newPage();
    page.on('response', track);
    await ensureTarget(page);

    const results = [];
    results.push(await repair(page, 2, 'empty-only'));
    results.push(await repair(page, 9, 'replace-with-backup'));
    results.push(await repair(page, 10, 'empty-only'));

    const report = { platform: 'quarterfull', target: TARGET, auth: 'PASS', mode: 'RECOVERY_2_9_10', results };
    fs.writeFileSync(path.join(REPORT_DIR, 'quarterfull-local-repair-2-9-10.json'), JSON.stringify(report, null, 2));
    console.log('QF_LOCAL_REPAIR_OK');
    console.log(JSON.stringify(report));
  } finally {
    if (ctx) await ctx.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
