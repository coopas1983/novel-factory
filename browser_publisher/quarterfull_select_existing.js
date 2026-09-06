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
 const snap=async label=>({label,url:page.url(),body:(await page.locator('body').innerText()).slice(0,30000),links:await page.locator('a').evaluateAll(es=>es.map(e=>({text:(e.innerText||'').trim(),href:e.href})).slice(0,300))});
 const states=[await snap('studio-cursor')];
 let found=(await page.getByText(TARGET,{exact:true}).count())>0;
 const candidates=await page.locator('a').evaluateAll(es=>es.map(e=>({text:(e.innerText||'').replace(/\s+/g,' ').trim(),href:e.href})).filter(x=>x.href && /quarterfull\.io/.test(x.href) && /(studio|project|library|book|work|dashboard|cursor)/i.test(x.text+' '+x.href)).slice(0,30));
 for(const c of candidates){
   if(found) break;
   if(/new|create/i.test(c.href+' '+c.text)) continue;
   try{await page.goto(c.href,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(1200);states.push(await snap(c.href));found=(await page.getByText(TARGET,{exact:true}).count())>0;}catch{}
 }
 fs.mkdirSync('reports',{recursive:true});
 fs.writeFileSync('reports/quarterfull-existing-project.json',JSON.stringify({target:TARGET,found,states},null,2));
 if(!found){console.log('QF_TARGET_DISCOVERY_MISS',JSON.stringify(states.map(s=>({label:s.label,url:s.url,body:s.body.slice(0,4000)})),null,2));throw new Error('TARGET_PROJECT_NOT_FOUND_AFTER_SAFE_DISCOVERY:'+TARGET);}
 await page.getByText(TARGET,{exact:true}).first().click();await page.waitForTimeout(1500);
 console.log('QF_EXISTING_PROJECT_OK',TARGET,page.url());console.log((await page.locator('body').innerText()).slice(0,10000));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
