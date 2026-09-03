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

 const url=site==="novelpia"
   ? (process.env.NOVELPIA_WRITE_URL || "https://novelpia.com/mynovel/all/write/450743")
   : (process.env.QUARTERFULL_STUDIO_URL || "https://quarterfull.io/studio-cursor");

 await page.goto(url,{waitUntil:"domcontentloaded",timeout:60000});
 await page.waitForTimeout(2500);

 const report=await page.evaluate(()=>{
   const clean=s=>(s||"").replace(/\s+/g," ").trim().slice(0,180);
   const els=[...document.querySelectorAll("input,textarea,select,button,[contenteditable=true]")];
   return {
     url:location.href,
     title:document.title,
     controls:els.map((e,i)=>({
       i,tag:e.tagName.toLowerCase(),type:e.getAttribute("type"),
       name:e.getAttribute("name"),id:e.id||null,
       placeholder:e.getAttribute("placeholder"),
       aria:e.getAttribute("aria-label"),
       text:clean(e.innerText||e.value),
       contenteditable:e.getAttribute("contenteditable")
     })).slice(0,250)
   };
 });
 fs.mkdirSync("reports",{recursive:true});
 fs.writeFileSync(`reports/${site}-controls.json`,JSON.stringify(report,null,2));
 console.log("INSPECT_OK",site,"controls="+report.controls.length,"url="+report.url);
 await browser.close();
})().catch(e=>{console.error(String(e));process.exit(1)});
