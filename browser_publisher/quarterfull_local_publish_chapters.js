const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROFILE = path.join(process.env.LOCALAPPDATA || '', 'NovelFactory', 'QuarterFullProfile');
const PROJECT_ID = 138647;
const WORK_ID = '0a091e56-ff71-4f3f-862b-fde86b61adb3';
const API = 'https://api.quarterfull.io/api/v1';
const TRIGGER = fs.readFileSync(path.join(__dirname,'quarterfull-local-publish-trigger.txt'),'utf8').trim();

function parseEpisodes(s){
  let m=s.match(/episodes?\s+(\d+)\s*-\s*(\d+)/i);
  if(m){const a=[];for(let n=+m[1];n<=+m[2];n++)a.push(n);return a;}
  m=s.match(/episode\s+(\d+)/i); if(m)return [+m[1]];
  throw new Error('PUBLISH_TRIGGER_INVALID');
}

(async()=>{
  const episodes=parseEpisodes(TRIGGER);
  if(episodes.some(n=>n<2||n>10))throw new Error('EPISODE_OUT_OF_RANGE');
  const ctx=await chromium.launchPersistentContext(PROFILE,{channel:'chrome',headless:true,args:['--profile-directory=Default']});
  try{
    const page=ctx.pages()[0]||await ctx.newPage();
    await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(4000);
    const api=async(method,url,body)=>page.evaluate(async({method,url,body})=>{
      const t=localStorage.getItem('cravi_access_token'); if(!t)throw new Error('NO_ACCESS_TOKEN');
      const r=await fetch(url,{method,headers:{Authorization:t.startsWith('Bearer ')?t:`Bearer ${t}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
      let j=null;try{j=await r.json()}catch{}
      return {ok:r.ok,status:r.status,json:j};
    },{method,url,body});
    const summaries=async()=>{
      const r=await api('GET',`${API}/studio/works/${WORK_ID}/chapter-summaries?_t=${Date.now()}`);
      if(!r.ok)throw new Error(`SUMMARIES_FAILED:${r.status}`);
      const a=Array.isArray(r.json)?r.json:(r.json?.chapters||r.json?.items||r.json?.data||[]);
      return a;
    };

    let before=await summaries();
    if(before.length!==10)throw new Error(`EXPECTED_10_CHAPTERS_GOT:${before.length}`);
    const results=[];
    for(const ep of episodes){
      const prev=before.find(x=>x.title===`${ep-1}화`);
      const cur=before.find(x=>x.title===`${ep}화`);
      if(!cur)throw new Error(`CHAPTER_NOT_REGISTERED:${ep}`);
      if(ep>1 && !prev?.is_published)throw new Error(`PREVIOUS_CHAPTER_NOT_PUBLISHED:${ep-1}`);
      if(cur.is_published){results.push({episode:ep,status:'ALREADY_PUBLISHED'});continue;}

      const p=`/project/원고/${ep}화.md`;
      const r=await api('POST',`${API}/studio-cursor/projects/${PROJECT_ID}/bookstore-chapters/apply-and-schedule`,{path:p,scheduled_publish_at:null,timezone:'Asia/Seoul'});
      if(!r.ok)throw new Error(`PUBLISH_FAILED:${ep}:${r.status}:${JSON.stringify(r.json)}`);
      await page.waitForTimeout(1000);
      before=await summaries();
      const check=before.find(x=>x.title===`${ep}화`);
      if(!check?.is_published)throw new Error(`PUBLISH_NOT_CONFIRMED:${ep}:${JSON.stringify(r.json)}`);
      results.push({episode:ep,status:'PUBLISHED_CONFIRMED',published_at:check.published_at||null});
    }
    console.log('QF_CHAPTER_PUBLISH_OK');
    console.log(JSON.stringify({results,publicCount:before.filter(x=>x.is_published).length,total:before.length,chapters:before.map(x=>({title:x.title,is_published:x.is_published,published_at:x.published_at||null}))}));
  }finally{await ctx.close()}
})().catch(e=>{console.error(e);process.exit(1)});
