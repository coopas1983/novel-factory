const fs=require("fs");
const zlib=require("zlib");
function loadState(name){
  const key=name.toUpperCase()+"_STORAGE_STATE_B64";
  const raw=process.env[key];
  if(!raw) throw new Error("AUTH_REQUIRED:"+key);
  const path=`/tmp/${name}-storage.json`;
  let buf=Buffer.from(raw,"base64");
  if(buf.length>=2 && buf[0]===0x1f && buf[1]===0x8b){
    buf=zlib.gunzipSync(buf);
  }
  const text=buf.toString("utf8");
  JSON.parse(text);
  fs.writeFileSync(path,text,"utf8");
  return path;
}
module.exports={loadState};
