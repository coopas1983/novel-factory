const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(3000);
 const projectNode=page.getByText('새 작품',{exact:true}).last();
 if(await projectNode.count()&&await projectNode.isVisible()){await projectNode.click();await page.waitForTimeout(700);}
 const episodePath=page.getByText('/원고(출간용)/1화',{exact:true}).first();
 if(await episodePath.count()){await episodePath.click();await page.waitForTimeout(700);}
 const header=page.getByText('새 작품 · 1화',{exact:false}).first();
 if(!(await header.count())) throw new Error('SAFETY: new project episode 1 header missing');
 const editor=page.locator('[contenteditable=true].ProseMirror').first();
 if(!(await editor.count())) throw new Error('SAFETY: episode editor missing');
 const editorText=(await editor.innerText()).replace(/\u00a0/g,' ');
 if(!editorText.includes('알람이 울리기도 전에 눈이 먼저 뜨였다.')) throw new Error('SAFETY: frozen chapter 1 body not present');
 const prep=page.getByRole('button',{name:'출간 준비'}).first();
 if(!(await prep.count())) throw new Error('publication setup button missing');
 await prep.click();
 await page.waitForTimeout(1200);
 const controls=await page.locator('button,[role=button],a,input,textarea,[contenteditable=true],[role=dialog]').evaluateAll(els=>els.map((e,i)=>({i,tag:e.tagName,text:(e.innerText||e.value||'').trim().slice(0,240),aria:e.getAttribute('aria-label'),title:e.getAttribute('title'),placeholder:e.getAttribute('placeholder'),testid:e.getAttribute('data-testid'),type:e.getAttribute('type'),value:e.value||null,outer:e.outerHTML.slice(0,700)})).filter(x=>x.text||x.aria||x.title||x.placeholder||x.testid||x.value));
 const body=(await page.locator('body').innerText()).slice(0,16000);
 const report={url:page.url(),phase:'publication-setup',controls,body};
 fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/quarterfull-project-probe.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
