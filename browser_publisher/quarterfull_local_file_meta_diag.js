const { chromium } = require('playwright');
const path = require('path');

const PROFILE = path.join(process.env.LOCALAPPDATA || '', 'NovelFactory', 'QuarterFullProfile');
const PROJECT_ID = 138647;
const API = 'https://api.quarterfull.io/api/v1/studio-cursor';

(async()=>{
  const ctx = await chromium.launchPersistentContext(PROFILE,{channel:'chrome',headless:true,args:['--profile-directory=Default']});
  try {
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto('https://quarterfull.io/studio-cursor',{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(4000);
    const out = await page.evaluate(async ({API,PROJECT_ID})=>{
      const token = localStorage.getItem('cravi_access_token');
      if(!token) throw new Error('NO_ACCESS_TOKEN');
      const headers = {Authorization: token.startsWith('Bearer ')?token:`Bearer ${token}`};
      const inspect = async p=>{
        const r=await fetch(`${API}/projects/${PROJECT_ID}/files/read?path=${encodeURIComponent(p)}`,{headers});
        let j=null; try{j=await r.json()}catch{}
        const f=j?.file||j;
        return {path:p,status:r.status,keys:f&&typeof f==='object'?Object.keys(f):[],revision:f?.revision??f?.current_revision??f?.expected_revision??null,reportedPath:f?.path??null,contentLength:typeof f?.content==='string'?f.content.length:null};
      };
      return {source:await inspect('/project/원고(출간용)/5화.md'),dest:await inspect('/project/원고/5화.md')};
    },{API,PROJECT_ID});
    console.log('QF_FILE_META_DIAG_OK');
    console.log(JSON.stringify(out));
  } finally { await ctx.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
