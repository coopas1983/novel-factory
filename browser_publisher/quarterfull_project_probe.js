const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');
const norm=s=>s.replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n+/g,'\n').trim();
(async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 const report={phase:'episode2-insert-verify',events:[]};
 try{
  const source=fs.readFileSync('../books/live-gemini-pilot/commercial/chapter-2.md','utf8');
  if(!source.includes('2화. 규칙 확인')||!source.includes('[발신자 : 강이현]')) throw new Error('SAFETY frozen ep2 source mismatch');
  await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000}); await page.waitForTimeout(7000);
  const target=page.getByText('자정 이후의 콜센터',{exact:true}).first(); if(!(await target.count())) throw new Error('SAFETY target missing'); await target.click(); await page.waitForTimeout(1200);
  if(!(await page.locator('body').innerText()).includes('작업 중: 자정 이후의 콜센터')) throw new Error('SAFETY target not active');
  const ep2=page.getByText('/원고(출간용)/2화',{exact:true}).first(); if(!(await ep2.count())) throw new Error('SAFETY ep2 missing'); await ep2.click(); await page.waitForTimeout(1000);
  const editor=page.locator('[contenteditable=true].ProseMirror').first(); if(!(await editor.count())) throw new Error('SAFETY editor missing');
  const before=await editor.innerText();
  if(norm(before).length>20) throw new Error('SAFETY ep2 not empty before insert');
  await editor.click(); await page.keyboard.press('Control+A'); await page.keyboard.insertText(source); await page.waitForTimeout(2500);
  const readback=await editor.innerText();
  report.sourceNorm=norm(source).length; report.readbackNorm=norm(readback).length; report.normalizedExact=norm(source)===norm(readback);
  report.hasEnding=readback.includes('[발신자 : 강이현]'); report.activeTarget=(await page.locator('body').innerText()).includes('작업 중: 자정 이후의 콜센터');
  if(!report.activeTarget||!report.normalizedExact||!report.hasEnding) throw new Error('SAFETY ep2 readback mismatch');
  await page.waitForTimeout(3000);
  report.body=(await page.locator('body').innerText()).slice(0,12000); report.ok=true;
 }catch(e){report.ok=false;report.error=String(e.stack||e);report.body=(await page.locator('body').innerText().catch(()=>'' )).slice(0,12000);}
 fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/quarterfull-project-probe.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 await browser.close(); if(!report.ok)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1)});
