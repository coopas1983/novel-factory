const { chromium } = require('playwright');
const { loadState } = require('./auth');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: loadState('quarterfull') });
  const page = await context.newPage();
  const out = [];
  async function snap(label) {
    out.push({
      label,
      url: page.url(),
      body: (await page.locator('body').innerText()).slice(0, 26000),
      controls: await page.evaluate(() => [...document.querySelectorAll('button,a,[role="button"],input,textarea')].map((e,i)=>({
        i,
        tag:e.tagName,
        text:(e.innerText||e.textContent||'').replace(/\s+/g,' ').trim().slice(0,300),
        aria:e.getAttribute('aria-label'),
        testid:e.getAttribute('data-testid'),
        placeholder:e.getAttribute('placeholder'),
        disabled:!!e.disabled||e.getAttribute('aria-disabled')==='true',
        visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length),
        html:e.outerHTML.slice(0,1400)
      })).filter(x=>x.visible).slice(0,500))
    });
  }

  await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(2500);
  await snap('studio');

  const body = await page.locator('body').innerText();
  out.push({label:'auth-check',authenticated:body.includes('내 서재')&&body.includes('작가 혜택')});

  // Open the active-project selector. This is the safest path because the
  // currently selected project is already a published unrelated work.
  const active = page.getByText(/판매용이 아닙니다.*10화 없어진 것들/).first();
  if (await active.count() && await active.isVisible()) {
    await active.click();
    await page.waitForTimeout(1200);
    await snap('after-project-selector');
  } else {
    out.push({label:'project-selector-not-found'});
  }

  // Inspect any text/controls that look like project creation, without creating
  // anything yet. We only need the exact actionable selector in this probe.
  const creationHints = await page.evaluate(() => [...document.querySelectorAll('button,[role="button"],a,div,span')]
    .map((e,i)=>({i,text:(e.innerText||e.textContent||'').replace(/\s+/g,' ').trim(),aria:e.getAttribute('aria-label'),testid:e.getAttribute('data-testid'),html:e.outerHTML.slice(0,1200),visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)}))
    .filter(x=>x.visible && /(새 프로젝트|프로젝트 만들기|새 작품|작품 만들기|new project|create project|프로젝트 추가|새로 만들기)/i.test(x.text+' '+(x.aria||'')))
    .slice(0,100));
  out.push({label:'creation-hints',creationHints});

  fs.mkdirSync('reports',{recursive:true});
  fs.writeFileSync('reports/quarterfull-project-probe.json',JSON.stringify({snapshots:out},null,2));
  console.log(JSON.stringify({snapshots:out},null,2));
  await browser.close();
})().catch(err=>{console.error(err);process.exit(1);});
