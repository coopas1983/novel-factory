const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');

function normalizeText(s){
  return String(s||'')
    .replace(/\r\n/g,'\n')
    .replace(/[ \t]+/g,' ')
    .replace(/ *\n */g,'\n')
    .replace(/\n{2,}/g,'\n')
    .trim();
}

(async()=>{
 const manuscript=fs.readFileSync('../books/live-gemini-pilot/commercial/chapter-1.md','utf8').trim();
 if(manuscript.length<3000) throw new Error('EP1_SOURCE_TOO_SHORT');
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(3000);
 const projectNode=page.getByText('새 작품',{exact:true}).last();
 if(await projectNode.count()&&await projectNode.isVisible()){await projectNode.click();await page.waitForTimeout(900);}
 const episodePath=page.getByText('/원고(출간용)/1화',{exact:true}).first();
 if(!await episodePath.count()) throw new Error('NEW_PROJECT_EPISODE_PATH_NOT_FOUND');
 await episodePath.click(); await page.waitForTimeout(1200);
 const editor=page.locator('div.tiptap.ProseMirror[contenteditable="true"]').first();
 if(!await editor.count()||!await editor.isVisible()) throw new Error('EP1_EDITOR_NOT_FOUND');

 const current=(await editor.innerText()).trim();
 if(normalizeText(current)!==normalizeText(manuscript)){
   await editor.click();
   await page.keyboard.press(process.platform==='darwin'?'Meta+A':'Control+A');
   await page.keyboard.insertText(manuscript);
   await page.waitForTimeout(5000);
 }
 const readback=(await editor.innerText()).trim();
 const normalizedExact=normalizeText(readback)===normalizeText(manuscript);
 const body=await page.locator('body').innerText();
 const report={url:page.url(),sourceChars:manuscript.length,readbackChars:readback.length,normalizedSourceChars:normalizeText(manuscript).length,normalizedReadbackChars:normalizeText(readback).length,normalizedExact,workingNewProject:/작업 중:\s*새 작품/.test(body),episodeHeader:/새 작품\s*·\s*1화/.test(body),autosaved:/자동 저장했습니다/.test(body),body:body.slice(0,7000),readbackHead:readback.slice(0,500),readbackTail:readback.slice(-500)};
 fs.mkdirSync('reports',{recursive:true}); fs.writeFileSync('reports/quarterfull-project-probe.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
 if(!normalizedExact) throw new Error('EP1_NORMALIZED_READBACK_MISMATCH');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
