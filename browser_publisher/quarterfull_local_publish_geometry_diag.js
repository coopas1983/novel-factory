const { chromium } = require('playwright');
const path = require('path');

const TARGET='자정 이후의 콜센터';
const PROFILE=path.join(process.env.LOCALAPPDATA||'','NovelFactory','QuarterFullProfile');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const ctx=await chromium.launchPersistentContext(PROFILE,{channel:'chrome',headless:true,args:['--profile-directory=Default']});
  try{
    const page=ctx.pages()[0]||await ctx.newPage();
    await page.setViewportSize({width:1440,height:1200});
    await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
    await sleep(6000);
    const nodes=page.getByText(TARGET,{exact:true}); let card=null;
    for(let i=0;i<await nodes.count();i++){
      const n=nodes.nth(i); if(!(await n.isVisible().catch(()=>false)))continue;
      const c=n.locator('xpath=ancestor::div[.//button[@aria-label="관리"]][1]'); if(await c.count()){card=c.first();break;}
    }
    if(!card)throw new Error('TARGET_CARD_NOT_FOUND');
    await card.locator('button[aria-label="관리"]').first().click({force:true}); await sleep(5000);
    const tab=page.getByRole('button',{name:'회차 관리',exact:true}); if(!(await tab.isVisible().catch(()=>false)))throw new Error('TAB_NOT_FOUND');
    await tab.click({force:true}); await sleep(3500);

    const report=await page.evaluate(()=>{
      const vis=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
      const box=el=>{const r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)}};
      const labels=[...document.querySelectorAll('*')].filter(el=>vis(el)&&['2화','3화','4화','5화','6화','7화','8화','9화','10화'].includes((el.textContent||'').trim())&&!el.children.length).map((el,i)=>({i,text:(el.textContent||'').trim(),tag:el.tagName,cls:String(el.className||'').slice(0,300),role:el.getAttribute('role'),aria:el.getAttribute('aria-label'),box:box(el),parents:(()=>{let p=el,a=[];for(let k=0;k<6&&p;k++,p=p.parentElement)a.push({tag:p.tagName,cls:String(p.className||'').slice(0,180),text:String(p.textContent||'').replace(/\s+/g,' ').trim().slice(0,500),box:box(p)});return a})()}));
      const pubs=[...document.querySelectorAll('button')].filter(b=>vis(b)&&((b.getAttribute('aria-label')||'')==='공개'||(b.textContent||'').trim().endsWith('공개'))).map((b,i)=>({i,text:(b.textContent||'').trim(),aria:b.getAttribute('aria-label'),disabled:!!b.disabled,box:box(b),parents:(()=>{let p=b,a=[];for(let k=0;k<6&&p;k++,p=p.parentElement)a.push({tag:p.tagName,cls:String(p.className||'').slice(0,180),text:String(p.textContent||'').replace(/\s+/g,' ').trim().slice(0,500),box:box(p)});return a})()}));
      return {labels,pubs,viewport:{w:innerWidth,h:innerHeight},scroll:{x:scrollX,y:scrollY}};
    });
    console.log('QF_PUBLISH_GEOMETRY_DIAG_OK');
    console.log(JSON.stringify(report));
  }finally{await ctx.close()}
})().catch(e=>{console.error(e);process.exit(1)});
