const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');

const TARGET='자정 이후의 콜센터';
const trigger=fs.readFileSync('quarterfull-upload-trigger.txt','utf8');
const m=trigger.match(/episode\s+(\d+)/i); if(!m) throw new Error('EPISODE_TRIGGER_MISSING');
const EP=Number(m[1]); if(EP<3||EP>10) throw new Error('EPISODE_OUT_OF_RANGE');
const body=fs.readFileSync(`../books/live-gemini-pilot/commercial/chapter-${EP}.md`,'utf8').trim();
const quality=JSON.parse(fs.readFileSync(`../books/live-gemini-pilot/commercial/chapter-${EP}-quality.json`,'utf8'));
if(quality.gate!=='PASS'||quality.lexical_preflight!=='PASS'||quality.independent_reviewer!=='PASS'||quality.continuity_reviewer!=='PASS'||(quality.issues||[]).length) throw new Error(`QUALITY_GATE_BLOCK:${EP}`);

const norm=s=>s.replace(/\s+/g,'');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(4000);
 let rootText=await page.locator('body').innerText();
 if(!rootText.includes(TARGET)) throw new Error('TARGET_PROJECT_NOT_VISIBLE:'+TARGET);
 if(!rootText.includes('작업 중: '+TARGET)) {
   const project=page.getByText(TARGET,{exact:true});
   if(await project.count()===0) throw new Error('TARGET_PROJECT_EXACT_NOT_FOUND');
   await project.first().click(); await page.waitForTimeout(2000);
 }
 if(!(await page.locator('body').innerText()).includes('작업 중: '+TARGET)) throw new Error('TARGET_PROJECT_NOT_SELECTED');

 const label=`${EP}화`;
 let episodeNode=page.getByText(label,{exact:true});
 if(await episodeNode.count()===0){
   const ai=page.locator('textarea[placeholder="무엇을 만들고 싶은지 말해주세요."]');
   if(await ai.count()===0) throw new Error('AI_COMMAND_BOX_NOT_FOUND');
   await ai.fill(`현재 작업 중인 작품 ${TARGET}에서 기존 회차는 절대 수정하지 말고, 원고(출간용) 폴더 아래에 새 문서 ${label}를 생성만 해줘. ${label} 본문은 작성하거나 수정하지 마.`);
   const send=page.locator('button[aria-label="전송"]');
   await page.waitForFunction(()=>{const b=document.querySelector('button[aria-label="전송"]'); return b && !b.disabled;},{timeout:5000});
   await send.click();
   await page.waitForTimeout(14000);
   episodeNode=page.getByText(label,{exact:true});
   if(await episodeNode.count()===0) throw new Error('EPISODE_CREATE_FAILED:'+label);
 }
 const matches=await episodeNode.evaluateAll((els)=>els.map((e,i)=>({i,tag:e.tagName,cls:e.className||'',text:e.textContent||'',parent:(e.parentElement&&e.parentElement.textContent||'').slice(0,220),grand:(e.parentElement&&e.parentElement.parentElement&&e.parentElement.parentElement.textContent||'').slice(0,350)})));
 console.log('EPISODE_MATCHES',JSON.stringify(matches));
 // Prefer an episode entry that is inside a button/tree/navigation-like element, not chat prose.
 let chosen=null;
 for(let i=0;i<await episodeNode.count();i++){
   const n=episodeNode.nth(i);
   const info=await n.evaluate(e=>({tag:e.tagName,ancestorButton:!!e.closest('button'),ancestorRole:e.closest('[role]')&&e.closest('[role]').getAttribute('role'),parentText:(e.parentElement&&e.parentElement.textContent||'').slice(0,200)}));
   if(info.ancestorButton || ['treeitem','option','menuitem'].includes(info.ancestorRole)){chosen=n;break;}
 }
 if(!chosen) chosen=episodeNode.last();
 await chosen.click(); await page.waitForTimeout(3000);
 const diag=await page.evaluate(()=>({
   body:(document.body.innerText||'').slice(0,9000),
   iframes:[...document.querySelectorAll('iframe')].map(x=>({src:x.src,title:x.title,name:x.name})),
   editables:[...document.querySelectorAll('[contenteditable],textarea,input,[role=textbox]')].map((e,i)=>({i,tag:e.tagName,role:e.getAttribute('role'),contenteditable:e.getAttribute('contenteditable'),cls:e.className||'',placeholder:e.getAttribute('placeholder'),text:(e.innerText||e.value||'').slice(0,250)})).slice(0,100),
   editorish:[...document.querySelectorAll('div,section,main')].filter(e=>/editor|prosemirror|tiptap/i.test(String(e.className))).map((e,i)=>({i,tag:e.tagName,cls:String(e.className),text:(e.innerText||'').slice(0,200)})).slice(0,50)
 }));
 console.log('AFTER_EPISODE_CLICK',JSON.stringify(diag));
 let editor=page.locator('div.tiptap.ProseMirror[contenteditable="true"]');
 if(await editor.count()===0) editor=page.locator('[contenteditable="true"][role="textbox"]');
 if(await editor.count()===0) editor=page.locator('[contenteditable="true"]').filter({hasNot:page.locator('textarea')});
 if(await editor.count()===0) throw new Error('EDITOR_NOT_FOUND');
 editor=editor.first();
 await editor.click();
 await editor.press(process.platform==='darwin'?'Meta+A':'Control+A');
 await editor.fill(body);
 await page.waitForTimeout(5000);
 const readback=(await editor.innerText()).trim();
 if(norm(readback)!==norm(body)) throw new Error(`READBACK_MISMATCH:${readback.length}:${body.length}`);
 await page.waitForTimeout(5000);
 const finalText=await editor.innerText();
 fs.mkdirSync('reports',{recursive:true});
 fs.writeFileSync(`reports/quarterfull-upload-${EP}.json`,JSON.stringify({platform:'quarterfull',episode:EP,target:TARGET,chars:body.length,verified:norm(finalText)===norm(body),status:'DRAFT_SAVED_VERIFIED'},null,2));
 console.log(JSON.stringify({platform:'quarterfull',episode:EP,target:TARGET,chars:body.length,status:'DRAFT_SAVED_VERIFIED'}));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
