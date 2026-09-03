const {chromium}=require("playwright");
const {loadState}=require("./auth");
const fs=require("fs");

(async()=>{
 const site=process.argv[2];
 if(site!=="novelpia") throw new Error("v0.13 draft-fill supports novelpia first");
 const state=loadState(site);
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:state});
 const page=await ctx.newPage();
 const url=process.env.NOVELPIA_WRITE_URL || "https://novelpia.com/mynovel/all/write/450743";
 await page.goto(url,{waitUntil:"domcontentloaded",timeout:60000});
 await page.waitForTimeout(1500);

 const title=process.env.DRAFT_TITLE || "[자동화 테스트] 저장하지 않음";
 const body=process.env.DRAFT_BODY || "자동입력 검증용 본문입니다. 이 내용은 저장하거나 공개하지 않습니다.";

 await page.locator("#content_subject").fill(title);
 await page.locator("#content_cate").selectOption({label:"연재회차"});
 await page.locator("#content_adult").selectOption({label:"전체 열람가능"});
 await page.locator("#paste_mode").selectOption({label:"원본 붙여넣기"});

 // Summernote source textarea + editable area.
 await page.locator("#summernote").evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));},body);
 const editable=page.locator(".note-editable").first();
 if(await editable.count()) await editable.fill(body);

 const report={
   url:page.url(),
   title_value:await page.locator("#content_subject").inputValue(),
   category:await page.locator("#content_cate").inputValue(),
   visibility:await page.locator("#content_adult").inputValue(),
   paste_mode:await page.locator("#paste_mode").inputValue(),
   body_chars:(await page.locator("#summernote").inputValue()).length,
   submitted:false,
   published:false
 };
 fs.mkdirSync("reports",{recursive:true});
 fs.writeFileSync("reports/novelpia-draft-fill.json",JSON.stringify(report,null,2));
 console.log("DRAFT_FILL_OK",JSON.stringify(report));
 await browser.close();
})().catch(e=>{console.error(String(e));process.exit(1)});
