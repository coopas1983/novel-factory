const { chromium } = require('playwright');
const { loadState } = require('./auth');
const fs = require('fs');

(async()=>{
 const browser=await chromium.launch({headless:true});
 const out=[];
 async function snap(page,label,glyph){
   out.push({label,glyph,url:page.url(),body:(await page.locator('body').innerText()).slice(0,26000),controls:await page.evaluate(()=>[...document.querySelectorAll('button,a,[role="button"],input,textarea,[role="dialog"]')].map((e,i)=>({i,tag:e.tagName,text:(e.innerText||e.textContent||'').replace(/\s+/g,' ').trim().slice(0,500),aria:e.getAttribute('aria-label'),testid:e.getAttribute('data-testid'),placeholder:e.getAttribute('placeholder'),disabled:!!e.disabled||e.getAttribute('aria-disabled')==='true',visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length),html:e.outerHTML.slice(0,1800)})).filter(x=>x.visible).slice(0,500))});
 }
 for(const glyph of ['','','']){
   const ctx=await browser.newContext({storageState:loadState('quarterfull')});
   const page=await ctx.newPage();
   await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForTimeout(2500);
   const buttons=page.locator('button').filter({hasText:glyph});
   let target=null;
   for(let i=0;i<await buttons.count();i++){
     const b=buttons.nth(i); const box=await b.boundingBox();
     if(box && box.x>=400 && box.x<=520 && box.y<=70 && box.width<=50 && box.height<=50){target=b;break;}
   }
   out.push({label:'target',glyph,found:!!target});
   if(target){await target.click(); await page.waitForTimeout(1200); await snap(page,'after-click',glyph);}
   await ctx.close();
 }
 fs.mkdirSync('reports',{recursive:true});
 fs.writeFileSync('reports/quarterfull-project-probe.json',JSON.stringify({snapshots:out},null,2));
 console.log(JSON.stringify({snapshots:out},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
