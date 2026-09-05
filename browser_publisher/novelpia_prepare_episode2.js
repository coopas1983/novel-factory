const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const { chromium }=require('playwright');
const { loadState }=require('./auth');

const NOVEL_ID='450743';
const EPISODE=2;
const TITLE='2화. 규칙 확인';
const normalize=s=>s.replace(/\r/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+\n/g,'\n').trim();
const escapeHtml=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const decodeHtml=s=>s.replace(/&nbsp;/gi,' ').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&amp;/gi,'&');
const visibleChars=s=>s.replace(/\s/g,'').length;

(async()=>{
  // This script is intentionally prepare-only. It contains no submit click.
  if(process.env.CONFIRM_PUBLISH==='YES') throw new Error('PREPARE_ONLY_REFUSES_PUBLISH_CONFIRMATION');
  const storageState=loadState('NOVELPIA');
  const chapterPath=path.join(__dirname,'..','books','live-gemini-pilot','commercial','chapter-2.md');
  const qualityPath=path.join(__dirname,'..','books','live-gemini-pilot','commercial','chapter-2-quality.json');
  const body=fs.readFileSync(chapterPath,'utf8').replace(/^#.*\n+/,'').trim();
  const quality=JSON.parse(fs.readFileSync(qualityPath,'utf8'));
  const chars=visibleChars(body);
  if(quality.gate!=='PASS'||quality.independent_reviewer!=='PASS'||quality.lexical_preflight!=='PASS'||quality.human_polish!=='PASS') throw new Error('QUALITY_GATE_BLOCK');
  if(chars<3500||chars>4400) throw new Error('VISIBLE_LENGTH_BLOCK:'+chars);

  const expected=normalize(body);
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({storageState});
  const page=await context.newPage();
  const writeUrl=`https://novelpia.com/mynovel/all/write/${NOVEL_ID}`;
  await page.goto(writeUrl,{waitUntil:'domcontentloaded',timeout:120000});
  if(!page.url().includes(`/write/${NOVEL_ID}`)) throw new Error('WRONG_NOVEL_OR_AUTH_ROUTE:'+page.url());

  await page.locator('#content_subject').fill(TITLE);
  await page.locator('#content_cate').selectOption({label:'연재회차'});
  await page.locator('#content_adult').selectOption({label:'전체 열람가능'});
  await page.locator('#paste_mode').selectOption({label:'원본 붙여넣기'});
  const safeHtml=escapeHtml(body).replace(/\n/g,'<br>');
  const ok=await page.evaluate(html=>{
    if(window.jQuery?.fn?.summernote){
      window.jQuery('#summernote').summernote('code',html);
      window.jQuery('#summernote').trigger('change');
      return true;
    }
    return false;
  },safeHtml);
  if(!ok) throw new Error('SUMMERNOTE_API_REQUIRED');

  const source=await page.locator('#summernote').inputValue();
  const editorText=normalize(await page.locator('.note-editable').first().innerText());
  const sourcePlain=normalize(decodeHtml(source.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'')));
  if(sourcePlain!==expected||editorText!==expected) throw new Error('PREPARE_READBACK_MISMATCH');

  const report={platform:'novelpia',novel_id:NOVEL_ID,episode:EPISODE,title:TITLE,chars_without_whitespace:chars,manuscript_sha256:crypto.createHash('sha256').update(body,'utf8').digest('hex'),editor_exact_match:true,submit_clicked:false,published:false,status:'READY_AWAITING_USER_APPROVAL'};
  fs.mkdirSync(path.join(__dirname,'reports'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'reports','novelpia-commercial-prep.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});