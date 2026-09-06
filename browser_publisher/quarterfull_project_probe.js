const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 const report={phase:'safe-episode-create-control-probe',events:[]};
 try{
  await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000}); await page.waitForTimeout(7000);
  const target=page.getByText('자정 이후의 콜센터',{exact:true}).first();
  report.events.push({targetCount:await target.count()});
  if(!(await target.count())) throw new Error('SAFETY target missing');
  await target.click(); await page.waitForTimeout(1800);
  const body0=await page.locator('body').innerText();
  if(!body0.includes('작업 중: 자정 이후의 콜센터')) throw new Error('SAFETY target not active');
  const ep1=page.getByText('/원고(출간용)/1화',{exact:true}).first();
  if(!(await ep1.count())) throw new Error('SAFETY ep1 missing');
  await ep1.click(); await page.waitForTimeout(1200);
  const editor=page.locator('[contenteditable=true].ProseMirror').first();
  if(!(await editor.count()) || !(await editor.innerText()).includes('알람이 울리기도 전에 눈이 먼저 뜨였다.')) throw new Error('SAFETY wrong editor');
  const folder=page.getByText('/원고(출간용)',{exact:true}).first();
  if(!(await folder.count())) throw new Error('folder missing');
  await folder.hover(); await page.waitForTimeout(1000);
  const near=folder.locator('xpath=ancestor::*[self::div or self::li][1]');
  report.folderHTML=(await near.count())?(await near.evaluate(e=>e.outerHTML)).slice(0,20000):'';
  report.controls=await page.locator('button,[role=button],[role=menuitem],a').evaluateAll(es=>es.map((e,i)=>({i,text:(e.innerText||'').trim(),aria:e.getAttribute('aria-label'),title:e.getAttribute('title'),testid:e.getAttribute('data-testid'),visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length),box:e.getBoundingClientRect().toJSON(),html:e.outerHTML.slice(0,2200)})).filter(x=>x.visible));
  report.body=(await page.locator('body').innerText()).slice(0,22000);
  report.url=page.url(); report.ok=true;
 }catch(e){report.ok=false;report.error=String(e.stack||e);report.body=(await page.locator('body').innerText().catch(()=>'' )).slice(0,22000);}
 fs.mkdirSync('reports',{recursive:true}); fs.writeFileSync('reports/quarterfull-project-probe.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
 await browser.close(); if(!report.ok) process.exit(1);
})().catch(e=>{console.error(e);process.exit(1)});
