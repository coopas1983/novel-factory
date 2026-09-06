const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000}); await page.waitForTimeout(3000);
 let projectNode=page.getByText('자정 이후의 콜센터',{exact:true}).last(); if(!(await projectNode.count())) projectNode=page.getByText('새 작품',{exact:true}).last();
 if(!(await projectNode.count())) throw new Error('SAFETY target project missing'); if(await projectNode.isVisible()) await projectNode.click(); await page.waitForTimeout(700);
 const ep=page.getByText('/원고(출간용)/1화',{exact:true}).first(); if(!(await ep.count())) throw new Error('SAFETY ep1 missing'); await ep.click(); await page.waitForTimeout(700);
 const editor=page.locator('[contenteditable=true].ProseMirror').first(); const text=await editor.innerText(); if(!text.includes('알람이 울리기도 전에 눈이 먼저 뜨였다.')) throw new Error('SAFETY manuscript mismatch');
 const prep=page.getByRole('button',{name:'출간 준비'}).first(); if(!(await prep.count())) throw new Error('prep missing'); await prep.click(); await page.waitForTimeout(900);
 const els=await page.locator('button,[role=button],a,input,textarea').evaluateAll(es=>es.map((e,i)=>({i,tag:e.tagName,text:(e.innerText||'').trim(),aria:e.getAttribute('aria-label'),title:e.getAttribute('title'),placeholder:e.getAttribute('placeholder'),disabled:!!e.disabled,html:e.outerHTML.slice(0,1000)})).filter(x=>JSON.stringify(x).match(/출간|공개|발행|publish|서점|작품|미출간/i)));
 const dialogs=await page.locator('[role=dialog]').allInnerTexts();
 const body=(await page.locator('body').innerText()).slice(0,20000);
 const report={phase:'publish-control-inspection',url:page.url(),els,dialogs,body}; fs.mkdirSync('reports',{recursive:true}); fs.writeFileSync('reports/quarterfull-project-probe.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
