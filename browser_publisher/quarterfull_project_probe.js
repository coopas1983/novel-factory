const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:loadState('quarterfull')});
 const page=await ctx.newPage();
 await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(3000);
 // Select the newly created project without creating another one.
 const project=page.getByText('새 작품',{exact:true}).first();
 if(await project.count()&&await project.isVisible()){await project.click();await page.waitForTimeout(1200);}
 const report=await page.evaluate(()=>({
   url:location.href,
   body:document.body.innerText.slice(0,26000),
   editable:[...document.querySelectorAll('input,textarea,[contenteditable="true"],[role="textbox"]')].map((e,i)=>({i,tag:e.tagName,value:e.value||'',text:(e.innerText||e.textContent||'').slice(0,500),placeholder:e.getAttribute('placeholder'),aria:e.getAttribute('aria-label'),testid:e.getAttribute('data-testid'),contenteditable:e.getAttribute('contenteditable'),visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length),html:e.outerHTML.slice(0,2200)})).filter(x=>x.visible),
   newProjectNodes:[...document.querySelectorAll('button,div,span,a')].map((e,i)=>({i,text:(e.innerText||e.textContent||'').replace(/\s+/g,' ').trim(),aria:e.getAttribute('aria-label'),testid:e.getAttribute('data-testid'),visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length),html:e.outerHTML.slice(0,1800)})).filter(x=>x.visible&&x.text==='새 작품').slice(0,40),
   titleish:[...document.querySelectorAll('button,input,[contenteditable="true"],[role="textbox"]')].map((e,i)=>({i,text:(e.innerText||e.textContent||e.value||'').replace(/\s+/g,' ').trim(),aria:e.getAttribute('aria-label'),placeholder:e.getAttribute('placeholder'),testid:e.getAttribute('data-testid'),html:e.outerHTML.slice(0,1600),visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)})).filter(x=>x.visible&&/(작품|제목|title|이름|name|1화)/i.test((x.text||'')+' '+(x.aria||'')+' '+(x.placeholder||''))).slice(0,100)
 }));
 fs.mkdirSync('reports',{recursive:true}); fs.writeFileSync('reports/quarterfull-project-probe.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
