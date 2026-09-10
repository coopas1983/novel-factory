const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');
const redact=s=>String(s||'').replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [REDACTED]').replace(/"(access_token|refresh_token|token|authorization|cookie)"\s*:\s*"[^"]*"/gi,'"$1":"[REDACTED]"');
(async()=>{
 const initial=loadState('quarterfull');
 const initialKeys=[];
 for(const o of (initial.origins||[])) for(const e of (o.localStorage||[])) if(/^cravi_(access|refresh)_token$/.test(e.name)) initialKeys.push(e.name);
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:initial});
 const page=await ctx.newPage();
 const seen=[]; const refreshRequests=[]; const bundleHints=[];
 page.on('request',req=>{
   const u=req.url();
   if(!/api\.quarterfull\.io\/api\/auth\/token\/refresh/.test(u)) return;
   let postKeys=[]; try{const p=req.postDataJSON(); if(p&&typeof p==='object') postKeys=Object.keys(p);}catch{}
   refreshRequests.push({url:u,method:req.method(),headerNames:Object.keys(req.headers()).sort(),postKeys});
 });
 page.on('response',async r=>{
   const u=r.url(); const ct=(r.headers()['content-type']||'');
   if(/quarterfull\.io\/_expo\/static\/js\/web\/(entry|__common)/.test(u)){
     let text=''; try{text=await r.text();}catch{}
     for(const needle of ['api/auth/token/refresh','cravi_refresh_token','cravi_access_token']){
       const idx=text.indexOf(needle); if(idx>=0) bundleHints.push({url:u,needle,snippet:redact(text.slice(Math.max(0,idx-1800),Math.min(text.length,idx+3500)))});
     }
   }
   if(!/quarterfull\.io|api\./i.test(u)||!/json|text/.test(ct)||!/(project|studio|auth|refresh)/i.test(u)) return;
   let body=''; try{body=(await r.text()).slice(0,8000);}catch{}
   seen.push({url:u,status:r.status(),contentType:ct,body:redact(body)});
 });
 await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'networkidle',timeout:60000}).catch(()=>{});
 await page.waitForTimeout(4000);
 const after=await page.evaluate(()=>({local:Object.keys(localStorage),body:(document.body.innerText||'').slice(0,5000)}));
 fs.mkdirSync('reports',{recursive:true});
 const report={initialTokenKeys:initialKeys.sort(),afterTokenKeys:after.local.filter(x=>/^cravi_(access|refresh)_token$/.test(x)).sort(),refreshRequests,seen,bundleHints};
 fs.writeFileSync('reports/quarterfull-api-probe.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({initialTokenKeys:report.initialTokenKeys,afterTokenKeys:report.afterTokenKeys,refreshRequests,seen,bundleHints},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
