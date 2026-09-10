const {chromium}=require('playwright');
const {loadState,persistState}=require('./auth');
let browser=null,ctx=null;
(async()=>{
  browser=await chromium.launch({headless:true});
  ctx=await browser.newContext({storageState:loadState('quarterfull')});
  const page=await ctx.newPage();
  let projectsStatus=null;
  page.on('response',r=>{
    if(r.url()==='https://api.quarterfull.io/api/v1/studio-cursor/projects') projectsStatus=r.status();
  });
  await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'networkidle',timeout:60000}).catch(()=>{});
  await page.waitForTimeout(3000);
  await persistState(ctx,'quarterfull');
  if(projectsStatus!==200) throw new Error(`QF_AUTH_KEEPALIVE_FAILED:${projectsStatus??'NO_PROJECT_RESPONSE'}`);
  console.log('QF_AUTH_KEEPALIVE_OK');
  await browser.close();
})().catch(async e=>{
  try{if(ctx)await persistState(ctx,'quarterfull');}catch{}
  try{if(browser)await browser.close();}catch{}
  console.error(e);
  process.exit(1);
});
