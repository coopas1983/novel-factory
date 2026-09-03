const fs=require("fs");
function loadState(name){
  const key=name.toUpperCase()+"_STORAGE_STATE_B64";
  const raw=process.env[key];
  if(!raw) throw new Error("AUTH_REQUIRED:"+key);
  const path=`/tmp/${name}-storage.json`;
  fs.writeFileSync(path,Buffer.from(raw,"base64"));
  return path;
}
module.exports={loadState};
