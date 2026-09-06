const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 const report={phase:'episode2-create-via-ai-probe',events:[]};
 try{
  await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000}); await page.waitForTimeout(7000);
  const target=page.getByText('자정 이후의 콜센터',{exact:true}).first(); if(!(await target.count())) throw new Error('SAFETY target missing');
  await target.click(); await page.waitForTimeout(1600);
  if(!(await page.locator('body').innerText()).includes('작업 중: 자정 이후의 콜센터')) throw new Error('SAFETY target not active');
  const ep1=page.getByText('/원고(출간용)/1화',{exact:true}).first(); if(!(await ep1.count())) throw new Error('SAFETY ep1 missing');
  await ep1.click(); await page.waitForTimeout(1000);
  const editor=page.locator('[contenteditable=true].ProseMirror').first(); if(!(await editor.count()) || !(await editor.innerText()).includes('알람이 울리기도 전에 눈이 먼저 뜨였다.')) throw new Error('SAFETY wrong editor');
  const inputs=page.locator('textarea,input,[contenteditable=true]:not(.ProseMirror)');
  report.inputs=await inputs.evaluateAll(es=>es.map((e,i)=>({i,tag:e.tagName,placeholder:e.getAttribute('placeholder'),aria:e.getAttribute('aria-label'),testid:e.getAttribute('data-testid'),text:(e.innerText||'').slice(0,200),value:(e.value||'').slice(0,200),html:e.outerHTML.slice(0,1200)})));
  const all=page.locator('button,[role=button]');
  report.actionCandidates=await all.evaluateAll(es=>es.map((e,i)=>({i,text:(e.innerText||'').trim(),aria:e.getAttribute('aria-label'),testid:e.getAttribute('data-testid'),html:e.outerHTML.slice(0,1000)})).filter(x=>/문서|원고|추가|새|생성|작성|파일|폴더|회차|전송/.test((x.text||'')+' '+(x.aria||''))));
  report.body=(await page.locator('body').innerText()).slice(0,24000); report.ok=true;
 }catch(e){report.ok=false;report.error=String(e.stack||e);report.body=(await page.locator('body').innerText().catch(()=>'' )).slice(0,24000);}
 fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/quarterfull-project-probe.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 await browser.close(); if(!report.ok)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1)});
