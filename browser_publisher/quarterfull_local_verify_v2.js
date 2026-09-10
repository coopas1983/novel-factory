const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = '자정 이후의 콜센터';
const PROFILE = process.env.QUARTERFULL_PROFILE_DIR || path.join(process.env.LOCALAPPDATA || '', 'NovelFactory', 'QuarterFullProfile');
const REPORT_DIR = path.join(__dirname, 'reports');
fs.mkdirSync(REPORT_DIR, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').replace(/\s+/g, '');
let lastLoadedPath = null;

function canonical(ep) {
  const base = path.resolve(__dirname, '..', 'books', 'live-gemini-pilot', 'commercial');
  return fs.readFileSync(path.join(base, `chapter-${ep}.md`), 'utf8').trim();
}

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

async function visibleEditor(page) {
  const editors = page.locator('div.tiptap.ProseMirror[contenteditable="true"]');
  for (let i = 0; i < await editors.count(); i++) {
    const e = editors.nth(i);
    if (await e.isVisible().catch(() => false)) return e;
  }
  return null;
}

async function inspect(page, ep) {
  const label = `${ep}화`;
  const node = await nodeFor(page, label);
  if (!node) return { episode: ep, exists: false, state: 'MISSING' };

  lastLoadedPath = null;
  await node.click({ force: true });
  const end = Date.now() + 15000;
  while (Date.now() < end && !allowedPath(label, lastLoadedPath)) await sleep(250);
  if (!allowedPath(label, lastLoadedPath)) throw new Error(`EPISODE_LOAD_UNVERIFIED:${label}:${lastLoadedPath || 'NONE'}`);

  let editor = null;
  const editorEnd = Date.now() + 10000;
  while (Date.now() < editorEnd && !editor) { editor = await visibleEditor(page); if (!editor) await sleep(250); }
  if (!editor) throw new Error(`EDITOR_NOT_VISIBLE:${label}`);
  await sleep(1000);
  if (!allowedPath(label, lastLoadedPath)) throw new Error(`EPISODE_CHANGED:${label}:${lastLoadedPath}`);

  const current = (await editor.innerText()).trim();
  const body = canonical(ep);
  return {
    episode: ep,
    exists: true,
    loadedPath: lastLoadedPath,
    chars: current.length,
    canonicalChars: body.length,
    state: norm(current).length === 0 ? 'EMPTY' : (norm(current) === norm(body) ? 'MATCHED' : 'DIFFERENT')
  };
}

(async () => {
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: true, args: ['--profile-directory=Default'] });
    const page = ctx.pages()[0] || await ctx.newPage();
    page.on('response', track);
    await ensureTarget(page);
    const episodes = [];
    for (let ep = 2; ep <= 10; ep++) episodes.push(await inspect(page, ep));
    const report = { platform: 'quarterfull', target: TARGET, auth: 'PASS', mode: 'VERIFY_V2_EXACT', episodes };
    fs.writeFileSync(path.join(REPORT_DIR, 'quarterfull-local-verify-v2.json'), JSON.stringify(report, null, 2));
    console.log('QF_LOCAL_VERIFY_V2_OK');
    console.log(JSON.stringify(report));
  } finally {
    if (ctx) await ctx.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
