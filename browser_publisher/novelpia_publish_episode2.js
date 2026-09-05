const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const { chromium }=require('playwright');
const { loadState }=require('./auth');

const NOVEL_ID='450743';
const EPISODE=2;
const TITLE='2화. 규칙 확인';
const LIST_URL=`https://novelpia.com/novel/${NOVEL_ID}`;
const WRITE_URL=`https://novelpia.com/mynovel/all/write/${NOVEL_ID}`;
const normalize=s=>s.replace(/\r/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+\n/g,'\n').trim();
const escapeHtml=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const decodeHtml=s=>s.replace(/&nbsp;/gi,' ').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&amp;/gi,'&');
const visibleChars=s=>s.replace(/\s/g,'').length;

async function findPublishedEpisode(page){
  await page.goto(LIST_URL,{waitUntil:'domcontentloaded',timeout:120000});
  const bodyText=normalize(await page.locator('body').innerText().catch(()=>''));
  const links=page.locator('a[href*="/viewer/"]');
  const count=await links.count();
  for(let i=0;i<count;i++){
    const a=links.nth(i);
    const text=normalize(await a.innerText().catch(()=>''));
    const href=await a.getAttribute('href');
    if(text.includes(TITLE)||text.includes('규칙 확인')) return {found:true,text,href};
  }
  return {found:bodyText.includes(TITLE),text:bodyText.includes(TITLE)?TITLE:null,href:null};
}

(async()=>{
  if(process.env.CONFIRM_PUBLISH!=='YES') throw new Error('EXPLICIT_PUBLISH_CONFIRMATION_REQUIRED');

  const chapterPath=path.join(__dirname,'..','books','live-gemini-pilot','commercial','chapter-2.md');
  const qualityPath=path.join(__dirname,'..','books','live-gemini-pilot','commercial','chapter-2-quality.json');
  const body=fs.readFileSync(chapterPath,'utf8').replace(/^#.*\n+/,'').trim();
  const quality=JSON.parse(fs.readFileSync(qualityPath,'utf8'));
  const chars=visibleChars(body);

  if(quality.gate!=='PASS'||quality.human_polish!=='PASS'||quality.independent_reviewer!=='PASS'||quality.lexical_preflight!=='PASS'||quality.continuity_reviewer!=='PASS') throw new Error('QUALITY_GATE_BLOCK');
  if((quality.final_review_issues||[]).length||(quality.continuity_issues||[]).length||(quality.lexical_preflight_final||[]).length) throw new Error('QUALITY_ISSUES_PRESENT');
  if(chars<3500||chars>4400) throw new Error('VISIBLE_LENGTH_BLOCK:'+chars);
  if(quality.chars_without_whitespace!==chars) throw new Error(`QUALITY_COUNT_MISMATCH:${quality.chars_without_whitespace}!=${chars}`);

  const storageState=loadState('NOVELPIA');
  const expected=normalize(body);
  const manuscriptSha=crypto.createHash('sha256').update(body,'utf8').digest('hex');
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({storageState});
  const page=await context.newPage();
  fs.mkdirSync(path.join(__dirname,'reports'),{recursive:true});
  const reportPath=path.join(__dirname,'reports','novelpia-episode2-publish.json');

  const existing=await findPublishedEpisode(page);
  if(existing.found){
    const report={platform:'novelpia',novel_id:NOVEL_ID,episode:EPISODE,title:TITLE,chars_without_whitespace:chars,manuscript_sha256:manuscriptSha,duplicate_check:'FOUND_EXISTING',existing,status:'ALREADY_PUBLISHED',submit_clicked:false,published:true};
    fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
    await browser.close();
    return;
  }

  await page.goto(WRITE_URL,{waitUntil:'domcontentloaded',timeout:120000});
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
  if(sourcePlain!==expected||editorText!==expected) throw new Error('PRE_SUBMIT_READBACK_MISMATCH');
  if((await page.locator('#content_subject').inputValue()).trim()!==TITLE) throw new Error('TITLE_READBACK_MISMATCH');

  const candidates=page.locator('button:visible, input[type="button"]:visible, input[type="submit"]:visible, a:visible');
  const count=await candidates.count();
  const found=[];
  for(let i=0;i<count;i++){
    const el=candidates.nth(i);
    const text=((await el.innerText().catch(()=>'')) || (await el.getAttribute('value')) || '').trim();
    if(/작성|등록|완료|발행|연재/.test(text) && !/로그인|취소|목록/.test(text)) found.push({i,text});
  }
  if(found.length!==1) throw new Error('PUBLISH_CONTROL_AMBIGUOUS:'+JSON.stringify(found));

  const submit=candidates.nth(found[0].i);
  await submit.click();
  await page.waitForTimeout(4000);
  const postSubmitUrl=page.url();

  const publishedCheck=await findPublishedEpisode(page);
  const viewerNavigation=/\/viewer\//.test(postSubmitUrl);
  const published=viewerNavigation||publishedCheck.found;
  const report={
    platform:'novelpia',novel_id:NOVEL_ID,episode:EPISODE,title:TITLE,
    chars_without_whitespace:chars,manuscript_sha256:manuscriptSha,
    duplicate_check:'CLEAR_BEFORE_SUBMIT',editor_exact_match:true,title_exact_match:true,
    selected_publish_control:found[0].text,submit_clicked:true,post_submit_url:postSubmitUrl,
    viewer_navigation:viewerNavigation,listing_check:publishedCheck,published,
    status:published?'PUBLISHED_CONFIRMED':'SUBMIT_CLICKED_VERIFICATION_FAILED'
  };
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  await browser.close();
  if(!published) process.exitCode=2;
})().catch(e=>{console.error(e);process.exit(1);});
