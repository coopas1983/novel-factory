const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = '자정 이후의 콜센터';
const PROFILE = process.env.QUARTERFULL_PROFILE_DIR || path.join(process.env.LOCALAPPDATA || '', 'NovelFactory', 'QuarterFullProfile');
const TRIGGER = fs.readFileSync(path.join(__dirname, 'quarterfull-local-trigger.txt'), 'utf8').trim();
const REPORT_DIR = path.join(__dirname, 'reports');
fs.mkdirSync(REPORT_DIR, { recursive: true });

const norm = s => String(s || '').replace(/\s+/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let lastLoadedPath = null;

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

function trackLoadedFile(response) {
  try {
    const u = new URL(response.url());
    if (!u.hostname.endsWith('quarterfull.io')) return;
    if (!u.pathname.endsWith('/files/read')) return;
    if (response.status() !== 200) return;
    const p = u.searchParams.get('path');
    if (p) lastLoadedPath = p;
  } catch {}
}

async function ensureTarget(page) {
  let projectsStatus = null;
  const listener = r => {
    if (r.url() === 'https://api.quarterfull.io/api/v1/studio-cursor/projects') projectsStatus = r.status();
  };
  page.on('response', listener);
  lastLoadedPath = null;
  await page.goto('https://quarterfull.io/studio-cursor', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000);
  page.off('response', listener);
  const root = await page.locator('body').innerText();
  if (projectsStatus !== 200) throw new Error(`QF_AUTH_INVALID:${projectsStatus ?? 'NO_PROJECT_RESPONSE'}`);
  if (!root.includes(TARGET)) throw new Error(`TARGET_PROJECT_NOT_VISIBLE:${TARGET}`);
  if (!root.includes('작업 중: ' + TARGET)) {
    const nodes = page.getByText(TARGET, { exact: true });
    let target = null;
    for (let i = 0; i < await nodes.count(); i++) {
      if (await nodes.nth(i).isVisible()) { target = nodes.nth(i); break; }
    }
    if (!target) target = nodes.first();
    await target.click({ force: true });
    await sleep(2500);
  }
  if (!(await page.locator('body').innerText()).includes('작업 중: ' + TARGET)) throw new Error('TARGET_PROJECT_NOT_SELECTED');
}

async function chooseEpisode(page, label) {
  const nodes = page.getByText(label, { exact: true });
  let fallback = null;
  for (let i = 0; i < await nodes.count(); i++) {
    const n = nodes.nth(i);
    const chain = await n.evaluate(e => {
      let s = '', p = e;
      for (let k = 0; k < 7 && p; k++, p = p.parentElement) s += ' ' + (p.textContent || '');
      return s.slice(0, 5000);
    });
    if (chain.includes(`/원고(출간용)/${label}`)) {
      if (await n.isVisible()) return n;
      if (!fallback) fallback = n;
    }
  }
  return fallback;
}

async function waitForDoc(page, label, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if ((await page.locator('body').innerText()).includes(`/원고(출간용)/${label}`)) {
      const n = await chooseEpisode(page, label);
      if (n) return n;
    }
    await sleep(750);
  }
  return null;
}

async function createMissingDoc(page, ep) {
  const label = `${ep}화`;
  if (ep === 2) throw new Error('EP2_DOCUMENT_MISSING_STOP');
  const ai = page.locator('textarea[placeholder="무엇을 만들고 싶은지 말해주세요."]');
  if (await ai.count() === 0) throw new Error(`AI_COMMAND_BOX_NOT_FOUND:${ep}`);
  await ai.fill(`현재 작업 중인 작품 ${TARGET}에서 기존 회차는 절대 수정하지 말고, 원고(출간용) 폴더 아래에 새 문서 ${label}를 생성만 해줘. ${label} 본문은 작성하거나 수정하지 마.`);
  const send = page.locator('button[aria-label="전송"]');
  await page.waitForFunction(() => {
    const b = document.querySelector('button[aria-label="전송"]');
    return b && !b.disabled;
  }, { timeout: 5000 });
  await send.click();
  const node = await waitForDoc(page, label, 35000);
  if (!node) throw new Error(`EPISODE_CREATE_FAILED:${ep}`);
  return node;
}

async function visibleEditor(page) {
  const editors = page.locator('div.tiptap.ProseMirror[contenteditable="true"]');
  for (let i = 0; i < await editors.count(); i++) {
    const e = editors.nth(i);
    if (await e.isVisible().catch(() => false)) return e;
  }
  return null;
}

