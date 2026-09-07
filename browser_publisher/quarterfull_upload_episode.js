const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');

const TARGET='자정 이후의 콜센터';
const trigger=fs.readFileSync('quarterfull-upload-trigger.txt','utf8');
let episodes=[];
let m=trigger.match(/episodes?\s+(\d+)\s*-\s*(\d+)/i);
if(m){for(let n=Number(m[1]);n<=Number(m[2]);n++) episodes.push(n);} else {m=trigger.match(/episode\s+(\d+)/i); if(m) episodes=[Number(m[1])];}
if(!episodes.length||episodes.some(n=>n<3||n>10)) throw new Error('EPISODE_TRIGGER_INVALID');
const norm=s=>s.replace(/\s+/g,'');
function loadEpisode(ep){
 const body=fs.readFileSync(`../books/live-gemini-pilot/commercial/chapter-${ep}.md`,'utf8').trim();
 const q=JSON.parse(fs.readFileSync(`../books/live-gemini-pilot/commercial/chapter-${ep}-quality.json`,'utf8'));
 if(q.gate!=='PASS'||q.lexical_preflight!=='PASS'||q.independent_reviewer!=='PASS'||q.continuity_reviewer!=='PASS'||(q.issues||[]).length) throw new Error(`QUALITY_GATE_BLOCK:${ep}`);
 return body;
}
async function chooseEpisode(page,label){
 const nodes=page.getByText(label,{exact:true});
 if(await nodes.count()===0) return null;
 for(let i=0;i<await nodes.count();i++){
  const n=nodes.nth(i);
  const p=await n.evaluate(e=>(e.parentElement&&e.parentElement.textContent||'')+' '+(e.parentElement&&e.parentElement.parentElement&&e.parentElement.parentElement.textContent||''));
  if(p.includes(`/원고(출간용)/${label}`)) return n;
 }
 return nodes.last();
}
async function ensureDoc(page,ep){
 const label=`${ep}화`;
 let node=await chooseEpisode(page,label);
 if(node) return node;
 const ai=page.locator('textarea[placeholder="무엇을 만들고 싶은지 말해주세요."]');
 if(await ai.count()===0) throw new Error(`AI_COMMAND_BOX_NOT_FOUND:${ep}`);
 await ai.fill(`현재 작업 중인 작품 ${TARGET}에서 기존 회차는 절대 수정하지 말고, 원고(출간용) 폴더 아래에 새 문서 ${label}를 생성만 해줘. ${label} 본문은 작성하거나 수정하지 마.`);
 const send=page.locator('button[aria-label="전송"]');
 await page.waitForFunction(()=>{const b=document.querySelector('button[aria-label="전송"]'); return b && !b.disabled;},{timeout:5000});
 await send.click();
 for(let i=0;i<28;i++){
  await page.waitForTimeout(1000);
  node=await chooseEpisode(page,label);
  if(node) return node;
 }
 throw new Error(`EPISODE_CREATE_FAILED:${label}`);
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(4000);
 let root=await page.locator('body').innerText();
 if(!root.includes(TARGET)) throw new Error('TARGET_PROJECT_NOT_VISIBLE:'+TARGET);
 if(!root.includes('작업 중: '+TARGET)){
  const project=page.getByText(TARGET,{exact:true});
  if(await project.count()===0) throw new Error('TARGET_PROJECT_EXACT_NOT_FOUND');
  await project.first().click(); await page.waitForTimeout(2200);
 }
 if(!(await page.locator('body').innerText()).includes('작업 중: '+TARGET)) throw new Error('TARGET_PROJECT_NOT_SELECTED');
 fs.mkdirSync('reports',{recursive:true});
 const results=[];
 for(const ep of episodes){
  const body=loadEpisode(ep); const label=`${ep}화`;
  let node=await ensureDoc(page,ep);
  await node.click(); await page.waitForTimeout(2500);
  const current=await page.locator('body').innerText();
  if(!current.includes('작업 중: '+TARGET)||!current.includes(`/원고(출간용)/${label}`)) throw new Error(`EPISODE_SELECTION_UNVERIFIED:${ep}`);
  let editor=page.locator('div.tiptap.ProseMirror[contenteditable="true"]');
  await editor.waitFor({state:'visible',timeout:8000});
  editor=editor.first();
  await editor.click(); await editor.press(process.platform==='darwin'?'Meta+A':'Control+A'); await editor.fill(body);
  await page.waitForTimeout(4500);
  const readback=(await editor.innerText()).trim();
  if(norm(readback)!==norm(body)) throw new Error(`READBACK_MISMATCH:${ep}:${readback.length}:${body.length}`);
  await page.waitForTimeout(3500);
  const verified=norm((await editor.innerText()).trim())===norm(body);
  if(!verified) throw new Error(`FINAL_READBACK_MISMATCH:${ep}`);
  const r={platform:'quarterfull',episode:ep,target:TARGET,chars:body.length,verified,status:'DRAFT_SAVED_VERIFIED'};
  fs.writeFileSync(`reports/quarterfull-upload-${ep}.json`,JSON.stringify(r,null,2)); results.push(r); console.log(JSON.stringify(r));
 }
 console.log('BATCH_OK',JSON.stringify(results.map(x=>x.episode)));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
