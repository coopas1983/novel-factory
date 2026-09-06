const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(3500);
 const body=(await page.locator('body').innerText()).slice(0,30000);
 const controls=await page.locator('button,[role=button],a').evaluateAll(es=>es.map((e,i)=>({i,text:(e.innerText||'').trim(),aria:e.getAttribute('aria-label'),title:e.getAttribute('title'),href:e.getAttribute('href'),disabled:!!e.disabled})).filter(x=>x.text||x.aria||x.title));
 const editors=await page.locator('[contenteditable=true].ProseMirror').evaluateAll(es=>es.map(e=>(e.innerText||'').slice(0,1000)));
 const report={phase:'studio-inventory-after-ep1',url:page.url(),body,controls,editors};
 fs.mkdirSync('reports',{recursive:true}); fs.writeFileSync('reports/quarterfull-project-probe.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
