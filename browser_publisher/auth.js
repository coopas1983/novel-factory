const fs=require("fs");
const zlib=require("zlib");
function statePath(name){
  return process.env[name.toUpperCase()+"_STORAGE_STATE_PATH"]||`/tmp/${name}-storage.json`;
}
function validStateFile(path){
  try{JSON.parse(fs.readFileSync(path,"utf8"));return true;}catch{return false;}
}
function loadState(name){
  const path=statePath(name);
  if(fs.existsSync(path)&&validStateFile(path)) return path;
  const key=name.toUpperCase()+"_STORAGE_STATE_B64";
  const raw=process.env[key];
  if(!raw) throw new Error("AUTH_REQUIRED:"+key);
  let buf=Buffer.from(raw,"base64");
  if(buf.length>=2 && buf[0]===0x1f && buf[1]===0x8b) buf=zlib.gunzipSync(buf);
  const text=buf.toString("utf8");
  JSON.parse(text);
  fs.writeFileSync(path,text,"utf8");
  return path;
}
async function persistState(context,name){
  const path=statePath(name);
  await context.storageState({path});
  return path;
}
module.exports={loadState,persistState,statePath};