async function activate(page, node, label) {
  const desiredPath = `/project/원고/${label}.md`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    if (lastLoadedPath !== desiredPath) {
      try { await node.click({ force: true }); } catch {}
    }

    const end = Date.now() + 15000;
    while (Date.now() < end && lastLoadedPath !== desiredPath) await sleep(250);

    if (lastLoadedPath === desiredPath) {
      const editorEnd = Date.now() + 10000;
      while (Date.now() < editorEnd) {
        const e = await visibleEditor(page);
        if (e) {
          await sleep(1000);
          if (lastLoadedPath !== desiredPath) break;
          return e;
        }
        await sleep(250);
      }
    }

    await sleep(800);
    node = await chooseEpisode(page, label) || node;
  }
  throw new Error(`EPISODE_LOAD_UNVERIFIED:${label}:${lastLoadedPath || 'NONE'}`);
}

async function replaceAll(editor, text) {
  await editor.click();
  await editor.evaluate((el, body) => {
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('insertText', false, body);
  }, text);
  await sleep(2500);
}

async function inspectEpisode(page, ep) {
  const label = `${ep}화`;
  const node = await waitForDoc(page, label, 4000);
  if (!node) return { episode: ep, exists: false, chars: null, state: 'MISSING' };
  const editor = await activate(page, node, label);
  const current = (await editor.innerText()).trim();
  const canonical = loadEpisode(ep);
  return {
    episode: ep,
    exists: true,
    chars: current.length,
    canonicalChars: canonical.length,
    state: norm(current).length === 0 ? 'EMPTY' : (norm(current) === norm(canonical) ? 'MATCHED' : 'DIFFERENT')
  };
}

async function syncEpisode(page, ep) {
  const label = `${ep}화`;
  let node = await waitForDoc(page, label, 4000);
  if (!node) node = await createMissingDoc(page, ep);
  const editor = await activate(page, node, label);
  const body = loadEpisode(ep);
  let current = (await editor.innerText()).trim();

  if (norm(current) === norm(body)) {
    return { episode: ep, chars: body.length, status: 'ALREADY_MATCHED' };
  }
  if (norm(current).length > 0) {
    throw new Error(`NONEMPTY_CONTENT_MISMATCH_STOP:${ep}:${current.length}:${body.length}`);
  }

  await replaceAll(editor, body);
  let readback = (await editor.innerText()).trim();
  if (norm(readback) !== norm(body)) {
    await replaceAll(editor, body);
    readback = (await editor.innerText()).trim();
  }
  if (norm(readback) !== norm(body)) throw new Error(`READBACK_MISMATCH:${ep}:${readback.length}:${body.length}`);

  await editor.press('End');
  await editor.press(' ');
  await editor.press('Backspace');
  await sleep(6000);
  const finalText = (await editor.innerText()).trim();
  if (lastLoadedPath !== `/project/원고/${label}.md`) throw new Error(`EPISODE_CHANGED_DURING_SAVE:${ep}`);
  if (norm(finalText) !== norm(body)) throw new Error(`FINAL_READBACK_MISMATCH:${ep}`);
  return { episode: ep, chars: body.length, status: 'DRAFT_SAVED_VERIFIED' };
}

(async () => {
  if (!PROFILE) throw new Error('LOCAL_PROFILE_PATH_MISSING');
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE, {
      channel: 'chrome',
      headless: true,
      args: ['--profile-directory=Default']
    });
  } catch (e) {
    throw new Error(`LOCAL_PROFILE_OPEN_FAILED_CLOSE_DEDICATED_CHROME:${e.message}`);
  }

  try {
    const pages = ctx.pages();
    const page = pages[0] || await ctx.newPage();
    page.on('response', trackLoadedFile);
    await ensureTarget(page);

    if (/\bverify\b/i.test(TRIGGER)) {
      const episodes = [];
      for (let ep = 2; ep <= 10; ep++) {
        await ensureTarget(page);
        episodes.push(await inspectEpisode(page, ep));
      }
      const report = { platform: 'quarterfull', target: TARGET, auth: 'PASS', mode: 'VERIFY_ONLY_EXACT_LOAD', episodes };
      fs.writeFileSync(path.join(REPORT_DIR, 'quarterfull-local-verify.json'), JSON.stringify(report, null, 2));
      console.log('QF_LOCAL_AUTH_PASS');
      console.log(JSON.stringify(report));
      return;
    }

    let episodes = [];
    let m = TRIGGER.match(/episodes?\s+(\d+)\s*-\s*(\d+)/i);
    if (m) {
      for (let n = Number(m[1]); n <= Number(m[2]); n++) episodes.push(n);
    } else {
      m = TRIGGER.match(/episode\s+(\d+)/i);
      if (m) episodes = [Number(m[1])];
    }
    if (!episodes.length || episodes.some(n => n < 2 || n > 10)) throw new Error('EPISODE_TRIGGER_INVALID');

    const results = [];
    for (const ep of episodes) {
      await ensureTarget(page);
      const result = await syncEpisode(page, ep);
      results.push(result);
      fs.writeFileSync(path.join(REPORT_DIR, `quarterfull-local-sync-${ep}.json`), JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result));
    }
    console.log('QF_LOCAL_SYNC_OK', JSON.stringify(results.map(r => r.episode)));
  } finally {
    await ctx.close();
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
