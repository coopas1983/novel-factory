const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const { chromium }=require("playwright");
const { loadState }=require("./auth");

(async()=>{
  const storageState=loadState("NOVELPIA");
  const chapterPath=path.join(__dirname,"..","books","live-gemini-pilot","commercial","chapter-1.md");
  const qualityPath=path.join(__dirname,"..","books","live-gemini-pilot","commercial","chapter-1-quality.json");
  if(!fs.existsSync(chapterPath)||!fs.existsSync(qualityPath)) throw new Error("COMMERCIAL_FILES_MISSING");

  let body=fs.readFileSync(chapterPath,"utf8").replace(/^#.*\n+/,"").trim();
  const quality=JSON.parse(fs.readFileSync(qualityPath,"utf8"));
  if(quality.gate!=="PASS") throw new Error("QUALITY_GATE_NOT_PASS");
  if(body.length<3500 || body.length>4500) throw new Error(`BODY_LENGTH_BLOCKED:${body.length}`);

  const sha256=crypto.createHash("sha256").update(body,"utf8").digest("hex");
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({storageState});
  const page=await context.newPage();
  await page.goto("https://novelpia.com/mynovel/all/write/450743",{waitUntil:"domcontentloaded",timeout:120000});

  await page.locator("#content_subject").fill("1화. 자정 이후의 전화");
  await page.locator("#content_cate").selectOption({label:"연재회차"});
  await page.locator("#content_adult").selectOption({label:"전체 열람가능"});
  await page.locator("#paste_mode").selectOption({label:"원본 붙여넣기"});

  // Prefer Summernote's own API so source/editor stay synchronized.
  const usedSummernote=await page.evaluate((text)=>{
    try{
      if(window.jQuery && window.jQuery.fn && window.jQuery.fn.summernote){
        window.jQuery("#summernote").summernote("code", text.replace(/\n/g,"<br>"));
        window.jQuery("#summernote").trigger("change");
        return true;
      }
    }catch(e){}
    return false;
  },body);

  if(!usedSummernote){
    await page.locator("#summernote").evaluate((el,text)=>{
      el.value=text;
      el.dispatchEvent(new Event("input",{bubbles:true}));
      el.dispatchEvent(new Event("change",{bubbles:true}));
    },body);
    const ed=page.locator(".note-editable").first();
    if(await ed.count()) await ed.fill(body);
  }

  // Read back both representations. Never submit unless later workflow explicitly does so.
  const sourceValue=await page.locator("#summernote").inputValue();
  const editorText=await page.locator(".note-editable").first().count()
    ? await page.locator(".note-editable").first().innerText() : "";

  const normalize=s=>s.replace(/\r/g,"").replace(/\u00a0/g," ").trim();
  const sourcePlain=sourceValue.replace(/<br\s*\/?>/gi,"\n").replace(/<[^>]+>/g,"");
  const sourceChars=normalize(sourcePlain).length;
  const editorChars=normalize(editorText).length;

  const tolerance=80;
  const sourceOk=Math.abs(sourceChars-body.length)<=tolerance;
  const editorOk=editorChars===0 || Math.abs(editorChars-body.length)<=tolerance;
  if(!sourceOk || !editorOk) throw new Error(`EDITOR_SYNC_BLOCKED source=${sourceChars} editor=${editorChars} expected=${body.length}`);

  fs.mkdirSync(path.join(__dirname,"reports"),{recursive:true});
  fs.writeFileSync(path.join(__dirname,"reports","novelpia-commercial-prep.json"),JSON.stringify({
    platform:"novelpia", episode:1, title:"1화. 자정 이후의 전화",
    expected_chars:body.length, source_chars:sourceChars, editor_chars:editorChars,
    sha256, quality_gate:quality.gate, summernote_api_used:usedSummernote,
    form_filled:true, submit_clicked:false, published:false,
    safety:"COMMERCIAL_PREPARE_ONLY"
  },null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
