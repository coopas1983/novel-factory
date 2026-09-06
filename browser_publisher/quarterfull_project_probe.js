const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(3000);
 // The prior run saved the title before failing its intro heuristic, so support either label.
 let projectNode=page.getByText('자정 이후의 콜센터',{exact:true}).last();
 if(!(await projectNode.count())) projectNode=page.getByText('새 작품',{exact:true}).last();
 if(!(await projectNode.count())) throw new Error('SAFETY: target project missing');
 if(await projectNode.isVisible()){await projectNode.click();await page.waitForTimeout(700);}
 const episodePath=page.getByText('/원고(출간용)/1화',{exact:true}).first();
 if(!(await episodePath.count())) throw new Error('SAFETY: episode 1 path missing');
 await episodePath.click(); await page.waitForTimeout(700);
 const editor=page.locator('[contenteditable=true].ProseMirror').first();
 if(!(await editor.count())) throw new Error('SAFETY: episode editor missing');
 const editorText=(await editor.innerText()).replace(/\u00a0/g,' ');
 if(!editorText.includes('알람이 울리기도 전에 눈이 먼저 뜨였다.') || !editorText.includes('평생을 바쳐 갚아야 할 빚을 직접 걸었지.')) throw new Error('SAFETY: frozen chapter 1 body incomplete');
 const prep=page.getByRole('button',{name:'출간 준비'}).first();
 if(!(await prep.count())) throw new Error('publication setup button missing');
 await prep.click(); await page.waitForTimeout(900);
 const dialog=page.locator('[role=dialog]').last();
 if(!(await dialog.count()) || !(await dialog.innerText()).includes('작품 관리')) throw new Error('management dialog missing');
 const titleInput=dialog.locator('input[placeholder="작품 제목을 입력해 주세요."]');
 if((await titleInput.inputValue())!=='자정 이후의 콜센터'){
   await titleInput.fill('자정 이후의 콜센터');
   const save=dialog.getByRole('button',{name:'작품 제목 저장'}); if(await save.isEnabled()) await save.click();
   await page.waitForTimeout(900);
 }
 const genre=dialog.getByRole('button',{name:'공포/추리',exact:true});
 if(await genre.count()){await genre.click();await page.waitForTimeout(500);}
 const intro='빚 8천만 원에 짓눌린 야간 상담원 강이현. 자정 이후 7번 단말기에 걸려오는 비정상적인 전화는 현실의 죽음과 연결되고, 통화를 해결할 때마다 그의 빚이 실제로 사라진다. 그런데 어느 날, 발신자 이름에 자신의 이름이 뜬다.';
 const introBox=dialog.locator('textarea[placeholder="독자에게 보일 작품 소개를 적어주세요."]');
 await introBox.fill(intro);
 const introSave=dialog.getByRole('button',{name:'소개글 저장'}); if(await introSave.count()&&await introSave.isEnabled()) await introSave.click();
 await page.waitForTimeout(900);
 // Re-read persisted title and manuscript immediately before the irreversible publication click.
 if((await titleInput.inputValue())!=='자정 이후의 콜센터') throw new Error('SAFETY: title mismatch before publish');
 const publish=dialog.getByRole('button',{name:'출간',exact:true});
 if(!(await publish.count())) throw new Error('publish button missing');
 if(!(await publish.isEnabled())) throw new Error('publish button disabled');
 await publish.click();
 await page.waitForTimeout(1800);
 const body=(await page.locator('body').innerText()).slice(0,16000);
 const dialogs=await page.locator('[role=dialog]').allInnerTexts();
 const controls=await page.locator('button,[role=button],a').evaluateAll(els=>els.map(e=>({text:(e.innerText||'').trim(),aria:e.getAttribute('aria-label'),disabled:e.disabled||e.getAttribute('aria-disabled')})).filter(x=>x.text||x.aria));
 const report={phase:'publish-clicked',url:page.url(),body,dialogs,controls};
 fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/quarterfull-project-probe.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
