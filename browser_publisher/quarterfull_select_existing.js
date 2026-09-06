const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');
(async()=>{
 const TARGET='자정 이후의 콜센터';
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(2500);
 const before=(await page.locator('body').innerText()).slice(0,30000);
 // Safe selection only: click exact existing project text. Never click plus/new-project glyphs.
 const exact=page.getByText(TARGET,{exact:true});
 const count=await exact.count();
 if(count<1) throw new Error('TARGET_PROJECT_NOT_FOUND:'+TARGET);
 await exact.first().click();
 await page.waitForTimeout(1800);
 const body=(await page.locator('body').innerText()).slice(0,30000);
 if(!body.includes(TARGET)) throw new Error('TARGET_PROJECT_NOT_CONFIRMED_AFTER_CLICK');
 const controls=await page.evaluate(()=>[...document.querySelectorAll('input,textarea,select,button,a,[role=button],[contenteditable=true]')].map((e,i)=>({i,tag:e.tagName.toLowerCase(),href:e.getAttribute('href'),placeholder:e.getAttribute('placeholder'),aria:e.getAttribute('aria-label'),text:(e.innerText||e.value||'').replace(/\s+/g,' ').trim().slice(0,300),contenteditable:e.getAttribute('contenteditable')})).slice(0,600));
 const report={target:TARGET,url:page.url(),before:before.slice(0,12000),body,controls};
 fs.mkdirSync('reports',{recursive:true}); fs.writeFileSync('reports/quarterfull-existing-project.json',JSON.stringify(report,null,2));
 console.log('QF_EXISTING_PROJECT_OK',TARGET,page.url(),'controls='+controls.length);
 console.log(JSON.stringify({url:report.url,body:body.slice(0,10000),controls},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
