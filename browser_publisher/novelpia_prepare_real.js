const {chromium}=require("playwright");
const {loadState}=require("./auth");
const fs=require("fs"), path=require("path"), crypto=require("crypto");

function findChapter(){
 const candidates=[
  "../books/live-gemini-pilot/chapters/chapter-1.md",
  "../books/live-gemini-pilot/chapter-1.md"
 ];
 for(const p of candidates) if(fs.existsSync(p)) return p;
 throw new Error("REAL_CHAPTER_NOT_FOUND");
}
(async()=>{
 const state=loadState("novelpia");
 const chapterPath=findChapter();
 let body=fs.readFileSync(chapterPath,"utf8").trim();
 body=body.replace(/^#.+\n+/,"").trim();
 if(body.length<1000) throw new Error("CHAPTER_TOO_SHORT_FOR_REAL_PREP");

 const episode="1";
 const digest=crypto.createHash("sha256").update(body).digest("hex");
 const ledgerPath="../books/live-gemini-pilot/publish/ledger.json";
 let ledger={};
 if(fs.existsSync(ledgerPath)) ledger=JSON.parse(fs.readFileSync(ledgerPath,"utf8"));
 const key=`novelpia:${episode}`;
 if(ledger[key]?.status==="published") throw new Error("DUPLICATE_BLOCKED_ALREADY_PUBLISHED");

 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({storageState:state});
 const page=await ctx.newPage();
 await page.goto(process.env.NOVELPIA_WRITE_URL||"https://novelpia.com/mynovel/all/write/450743",
   {waitUntil:"domcontentloaded",timeout:60000});
 await page.waitForTimeout(1200);

 await page.locator("#content_subject").fill("1화. 자정 이후의 전화");
 await page.locator("#content_cate").selectOption({label:"연재회차"});
 await page.locator("#content_adult").selectOption({label:"전체 열람가능"});
 await page.locator("#paste_mode").selectOption({label:"원본 붙여넣기"});
 await page.locator("#summernote").evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));},body);
 const editable=page.locator(".note-editable").first();
 if(await editable.count()) await editable.fill(body);

 const report={
   platform:"novelpia", episode:1, title:"1화. 자정 이후의 전화",
   body_chars:body.length, sha256:digest,
   form_filled:true, submit_clicked:false, published:false,
   safety:"PREPARE_ONLY"
 };
 fs.mkdirSync("reports",{recursive:true});
 fs.writeFileSync("reports/novelpia-real-episode-prep.json",JSON.stringify(report,null,2));
 console.log("REAL_EPISODE_PREP_OK",JSON.stringify(report));
 await browser.close();
})().catch(e=>{console.error(String(e));process.exit(1)});
