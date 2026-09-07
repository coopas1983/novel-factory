const {chromium}=require("playwright");
const {loadState}=require("./auth");
const fs=require("fs");

(async()=>{
 const site=process.argv[2];
 if(!["novelpia","quarterfull"].includes(site)) throw new Error("site required");
 const state=loadState(site);
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:state});
 const page=await ctx.newPage();
 const url=site==="novelpia" ? (process.env.NOVELPIA_WRITE_URL || "https://novelpia.com/mynovel/all/write/450743") : (process.env.QUARTERFULL_STUDIO_URL || "https://quarterfull.io/studio-cursor");
 await page.goto(url,{waitUntil:"domcontentloaded",timeout:60000});
 await page.waitForTimeout(3500);
 const report=await page.evaluate(()=>{
   const clean=s=>(s||"").replace(/\s+/g," ").trim().slice(0,260);
   const els=[...document.querySelectorAll("input,textarea,select,button,[contenteditable=true]")];
   const controls=els.map((e,i)=>({i,tag:e.tagName.toLowerCase(),type:e.getAttribute("type"),name:e.getAttribute("name"),id:e.id||null,placeholder:e.getAttribute("placeholder"),aria:e.getAttribute("aria-label"),title:e.getAttribute("title"),disabled:!!e.disabled,text:clean(e.innerText||e.value),contenteditable:e.getAttribute("contenteditable")})).slice(0,400);
   const ai=[...document.querySelectorAll('textarea')].find(e=>(e.getAttribute('placeholder')||'').includes('무엇을 만들고 싶은지'));
   let aiContext=null;
   if(ai){
     const parent=ai.parentElement;
     const grand=parent&&parent.parentElement;
     const root=grand||parent;
     aiContext={parentTag:parent&&parent.tagName,grandTag:grand&&grand.tagName,nearby:[...(root?root.querySelectorAll('button,[role=button],textarea,input'):[])].map((e,i)=>({i,tag:e.tagName.toLowerCase(),type:e.getAttribute('type'),aria:e.getAttribute('aria-label'),title:e.getAttribute('title'),text:clean(e.innerText||e.value),disabled:!!e.disabled,placeholder:e.getAttribute('placeholder')})).slice(0,80)};
   }
   return {url:location.href,title:document.title,body:clean(document.body.innerText).slice(0,12000),controls,aiContext};
 });
 fs.mkdirSync("reports",{recursive:true});
 fs.writeFileSync(`reports/${site}-controls.json`,JSON.stringify(report,null,2));
 console.log("INSPECT_OK",site,"controls="+report.controls.length,"url="+report.url);
 console.log(JSON.stringify({aiContext:report.aiContext,body:report.body},null,2));
 await browser.close();
})().catch(e=>{console.error(String(e));process.exit(1)});
