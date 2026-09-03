const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const { chromium }=require("playwright");
const { loadState }=require("./auth");

const escapeHtml=s=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const decodeHtml=s=>s.replace(/&nbsp;/gi," ").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&amp;/gi,"&");
const normalize=s=>s.replace(/\r/g,"").replace(/\u00a0/g," ").replace(/[ \t]+\n/g,"\n").trim();

(async()=>{
  const storageState=loadState("NOVELPIA");
  const chapterPath=path.join(__dirname,"..","books","live-gemini-pilot","commercial","chapter-1.md");
  const qualityPath=path.join(__dirname,"..","books","live-gemini-pilot","commercial","chapter-1-quality.json");
  if(!fs.existsSync(chapterPath)||!fs.existsSync(qualityPath)) throw new Error("COMMERCIAL_FILES_MISSING");

  let body=fs.readFileSync(chapterPath,"utf8").replace(/^#.*\n+/,"").trim();
  const quality=JSON.parse(fs.readFileSync(qualityPath,"utf8"));

  // Publication rehearsal is fail-closed: every currently installed final gate must pass.
  if(quality.gate!=="PASS") throw new Error("QUALITY_GATE_NOT_PASS");
  if(quality.independent_reviewer!=="PASS") throw new Error("INDEPENDENT_REVIEW_NOT_PASS");
  if(quality.lexical_preflight!=="PASS") throw new Error("LEXICAL_PREFLIGHT_NOT_PASS");
  if(Array.isArray(quality.issues) && quality.issues.length) throw new Error("QUALITY_ISSUES_NOT_EMPTY");
  if(Array.isArray(quality.final_review_issues) && quality.final_review_issues.length) throw new Error("FINAL_REVIEW_ISSUES_NOT_EMPTY");
  if(Array.isArray(quality.lexical_preflight_final) && quality.lexical_preflight_final.length) throw new Error("LEXICAL_FINAL_NOT_EMPTY");
  if(body.length<3500 || body.length>4500) throw new Error(`BODY_LENGTH_BLOCKED:${body.length}`);

  const expected=normalize(body);
  const sha256=crypto.createHash("sha256").update(body,"utf8").digest("hex");
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({storageState});
  const page=await context.newPage();
  await page.goto("https://novelpia.com/mynovel/all/write/450743",{waitUntil:"domcontentloaded",timeout:120000});

  await page.locator("#content_subject").fill("1화. 자정 이후의 전화");
  await page.locator("#content_cate").selectOption({label:"연재회차"});
  await page.locator("#content_adult").selectOption({label:"전체 열람가능"});
  await page.locator("#paste_mode").selectOption({label:"원본 붙여넣기"});

  // Escape manuscript before converting newlines to HTML. Manuscript text must never
  // be interpreted as markup by Summernote.
  const safeHtml=escapeHtml(body).replace(/\n/g,"<br>");
  const usedSummernote=await page.evaluate((html)=>{
    try{
      if(window.jQuery && window.jQuery.fn && window.jQuery.fn.summernote){
        window.jQuery("#summernote").summernote("code",html);
        window.jQuery("#summernote").trigger("change");
        return true;
      }
    }catch(e){}
    return false;
  },safeHtml);

  if(!usedSummernote){
    await page.locator("#summernote").evaluate((el,text)=>{
      el.value=text;
      el.dispatchEvent(new Event("input",{bubbles:true}));
      el.dispatchEvent(new Event("change",{bubbles:true}));
    },body);
    const ed=page.locator(".note-editable").first();
    if(await ed.count()) await ed.fill(body);
  }

  const sourceValue=await page.locator("#summernote").inputValue();
  const ed=page.locator(".note-editable").first();
  if(!(await ed.count())) throw new Error("EDITOR_NOT_FOUND");
  const editorText=await ed.innerText();
  if(!normalize(editorText)) throw new Error("EDITOR_EMPTY");

  const sourcePlain=decodeHtml(sourceValue.replace(/<br\s*\/?>/gi,"\n").replace(/<[^>]+>/g,""));
  const sourceNorm=normalize(sourcePlain);
  const editorNorm=normalize(editorText);

  // Exact normalized readback, not a loose character-count tolerance.
  if(sourceNorm!==expected) throw new Error(`SOURCE_READBACK_MISMATCH source=${sourceNorm.length} expected=${expected.length}`);
  if(editorNorm!==expected) throw new Error(`EDITOR_READBACK_MISMATCH editor=${editorNorm.length} expected=${expected.length}`);

  const readbackSha=crypto.createHash("sha256").update(editorNorm,"utf8").digest("hex");
  const expectedNormSha=crypto.createHash("sha256").update(expected,"utf8").digest("hex");
  if(readbackSha!==expectedNormSha) throw new Error("READBACK_SHA_MISMATCH");

  fs.mkdirSync(path.join(__dirname,"reports"),{recursive:true});
  fs.writeFileSync(path.join(__dirname,"reports","novelpia-commercial-prep.json"),JSON.stringify({
    platform:"novelpia",episode:1,title:"1화. 자정 이후의 전화",
    expected_chars:expected.length,source_chars:sourceNorm.length,editor_chars:editorNorm.length,
    manuscript_sha256:sha256,normalized_readback_sha256:readbackSha,
    quality_gate:quality.gate,independent_reviewer:quality.independent_reviewer,
    lexical_preflight:quality.lexical_preflight,summernote_api_used:usedSummernote,
    exact_source_match:true,exact_editor_match:true,
    form_filled:true,submit_clicked:false,published:false,safety:"COMMERCIAL_PREPARE_ONLY"
  },null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
