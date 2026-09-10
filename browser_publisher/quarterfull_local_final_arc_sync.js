const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = '자정 이후의 콜센터';
const PROFILE = path.join(process.env.LOCALAPPDATA || '', 'NovelFactory', 'QuarterFullProfile');
const PROJECT_ID = 138647;
const WORK_ID = '0a091e56-ff71-4f3f-862b-fde86b61adb3';
const API = 'https://api.quarterfull.io/api/v1';
const REPORT_DIR = path.join(__dirname, 'reports');
fs.mkdirSync(REPORT_DIR, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').replace(/\s+/g, '');

function loadEpisode(ep) {
  const base = path.resolve(__dirname, '..', 'books', 'live-gemini-pilot', 'commercial');
  const body = fs.readFileSync(path.join(base, `chapter-${ep}.md`), 'utf8').trim();
  const q = JSON.parse(fs.readFileSync(path.join(base, `chapter-${ep}-quality.json`), 'utf8'));
  const vc = norm(body).length;
  if (q.gate !== 'PASS' || q.lexical_preflight !== 'PASS' || q.independent_reviewer !== 'PASS' || q.continuity_reviewer !== 'PASS') {
    throw new Error(`QUALITY_GATE_BLOCK:${ep}`);
  }
  if ((q.issues || []).length || (q.final_review_issues || []).length || (q.continuity_issues || []).length) {
    throw new Error(`QUALITY_ISSUES_BLOCK:${ep}`);
  }
  if (q.chars_without_whitespace !== vc || vc < 3500 || vc > 4400) throw new Error(`LENGTH_BLOCK:${ep}:${vc}`);
  return body;
}

async function api(page, method, url, body) {
  return page.evaluate(async ({method,url,body}) => {
    const t = localStorage.getItem('cravi_access_token');
    if (!t) throw new Error('NO_ACCESS_TOKEN');
    const r = await fetch(url, {
      method,
      headers: { Authorization: t.startsWith('Bearer ') ? t : `Bearer ${t}`, 'Content-Type':'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let j = null; try { j = await r.json(); } catch {}
    return { status:r.status, ok:r.ok, json:j };
  }, {method,url,body});
}

async function ensureTarget(page) {
  let projectStatus = null;
  const listener = r => { if (r.url() === `${API}/studio-cursor/projects`) projectStatus = r.status(); };
  page.on('response', listener);
  await page.goto('https://quarterfull.io/studio-cursor', { waitUntil:'domcontentloaded', timeout:60000 });
  await sleep(5000);
  page.off('response', listener);
  const text = await page.locator('body').innerText();
  if (projectStatus !== 200) throw new Error(`QF_AUTH_INVALID:${projectStatus}`);
  if (!text.includes(TARGET)) throw new Error('TARGET_PROJECT_NOT_VISIBLE');
  if (!text.includes('작업 중: ' + TARGET)) {
    const nodes = page.getByText(TARGET, { exact:true });
    let chosen = null;
    for (let i=0;i<await nodes.count();i++) if (await nodes.nth(i).isVisible().catch(()=>false)) { chosen = nodes.nth(i); break; }
    if (!chosen) throw new Error('TARGET_PROJECT_SELECT_NOT_FOUND');
    await chosen.click({ force:true });
    await sleep(2500);
  }
  if (!(await page.locator('body').innerText()).includes('작업 중: ' + TARGET)) throw new Error('TARGET_PROJECT_NOT_SELECTED');
}

async function readFile(page, p) {
  return api(page, 'GET', `${API}/studio-cursor/projects/${PROJECT_ID}/files/read?path=${encodeURIComponent(p)}`);
}

async function findEpisodeNode(page, label) {
  const nodes = page.getByText(label, { exact:true });
  let fallback = null;
  for (let i=0;i<await nodes.count();i++) {
    const n = nodes.nth(i);
    if (!(await n.isVisible().catch(()=>false))) continue;
    const chain = await n.evaluate(e => { let s='',p=e; for(let k=0;k<8&&p;k++,p=p.parentElement)s += ' ' + (p.textContent||''); return s; });
    if (chain.includes(`/원고(출간용)/${label}`)) return n;
    if (!fallback) fallback = n;
  }
  return fallback;
}

async function createNestedDoc(page, ep) {
  const label = `${ep}화`;
  const ai = page.locator('textarea[placeholder="무엇을 만들고 싶은지 말해주세요."]');
  if (await ai.count() === 0) throw new Error(`AI_COMMAND_BOX_NOT_FOUND:${ep}`);
  await ai.fill(`현재 작업 중인 작품 ${TARGET}에서 기존 회차는 절대 수정하지 말고, 원고(출간용) 폴더 아래에 새 문서 ${label}를 생성만 해줘. ${label} 본문은 작성하거나 수정하지 마.`);
  await page.waitForFunction(() => { const b=document.querySelector('button[aria-label="전송"]'); return b && !b.disabled; }, { timeout:5000 });
  await page.locator('button[aria-label="전송"]').click();
  const end = Date.now()+45000;
  while (Date.now()<end) {
    const src = await readFile(page, `/project/원고(출간용)/${label}.md`);
    if (src.ok) return;
    const dst = await readFile(page, `/project/원고/${label}.md`);
    if (dst.ok) return;
    await sleep(1200);
  }
  throw new Error(`EPISODE_CREATE_TIMEOUT:${ep}`);
}

async function visibleEditor(page) {
  const editors = page.locator('div.tiptap.ProseMirror[contenteditable="true"]');
  for (let i=0;i<await editors.count();i++) if (await editors.nth(i).isVisible().catch(()=>false)) return editors.nth(i);
  return null;
}

async function openEpisode(page, ep) {
  const label = `${ep}화`;
  const end = Date.now()+12000;
  let node = null;
  while (Date.now()<end && !node) { node = await findEpisodeNode(page,label); if(!node) await sleep(500); }
  if (!node) throw new Error(`EPISODE_NODE_NOT_FOUND:${ep}`);
  await node.click({ force:true });
  let editor = null; const eEnd=Date.now()+12000;
  while(Date.now()<eEnd && !editor){editor=await visibleEditor(page);if(!editor)await sleep(300);}
  if(!editor)throw new Error(`EDITOR_NOT_VISIBLE:${ep}`);
  await sleep(1000);
  return editor;
}

async function replaceEditor(page, editor, body, ep) {
  await editor.click();
  await editor.press('Control+A');
  await page.keyboard.insertText(body);
  await sleep(2500);
  let readback = (await editor.innerText()).trim();
  if (norm(readback)!==norm(body)) {
    await editor.click(); await editor.press('Control+A'); await page.keyboard.insertText(body); await sleep(2500);
    readback=(await editor.innerText()).trim();
  }
  if (norm(readback)!==norm(body)) throw new Error(`EDITOR_READBACK_MISMATCH:${ep}:${readback.length}:${body.length}`);
  await editor.press('End'); await editor.press(' '); await editor.press('Backspace');
  await sleep(8000);
}

async function syncEpisode(page, ep) {
  const label=`${ep}화`, expected=loadEpisode(ep);
  const srcPath=`/project/원고(출간용)/${label}.md`, dstPath=`/project/원고/${label}.md`;
  let dst=await readFile(page,dstPath), src=await readFile(page,srcPath);

  if (dst.ok) {
    const content=dst.json?.file?.content ?? dst.json?.content ?? '';
    if(norm(content)!==norm(expected))throw new Error(`DEST_MISMATCH:${ep}`);
    if(src.ok)throw new Error(`BOTH_SOURCE_DEST_EXIST:${ep}`);
    return {episode:ep,status:'ALREADY_NORMALIZED'};
  }

  if (!src.ok) {
    await createNestedDoc(page,ep);
    src=await readFile(page,srcPath); dst=await readFile(page,dstPath);
    if(dst.ok){const dc=dst.json?.file?.content ?? dst.json?.content ?? '';if(norm(dc)!==norm(expected))throw new Error(`CREATED_DEST_MISMATCH:${ep}`);return {episode:ep,status:'CREATED_DIRECT_NORMALIZED'};}
    if(!src.ok)throw new Error(`CREATED_FILE_NOT_FOUND:${ep}`);
  }

  let srcContent=src.json?.file?.content ?? src.json?.content ?? '';
  if(norm(srcContent)!==norm(expected)){
    const editor=await openEpisode(page,ep);
    const current=(await editor.innerText()).trim();
    if(norm(current).length>0 && norm(current)!==norm(expected))throw new Error(`NONEMPTY_MISMATCH_STOP:${ep}:${current.length}:${expected.length}`);
    await replaceEditor(page,editor,expected,ep);
    src=await readFile(page,srcPath);
    if(!src.ok)throw new Error(`SOURCE_LOST_AFTER_WRITE:${ep}`);
    srcContent=src.json?.file?.content ?? src.json?.content ?? '';
    if(norm(srcContent)!==norm(expected))throw new Error(`SOURCE_PERSISTENCE_MISMATCH:${ep}:${srcContent.length}:${expected.length}`);
  }

  const f=src.json?.file||src.json;
  if(typeof f?.revision!=='number')throw new Error(`SOURCE_REVISION_MISSING:${ep}`);
  const mv=await api(page,'POST',`${API}/studio-cursor/projects/${PROJECT_ID}/files/move`,{path:srcPath,new_path:dstPath,expected_revision:f.revision});
  if(!mv.ok)throw new Error(`MOVE_FAILED:${ep}:${mv.status}:${JSON.stringify(mv.json)}`);
  await sleep(1000);
  dst=await readFile(page,dstPath); src=await readFile(page,srcPath);
  if(!dst.ok)throw new Error(`DEST_MISSING_AFTER_MOVE:${ep}`);
  const dc=dst.json?.file?.content ?? dst.json?.content ?? '';
  if(norm(dc)!==norm(expected))throw new Error(`DEST_VERIFY_MISMATCH:${ep}`);
  if(src.ok)throw new Error(`SOURCE_STILL_EXISTS:${ep}`);
  return {episode:ep,status:'SYNCED_AND_NORMALIZED',revision:f.revision};
}

(async()=>{
  const ctx=await chromium.launchPersistentContext(PROFILE,{channel:'chrome',headless:true,args:['--profile-directory=Default']});
  try{
    const page=ctx.pages()[0]||await ctx.newPage();
    await ensureTarget(page);
    const results=[];
    for(let ep=11;ep<=15;ep++){
      console.log(`QF_FINAL_SYNC_START:${ep}`);
      results.push(await syncEpisode(page,ep));
      console.log('QF_FINAL_SYNC_EP_OK',JSON.stringify(results[results.length-1]));
    }
    const reg=await api(page,'POST',`${API}/studio-cursor/projects/${PROJECT_ID}/bookstore-chapters/register-missing`,{});
    if(!reg.ok)throw new Error(`REGISTER_MISSING_FAILED:${reg.status}:${JSON.stringify(reg.json)}`);
    await sleep(1800);
    const sum=await api(page,'GET',`${API}/studio/works/${WORK_ID}/chapter-summaries?_t=${Date.now()}`);
    if(!sum.ok)throw new Error(`SUMMARIES_FAILED:${sum.status}`);
    const arr=Array.isArray(sum.json)?sum.json:(sum.json?.chapters||sum.json?.items||sum.json?.data||[]);
    for(let ep=1;ep<=15;ep++)if(!arr.find(x=>x.title===`${ep}화`))throw new Error(`REGISTERED_CHAPTER_MISSING:${ep}`);
    if(arr.length!==15)throw new Error(`EXPECTED_15_CHAPTERS:${arr.length}`);
    const report={platform:'quarterfull',target:TARGET,auth:'PASS',results,chapterCount:arr.length,publicCount:arr.filter(x=>x.is_published).length,chapters:arr.map(x=>({title:x.title,is_published:x.is_published,published_at:x.published_at||null}))};
    fs.writeFileSync(path.join(REPORT_DIR,'quarterfull-final-arc-sync.json'),JSON.stringify(report,null,2));
    console.log('QF_FINAL_ARC_SYNC_OK');
    console.log(JSON.stringify(report));
  } finally { await ctx.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
