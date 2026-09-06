const { chromium } = require('playwright');
const { loadState } = require('./auth');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: loadState('quarterfull') });
  const page = await context.newPage();
  const out = [];
  async function snap(label) {
    out.push({ label, url: page.url(), body: (await page.locator('body').innerText()).slice(0,26000), controls: await page.evaluate(() => [...document.querySelectorAll('button,a,[role="button"],input,textarea')].map((e,i)=>({i,tag:e.tagName,text:(e.innerText||e.textContent||'').replace(/\s+/g,' ').trim().slice(0,300),aria:e.getAttribute('aria-label'),testid:e.getAttribute('data-testid'),placeholder:e.getAttribute('placeholder'),disabled:!!e.disabled||e.getAttribute('aria-disabled')==='true',visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)})).filter(x=>x.visible).slice(0,400)) });
  }

  await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(2500);
  await snap('studio');

  const body = await page.locator('body').innerText();
  const authenticated = body.includes('내 서재') && body.includes('작가 혜택');
  out.push({label:'auth-check',authenticated});

  // Refreshed auth reveals that the historical project DOES exist. Open its
  // management flow instead of trying to create a duplicate project.
  const projectText = page.getByText('판매용이 아닙니다',{exact:true});
  out.push({label:'existing-project',present:(await projectText.count())>0});

  const manage = page.getByRole('button',{name:'관리'});
  if (await manage.count() && await manage.first().isVisible()) {
    await manage.first().click();
    await page.waitForTimeout(1500);
    await snap('after-manage');
  }

  // Also inspect the selected project chip if management did not navigate.
  const selected = page.getByText(/판매용이 아닙니다.*10화 없어진 것들/).first();
  if (await selected.count() && await selected.isVisible()) {
    await selected.click().catch(()=>{});
    await page.waitForTimeout(1200);
    await snap('after-project-chip');
  }

  fs.mkdirSync('reports',{recursive:true});
  fs.writeFileSync('reports/quarterfull-project-probe.json',JSON.stringify({snapshots:out},null,2));
  console.log(JSON.stringify({snapshots:out},null,2));
  await browser.close();
})().catch(err=>{console.error(err);process.exit(1);});
