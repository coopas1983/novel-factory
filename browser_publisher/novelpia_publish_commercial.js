const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const { chromium }=require("playwright");
const { loadState }=require("./auth");

const normalize=s=>s.replace(/\r/g,"").replace(/\u00a0/g," ").replace(/[ \t]+\n/g,"\n").trim();
const escapeHtml=s=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const decodeHtml=s=>s.replace(/&nbsp;/gi," ").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&amp;/gi,"&");

(async()=>{
  if(process.env.CONFIRM_PUBLISH!=="YES") throw new Error("EXPLICIT_PUBLISH_CONFIRMATION_REQUIRED");
  const storageState=loadState("NOVELPIA");
  const chapterPath=path.join(__dirname,"..","books","live-gemini-pilot","commercial","chapter-1.md");
  const qualityPath=path.join(__dirname,"..","books","live-gemini-pilot","commercial","chapter-1-quality.json");
  let body=fs.readFileSync(chapterPath,"utf8").replace(/^#.*\n+/,"").trim();
  const quality=JSON.parse(fs.readFileSync(qualityPath,"utf8"));
  if(quality.gate!=="PASS"||quality.independent_reviewer!=="PASS"||quality.lexical_preflight!=="PASS") throw new Error("QUALITY_GATE_BLOCK");
  if((quality.issues||[]).length||(quality.final_review_issues||[]).length||(quality.lexical_preflight_final||[]).length) throw new Error("QUALITY_ISSUES_PRESENT");
  if(body.length<3500||body.length>4500) throw new Error("BODY_LENGTH_BLOCK");

  const expected=normalize(body);
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({storageState});
  const page=await context.newPage();
  await page.goto("https://novelpia.com/mynovel/all/write/450743",{waitUntil:"domcontentloaded",timeout:120000});

  await page.locator("#content_subject").fill("1화. 자정 이후의 전화");
  await page.locator("#content_cate").selectOption({label:"연재회차"});
  await page.locator("#content_adult").selectOption({label:"전체 열람가능"});
  await page.locator("#paste_mode").selectOption({label:"원본 붙여넣기"});
  const safeHtml=escapeHtml(body).replace(/\n/g,"<br>");
  const ok=await page.evaluate(html=>{
    if(window.jQuery?.fn?.summernote){
      window.jQuery("#summernote").summernote("code",html);
      window.jQuery("#summernote").trigger("change");
      return true;
    }
    return false;
  },safeHtml);
  if(!ok) throw new Error("SUMMERNOTE_API_REQUIRED");

  const source=await page.locator("#summernote").inputValue();
  const editor=page.locator(".note-editable").first();
  const editorText=normalize(await editor.innerText());
  const sourcePlain=normalize(decodeHtml(source.replace(/<br\s*\/?>/gi,"\n").replace(/<[^>]+>/g,"")));
  if(sourcePlain!==expected||editorText!==expected) throw new Error("PRE_SUBMIT_READBACK_MISMATCH");

  // Publish only after exact readback and explicit workflow confirmation.
  // Discover the form's real submit control rather than guessing by text.
  const submit=page.locator('form button[type="submit"], form input[type="submit"]').last();
  if(!(await submit.count())) throw new Error("SUBMIT_CONTROL_NOT_FOUND");
  await Promise.all([
    page.waitForLoadState("domcontentloaded",{timeout:120000}).catch(()=>{}),
    submit.click()
  ]);
  await page.waitForTimeout(2500);

  const url=page.url();
  const stillWrite=/\/mynovel\/all\/write\//.test(url);
  const bodyText=(await page.locator("body").innerText()).slice(0,10000);
  const hasError=/오류|실패|필수|입력해|확인해|잘못/.test(bodyText);
  if(stillWrite && hasError) throw new Error("PUBLISH_FORM_REJECTED");

  const report={
    platform:"novelpia",episode:1,title:"1화. 자정 이후의 전화",
    chars:expected.length,
    manuscript_sha256:crypto.createHash("sha256").update(body,"utf8").digest("hex"),
    pre_submit_exact_match:true,submit_clicked:true,
    post_submit_url:url,
    published:!stillWrite,
    status:!stillWrite?"PUBLISH_NAVIGATION_CONFIRMED":"SUBMIT_CLICKED_NEEDS_SITE_CONFIRMATION"
  };
  fs.mkdirSync(path.join(__dirname,"reports"),{recursive:true});
  fs.writeFileSync(path.join(__dirname,"reports","novelpia-publish.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  await browser.close();
  if(stillWrite) process.exitCode=2;
})().catch(e=>{console.error(e);process.exit(1);});
