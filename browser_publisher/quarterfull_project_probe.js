const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 const report={phase:'episode2-ai-command-probe',events:[]};
 try{
  await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000}); await page.waitForTimeout(7000);
  const target=page.getByText('자정 이후의 콜센터',{exact:true}).first(); if(!(await target.count())) throw new Error('SAFETY target missing');
  await target.click(); await page.waitForTimeout(1500);
  if(!(await page.locator('body').innerText()).includes('작업 중: 자정 이후의 콜센터')) throw new Error('SAFETY target not active');
  const ep1=page.getByText('/원고(출간용)/1화',{exact:true}).first(); if(!(await ep1.count())) throw new Error('SAFETY ep1 missing'); await ep1.click(); await page.waitForTimeout(800);
  const editor=page.locator('[contenteditable=true].ProseMirror').first(); if(!(await editor.count())||!(await editor.innerText()).includes('알람이 울리기도 전에 눈이 먼저 뜨였다.')) throw new Error('SAFETY wrong editor');
  const box=page.locator('textarea[placeholder="무엇을 만들고 싶은지 말해주세요."]').first(); if(!(await box.count())) throw new Error('AI command box missing');
  const command='현재 작업 중인 작품 자정 이후의 콜센터에서 기존 1화는 절대 수정하지 말고, 원고(출간용) 폴더 아래에 새 문서 2화를 생성만 해줘. 2화 본문은 작성하거나 수정하지 마.';
  await box.fill(command); report.events.push('command-filled');
  const send=page.getByRole('button',{name:'전송'}).first(); if(!(await send.count())||await send.isDisabled()) throw new Error('send unavailable');
  await send.click(); report.events.push('command-sent');
  await page.waitForTimeout(12000);
  const body=await page.locator('body').innerText();
  report.body=body.slice(0,30000);
  report.hasEp2Path=body.includes('/원고(출간용)/2화');
  report.hasEp1Path=body.includes('/원고(출간용)/1화');
  report.activeTarget=body.includes('작업 중: 자정 이후의 콜센터');
  report.aiResponse=body.slice(0,12000);
  if(!report.activeTarget||!report.hasEp1Path) throw new Error('SAFETY project/ep1 lost after AI command');
  report.ok=true;
 }catch(e){report.ok=false;report.error=String(e.stack||e);report.body=(await page.locator('body').innerText().catch(()=>'' )).slice(0,30000);}
 fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/quarterfull-project-probe.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 await browser.close(); if(!report.ok)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1)});
