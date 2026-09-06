const { chromium } = require('playwright');
const { loadState } = require('./auth');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: loadState('quarterfull') });
  const page = await context.newPage();
  const out = [];
  async function snap(label) {
    out.push({label,url:page.url(),body:(await page.locator('body').innerText()).slice(0,26000),controls:await page.evaluate(()=>[...document.querySelectorAll('button,a,[role="button"],input,textarea')].map((e,i)=>({i,tag:e.tagName,text:(e.innerText||e.textContent||'').replace(/\s+/g,' ').trim().slice(0,300),aria:e.getAttribute('aria-label'),testid:e.getAttribute('data-testid'),placeholder:e.getAttribute('placeholder'),disabled:!!e.disabled||e.getAttribute('aria-disabled')==='true',visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length),rect:e.getBoundingClientRect().toJSON(),html:e.outerHTML.slice(0,1600)})).filter(x=>x.visible).slice(0,500))});
  }

  await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(3000);
  await snap('studio');

  const body=await page.locator('body').innerText();
  out.push({label:'auth-check',authenticated:body.includes('내 서재')&&body.includes('작가 혜택')});

  // The project header contains a nested 20x20 icon button at the far right.
  // Click that exact nested control, not the chapter/project title itself.
  const projectHeader=page.locator('button').filter({hasText:'판매용이 아닙니다 · 10화 없어진 것들'}).first();
  if(!await projectHeader.count()) throw new Error('PROJECT_HEADER_NOT_FOUND');
  const nested=projectHeader.locator('button').first();
  out.push({label:'nested-switcher',count:await nested.count(),visible:await nested.count()?await nested.isVisible():false});
  if(await nested.count() && await nested.isVisible()) {
    await nested.click();
  } else {
    const box=await projectHeader.boundingBox();
    if(!box) throw new Error('PROJECT_HEADER_NO_BOX');
    await page.mouse.click(box.x+box.width-14,box.y+box.height/2);
  }
  await page.waitForTimeout(1200);
  await snap('after-switcher-icon');

  const createCandidates=await page.evaluate(()=>[...document.querySelectorAll('button,[role="button"],a,div')].map((e,i)=>({i,text:(e.innerText||e.textContent||'').replace(/\s+/g,' ').trim(),aria:e.getAttribute('aria-label'),testid:e.getAttribute('data-testid'),visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length),html:e.outerHTML.slice(0,1400)})).filter(x=>x.visible&&/(새 프로젝트|프로젝트 만들기|프로젝트 추가|새 작품|작품 만들기|create project|new project|start creating|추가)/i.test(x.text+' '+(x.aria||''))).slice(0,100));
  out.push({label:'create-candidates',createCandidates});

  fs.mkdirSync('reports',{recursive:true});
  fs.writeFileSync('reports/quarterfull-project-probe.json',JSON.stringify({snapshots:out},null,2));
  console.log(JSON.stringify({snapshots:out},null,2));
  await browser.close();
})().catch(err=>{console.error(err);process.exit(1);});
