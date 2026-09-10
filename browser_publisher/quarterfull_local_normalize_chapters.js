const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROFILE = path.join(process.env.LOCALAPPDATA || '', 'NovelFactory', 'QuarterFullProfile');
const PROJECT_ID = 138647;
const WORK_ID = '0a091e56-ff71-4f3f-862b-fde86b61adb3';
const API = 'https://api.quarterfull.io/api/v1';
const norm = s => String(s || '').replace(/\s+/g,'');

function canonical(ep){
  return fs.readFileSync(path.resolve(__dirname,'..','books','live-gemini-pilot','commercial',`chapter-${ep}.md`),'utf8').trim();
}

(async()=>{
  const ctx=await chromium.launchPersistentContext(PROFILE,{channel:'chrome',headless:true,args:['--profile-directory=Default']});
  try{
    const page=ctx.pages()[0]||await ctx.newPage();
    await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(4000);

    const api=async (method,url,body)=>page.evaluate(async ({method,url,body})=>{
      const t=localStorage.getItem('cravi_access_token');
      if(!t) throw new Error('NO_ACCESS_TOKEN');
      const r=await fetch(url,{method,headers:{Authorization:t.startsWith('Bearer ')?t:`Bearer ${t}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
      let j=null;try{j=await r.json()}catch{}
      return {status:r.status,ok:r.ok,json:j};
    },{method,url,body});

    const results=[];
    for(let ep=5;ep<=10;ep++){
      const src=`/project/원고(출간용)/${ep}화.md`;
      const dst=`/project/원고/${ep}화.md`;
      const expected=canonical(ep);
      const read=async p=>api('GET',`${API}/studio-cursor/projects/${PROJECT_ID}/files/read?path=${encodeURIComponent(p)}`);
      let s=await read(src), d=await read(dst);

      if(d.ok){
        const dc=d.json?.file?.content ?? d.json?.content ?? '';
        if(norm(dc)!==norm(expected)) throw new Error(`DEST_CONTENT_MISMATCH:${ep}`);
        if(s.ok) throw new Error(`BOTH_SOURCE_AND_DEST_EXIST:${ep}`);
        results.push({episode:ep,status:'ALREADY_MOVED'});
        continue;
      }
      if(!s.ok) throw new Error(`SOURCE_MISSING:${ep}:${s.status}`);
      const f=s.json?.file||s.json;
      const sc=f?.content||'';
      if(norm(sc)!==norm(expected)) throw new Error(`SOURCE_CONTENT_MISMATCH:${ep}:${sc.length}:${expected.length}`);
      if(typeof f?.revision!=='number') throw new Error(`SOURCE_REVISION_MISSING:${ep}`);

      const mv=await api('POST',`${API}/studio-cursor/projects/${PROJECT_ID}/files/move`,{path:src,new_path:dst,expected_revision:f.revision});
      if(!mv.ok) throw new Error(`MOVE_FAILED:${ep}:${mv.status}:${JSON.stringify(mv.json)}`);
      await page.waitForTimeout(700);
      d=await read(dst); s=await read(src);
      if(!d.ok) throw new Error(`DEST_NOT_FOUND_AFTER_MOVE:${ep}:${d.status}`);
      const dc=d.json?.file?.content ?? d.json?.content ?? '';
      if(norm(dc)!==norm(expected)) throw new Error(`DEST_VERIFY_MISMATCH:${ep}`);
      if(s.ok) throw new Error(`SOURCE_STILL_EXISTS_AFTER_MOVE:${ep}`);
      results.push({episode:ep,status:'MOVED_VERIFIED',revision:f.revision});
    }

    const reg=await api('POST',`${API}/studio-cursor/projects/${PROJECT_ID}/bookstore-chapters/register-missing`,{});
    if(!reg.ok) throw new Error(`REGISTER_MISSING_FAILED:${reg.status}:${JSON.stringify(reg.json)}`);
    await page.waitForTimeout(1500);
    const sum=await api('GET',`${API}/studio/works/${WORK_ID}/chapter-summaries?_t=${Date.now()}`);
    if(!sum.ok) throw new Error(`SUMMARIES_FAILED:${sum.status}`);
    const arr=Array.isArray(sum.json)?sum.json:(sum.json?.chapters||sum.json?.items||sum.json?.data||[]);
    const small=arr.map(x=>({id:x.id,title:x.title,is_published:x.is_published,published_at:x.published_at||null}));
    console.log('QF_NORMALIZE_CHAPTERS_OK');
    console.log(JSON.stringify({moves:results,chapterCount:small.length,chapters:small}));
  }finally{await ctx.close()}
})().catch(e=>{console.error(e);process.exit(1)});
