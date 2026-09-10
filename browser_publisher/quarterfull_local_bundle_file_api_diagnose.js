const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROFILE = process.env.QUARTERFULL_PROFILE_DIR || path.join(process.env.LOCALAPPDATA || '', 'NovelFactory', 'QuarterFullProfile');
const REPORT_DIR = path.join(__dirname, 'reports');
fs.mkdirSync(REPORT_DIR, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async()=>{
 let ctx;
 try{
  ctx=await chromium.launchPersistentContext(PROFILE,{channel:'chrome',headless:true,args:['--profile-directory=Default']});
  const page=ctx.pages()[0]||await ctx.newPage();
  await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'networkidle',timeout:60000}).catch(()=>{});
  await sleep(4000);
  const srcs=await page.locator('script[src]').evaluateAll(ns=>ns.map(n=>n.src).filter(Boolean));
  const hits=[];
  for(const src of srcs){
    try{
      const text=await (await page.request.get(src,{timeout:30000})).text();
      const patterns=[/files\/(?:move|rename|write|create|delete|copy|mkdir)[^"'`\s)]*/gi,/\/(?:move|rename|write|create|delete|copy)(?:-file|_file|File)?[^"'`\s)]*/gi,/bookstore-chapters[^"'`\s)]*/gi];
      const found=[];
      for(const re of patterns){
        for(const m of text.matchAll(re)){
          const i=m.index||0;
          const snip=text.slice(Math.max(0,i-180),Math.min(text.length,i+360)).replace(/\s+/g,' ');
          if(!found.some(x=>x.match===m[0])) found.push({match:m[0],snippet:snip});
          if(found.length>=30) break;
        }
      }
      if(found.length) hits.push({src,found});
    }catch{}
  }
  const report={mode:'BUNDLE_FILE_API_READ_ONLY',scripts:srcs.length,hits};
  fs.writeFileSync(path.join(REPORT_DIR,'quarterfull-local-bundle-file-api.json'),JSON.stringify(report,null,2));
  console.log('QF_BUNDLE_FILE_API_DIAGNOSE_OK');
  console.log(JSON.stringify(report));
 }finally{if(ctx)await ctx.close();}
})().catch(e=>{console.error(e);process.exit(1)});