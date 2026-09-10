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
  await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
  await sleep(7000);
  const help=page.locator('button[aria-label="회차 출간 안내"]').first();
  if(!(await help.isVisible().catch(()=>false))) throw new Error('HELP_BUTTON_NOT_VISIBLE');
  await help.click({force:true});
  await sleep(2000);
  const dialogs=await page.locator('[role="dialog"], [role="tooltip"], [role="menu"], [data-radix-popper-content-wrapper]').evaluateAll(ns=>ns.map(n=>String(n.textContent||'').trim()).filter(Boolean));
  const body=(await page.locator('body').innerText()).split(/\r?\n/).map(s=>s.trim()).filter(Boolean).filter(s=>/출간|원고|폴더|회차|파일|서점|공개/i.test(s)).slice(-120);
  const report={mode:'CHAPTER_PUBLISH_HELP_READ_ONLY',dialogs,body};
  fs.writeFileSync(path.join(REPORT_DIR,'quarterfull-local-chapter-publish-help.json'),JSON.stringify(report,null,2));
  console.log('QF_CHAPTER_PUBLISH_HELP_OK'); console.log(JSON.stringify(report));
 }finally{if(ctx)await ctx.close();}
})().catch(e=>{console.error(e);process.exit(1)});