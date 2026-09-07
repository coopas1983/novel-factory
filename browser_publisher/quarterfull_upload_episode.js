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

(async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(3500);
 const rootText=(await page.locator('body').innerText());
 if(!rootText.includes(TARGET)) throw new Error('TARGET_PROJECT_NOT_VISIBLE:'+TARGET);
 if(rootText.includes('작업 중: '+TARGET)) {
   // already selected
 } else {
   const project=page.getByText(TARGET,{exact:true});
   if(await project.count()===0) throw new Error('TARGET_PROJECT_EXACT_NOT_FOUND');
   await project.first().click(); await page.waitForTimeout(1800);
 }
 let selectedText=await page.locator('body').innerText();
 if(!selectedText.includes('작업 중: '+TARGET)) throw new Error('TARGET_PROJECT_NOT_SELECTED');

 const label=`${EP}화`;
 let episodeNode=page.getByText(label,{exact:true});
 if(await episodeNode.count()===0){
   const ai=page.locator('textarea[placeholder="무엇을 만들고 싶은지 말해주세요."]');
   if(await ai.count()===0) throw new Error('AI_COMMAND_BOX_NOT_FOUND');
   await ai.fill(`현재 작업 중인 작품 ${TARGET}에서 기존 회차는 절대 수정하지 말고, 원고(출간용) 폴더 아래에 새 문서 ${label}를 생성만 해줘. ${label} 본문은 작성하거나 수정하지 마.`);
   await ai.press('Enter');
   await page.waitForTimeout(8000);
   episodeNode=page.getByText(label,{exact:true});
   if(await episodeNode.count()===0) throw new Error('EPISODE_CREATE_FAILED:'+label);
 }
 await episodeNode.last().click(); await page.waitForTimeout(1800);
 selectedText=await page.locator('body').innerText();
 if(!selectedText.includes('작업 중: '+TARGET)||!selectedText.includes(label)) throw new Error('EPISODE_SELECTION_UNVERIFIED:'+label);
 const editor=page.locator('div.tiptap.ProseMirror[contenteditable="true"]');
 if(await editor.count()===0) throw new Error('EDITOR_NOT_FOUND');
 await editor.click();
 await editor.press(process.platform==='darwin'?'Meta+A':'Control+A');
 await editor.fill(body);
 await page.waitForTimeout(5000);
 const readback=(await editor.innerText()).trim();
 const norm=s=>s.replace(/\s+/g,'');
 if(norm(readback)!==norm(body)) throw new Error(`READBACK_MISMATCH:${readback.length}:${body.length}`);
 await page.waitForTimeout(4000);
 const finalText=await editor.innerText();
 fs.mkdirSync('reports',{recursive:true});
 fs.writeFileSync(`reports/quarterfull-upload-${EP}.json`,JSON.stringify({platform:'quarterfull',episode:EP,target:TARGET,chars:body.length,verified: norm(finalText)===norm(body),status:'DRAFT_SAVED_VERIFIED'},null,2));
 console.log(JSON.stringify({platform:'quarterfull',episode:EP,target:TARGET,chars:body.length,status:'DRAFT_SAVED_VERIFIED'}));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
