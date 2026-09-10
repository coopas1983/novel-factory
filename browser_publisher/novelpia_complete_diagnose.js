const {chromium}=require('playwright');
const {loadState}=require('./auth');
const fs=require('fs');
const NOVEL_ID='450743';
const urls=[`https://novelpia.com/novel/${NOVEL_ID}`,`https://novelpia.com/mynovel/all`];
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const ctx=await browser.newContext({storageState:loadState('NOVELPIA')});
    const page=await ctx.newPage();
    const report=[];
    for(const url of urls){
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
      await page.waitForTimeout(3000);
      const data=await page.evaluate(id=>{
        const body=(document.body?.innerText||'').slice(0,30000);
        const all=[...document.querySelectorAll('a,button,input,select')].map((e,i)=>({i,tag:e.tagName,text:(e.innerText||e.value||'').trim(),href:e.href||null,name:e.name||null,id:e.id||null}));
        return {url:location.href,title:document.title,body,controls:all.filter(x=>/완결|연재|작품|수정|관리|설정|상태|mynovel/i.test(`${x.text} ${x.href} ${x.name} ${x.id}`)).slice(0,120),novelLinks:all.filter(x=>String(x.href||'').includes(id)).slice(0,80)};
      },NOVEL_ID);
      report.push(data);
    }
    fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/novelpia-complete-diagnose.json',JSON.stringify(report,null,2));
    console.log('NOVELPIA_COMPLETE_DIAG_OK');console.log(JSON.stringify(report));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
