const {chromium}=require("playwright");
const {loadState}=require("./auth");
(async()=>{
 const site=process.argv[2];
 if(!["novelpia","quarterfull"].includes(site)) throw new Error("site required");
 const state=loadState(site);
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:state});
 const page=await ctx.newPage();
 const url=site==="novelpia" ? "https://novelpia.com/" : "https://quarterfull.io/";
 await page.goto(url,{waitUntil:"domcontentloaded",timeout:60000});
 console.log("AUTH_SMOKE",site,"url="+page.url(),"title="+await page.title());
 await browser.close();
})().catch(e=>{console.error(String(e));process.exit(1)});
