const {chromium}=require('playwright');
const {loadState,persistState}=require('./auth');
const fs=require('fs');
const redact=s=>String(s||'').replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [REDACTED]').replace(/"(access_token|refresh_token|token|authorization|cookie)"\s*:\s*"[^"]*"/gi,'"$1":"[REDACTED]"');
let browser=null,ctx=null;
(async()=>{
 const stateFile=loadState('quarterfull');
 const initial=JSON.parse(fs.readFileSync(stateFile,'utf8'));
 const initialKeys=[];
 for(const o of (initial.origins||[])) for(const e of (o.localStorage||[])) if(/^cravi_(access|refresh)_token$/.test(e.name)) initialKeys.push(e.name);
 browser=await chromium.launch({headless:true});
 ctx=await browser.newContext({storageState:stateFile});
 const page=await ctx.newPage();
 const seen=[]; const refreshRequests=[];
 page.on('request',req=>{
   const u=req.url();
   if(!/api\.quarterfull\.io\/api\/auth\/token\/refresh/.test(u)) return;
   let postKeys=[]; try{const p=req.postDataJSON(); if(p&&typeof p==='object') postKeys=Object.keys(p);}catch{}
   refreshRequests.push({url:u,method:req.method(),postKeys});
 });
 page.on('response',async r=>{
   const u=r.url(); const ct=(r.headers()['content-type']||'');
   if(!/api\.quarterfull\.io\/api\//i.test(u)||!/json|text/.test(ct)||!/(project|studio|auth|refresh)/i.test(u)) return;
   let body=''; try{body=(await r.text()).slice(0,1500);}catch{}
   seen.push({url:u,status:r.status(),body:redact(body)});
 });
 await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'networkidle',timeout:60000}).catch(()=>{});
 await page.waitForTimeout(4000);
 const after=await page.evaluate(()=>({local:Object.keys(localStorage),body:(document.body.innerText||'').slice(0,5000)}));
 await persistState(ctx,'quarterfull');
 fs.mkdirSync('reports',{recursive:true});
 const report={initialTokenKeys:initialKeys.sort(),afterTokenKeys:after.local.filter(x=>/^cravi_(access|refresh)_token$/.test(x)).sort(),refreshRequests,body:after.body,seen};
 fs.writeFileSync('reports/quarterfull-api-probe.json',JSON.stringify(report,null,2));
 console.log('QF_API_PROBE_OK');
 console.log(JSON.stringify({initialTokenKeys:report.initialTokenKeys,afterTokenKeys:report.afterTokenKeys,refreshRequests:report.refreshRequests,responses:seen.map(x=>({url:x.url,status:x.status,body:x.body}))},null,2));
 await browser.close();
})().catch(async e=>{try{if(ctx)await persistState(ctx,'quarterfull');}catch{}try{if(browser)await browser.close();}catch{}console.error(e);process.exit(1)});
