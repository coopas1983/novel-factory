const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(3000);

 // Select the already-created project card, then its exact /원고(출간용)/1화 row.
 const projectNode=page.getByText('새 작품',{exact:true}).last();
 if(await projectNode.count()&&await projectNode.isVisible()){await projectNode.click();await page.waitForTimeout(1000);}
 const episodePath=page.getByText('/원고(출간용)/1화',{exact:true}).first();
 if(!await episodePath.count()) throw new Error('NEW_PROJECT_EPISODE_PATH_NOT_FOUND');
 await episodePath.click();
 await page.waitForTimeout(1500);

 const report=await page.evaluate(()=>({
   url:location.href,
   body:document.body.innerText.slice(0,22000),
   editors:[...document.querySelectorAll('[contenteditable="true"],textarea,input,[role="textbox"]')].map((e,i)=>({i,tag:e.tagName,text:(e.innerText||e.textContent||'').slice(0,1000),value:e.value||'',placeholder:e.getAttribute('placeholder'),aria:e.getAttribute('aria-label'),testid:e.getAttribute('data-testid'),visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length),html:e.outerHTML.slice(0,2400)})).filter(x=>x.visible),
   projectArea:[...document.querySelectorAll('button,div,span,a')].map((e,i)=>({i,text:(e.innerText||e.textContent||'').replace(/\s+/g,' ').trim(),aria:e.getAttribute('aria-label'),testid:e.getAttribute('data-testid'),visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length),html:e.outerHTML.slice(0,2000)})).filter(x=>x.visible&&(x.text==='새 작품'||x.text==='1화'||/작업 중: 새 작품|새 작품 · 1화|revision 1/.test(x.text))).slice(0,80)
 }));
 fs.mkdirSync('reports',{recursive:true});
 fs.writeFileSync('reports/quarterfull-project-probe.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
