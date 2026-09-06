const { chromium } = require('playwright');
const { loadState } = require('./auth');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: loadState('quarterfull') });
  const page = await context.newPage();
  const out = [];
  async function snap(label) {
    out.push({label,url:page.url(),body:(await page.locator('body').innerText()).slice(0,26000),controls:await page.evaluate(()=>[...document.querySelectorAll('button,a,[role="button"],input,textarea')].map((e,i)=>({i,tag:e.tagName,text:(e.innerText||e.textContent||'').replace(/\s+/g,' ').trim().slice(0,300),aria:e.getAttribute('aria-label'),testid:e.getAttribute('data-testid'),placeholder:e.getAttribute('placeholder'),disabled:!!e.disabled||e.getAttribute('aria-disabled')==='true',visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length),html:e.outerHTML.slice(0,1400)})).filter(x=>x.visible).slice(0,500))});
  }
  await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(3000);
  await snap('studio');
  const body=await page.locator('body').innerText();
  out.push({label:'auth-check',authenticated:/(Library|내 서재)/i.test(body)&&/(Writer Benefits|작가 혜택)/i.test(body)});

  // Capture likely selector/create controls, including icon-only controls.
  const candidates=await page.evaluate(()=>[...document.querySelectorAll('button,[role="button"],a')].map((e,i)=>({i,text:(e.innerText||e.textContent||'').replace(/\s+/g,' ').trim(),aria:e.getAttribute('aria-label'),title:e.getAttribute('title'),testid:e.getAttribute('data-testid'),disabled:!!e.disabled||e.getAttribute('aria-disabled')==='true',visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length),rect:e.getBoundingClientRect().toJSON(),html:e.outerHTML.slice(0,1600)})).filter(x=>x.visible&&!x.disabled));
  out.push({label:'all-enabled-actions',candidates:candidates.slice(0,250)});

  // Try explicit project selector text if present, otherwise click the safest unique icon-only
  // button near the Studio project area. This does not submit/publish anything.
  const selectorText=page.getByText(/판매용이 아닙니다|없어진 것들|No projects yet/i).first();
  if(await selectorText.count()&&await selectorText.isVisible()){
    await selectorText.click().catch(()=>{}); await page.waitForTimeout(1200); await snap('after-selector-text');
  }
  const createText=page.getByRole('button',{name:/새 프로젝트|프로젝트 만들기|새 작품|작품 만들기|create project|new project|start creating/i}).first();
  if(await createText.count()&&await createText.isVisible()&&await createText.isEnabled()){
    await createText.click(); await page.waitForTimeout(1200); await snap('after-explicit-create');
  } else {
    const iconButtons=page.locator('button:visible').filter({hasNotText:/\S/});
    const n=await iconButtons.count();
    out.push({label:'icon-only-count',count:n});
    if(n===1){await iconButtons.first().click(); await page.waitForTimeout(1200); await snap('after-unique-icon-button');}
  }

  fs.mkdirSync('reports',{recursive:true});
  fs.writeFileSync('reports/quarterfull-project-probe.json',JSON.stringify({snapshots:out},null,2));
  console.log(JSON.stringify({snapshots:out},null,2));
  await browser.close();
})().catch(err=>{console.error(err);process.exit(1);});
