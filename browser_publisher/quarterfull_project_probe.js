const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(3000);
 const projectNode=page.getByText('새 작품',{exact:true}).last();
 if(await projectNode.count()&&await projectNode.isVisible()){await projectNode.click();await page.waitForTimeout(900);}
 const episodePath=page.getByText('/원고(출간용)/1화',{exact:true}).first();
 if(await episodePath.count()){await episodePath.click();await page.waitForTimeout(900);}
 const controls=await page.locator('button,[role=button],a,input,textarea,[contenteditable=true]').evaluateAll(els=>els.map((e,i)=>({i,tag:e.tagName,text:(e.innerText||e.value||'').trim().slice(0,160),aria:e.getAttribute('aria-label'),title:e.getAttribute('title'),placeholder:e.getAttribute('placeholder'),testid:e.getAttribute('data-testid'),type:e.getAttribute('type'),contenteditable:e.getAttribute('contenteditable'),outer:e.outerHTML.slice(0,500)})).filter(x=>x.text||x.aria||x.title||x.placeholder||x.testid));
 const publish=controls.filter(x=>/출간|작품|제목|이름|rename|publish|title|setting|설정/i.test([x.text,x.aria,x.title,x.placeholder,x.testid].filter(Boolean).join(' ')));
 const body=(await page.locator('body').innerText()).slice(0,10000);
 const report={url:page.url(),publish,controls,body};
 fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/quarterfull-project-probe.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
