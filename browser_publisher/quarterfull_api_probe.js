const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 const seen=[];
 page.on('response',async r=>{
   const u=r.url();
   if(!/quarterfull\.io|api\./i.test(u)) return;
   const ct=(r.headers()['content-type']||'');
   if(!/json|text/.test(ct)) return;
   if(!/(project|book|work|studio|manuscript|novel|chapter|file|user|profile|library)/i.test(u)) return;
   let body=''; try{body=(await r.text()).slice(0,12000);}catch{}
   body=body.replace(/"(access_token|refresh_token|token|authorization|cookie)"\s*:\s*"[^"]*"/gi,'"$1":"[REDACTED]"');
   seen.push({url:u,status:r.status(),contentType:ct,body});
 });
 await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'networkidle',timeout:60000}).catch(()=>{});
 await page.waitForTimeout(4000);
 const ls=await page.evaluate(()=>({local:Object.keys(localStorage),session:Object.keys(sessionStorage),body:(document.body.innerText||'').slice(0,12000),resources:performance.getEntriesByType('resource').map(x=>x.name).filter(x=>/quarterfull\.io/.test(x)).slice(0,300)}));
 fs.mkdirSync('reports',{recursive:true});
 fs.writeFileSync('reports/quarterfull-api-probe.json',JSON.stringify({url:page.url(),storageKeys:ls,seen},null,2));
 console.log('QF_API_PROBE_OK responses='+seen.length);
 console.log(JSON.stringify({url:page.url(),storageKeys:{local:ls.local,session:ls.session},body:ls.body,resources:ls.resources,responses:seen.map(x=>({url:x.url,status:x.status,body:x.body.slice(0,5000)}))},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
