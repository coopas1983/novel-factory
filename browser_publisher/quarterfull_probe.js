const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(2500);
 const before={url:page.url(),text:(await page.locator('body').innerText()).slice(0,16000)};
 const draft=page.getByRole('button',{name:/I already have a draft/i});
 if(await draft.count()) { await draft.first().click(); await page.waitForTimeout(1500); }
 const mid={url:page.url(),text:(await page.locator('body').innerText()).slice(0,16000)};
 const controls=await page.evaluate(()=>[...document.querySelectorAll('input,textarea,select,button,[role=button],[contenteditable=true]')].map((e,i)=>({i,tag:e.tagName.toLowerCase(),type:e.getAttribute('type'),name:e.getAttribute('name'),id:e.id||null,placeholder:e.getAttribute('placeholder'),aria:e.getAttribute('aria-label'),role:e.getAttribute('role'),disabled:e.disabled||e.getAttribute('aria-disabled'),text:(e.innerText||e.value||'').replace(/\s+/g,' ').trim().slice(0,300),contenteditable:e.getAttribute('contenteditable')})).slice(0,400));
 const report={before,mid,url:page.url(),title:await page.title(),controls};
 fs.mkdirSync('reports',{recursive:true}); fs.writeFileSync('reports/quarterfull-probe.json',JSON.stringify(report,null,2));
 console.log('QUARTERFULL_PROBE_OK',report.url,'controls='+controls.length); console.log(JSON.stringify(report,null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
