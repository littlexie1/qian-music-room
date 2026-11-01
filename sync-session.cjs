// Bridge the official CLI's encrypted login cache to our direct OpenAPI reader.
// Capture only account token records; never print or log token/key contents.
const crypto=require('node:crypto'),path=require('node:path'),cp=require('node:child_process');
require('./ncm-isolate.cjs');
const sessions=[];const original=crypto.createDecipheriv;
crypto.createDecipheriv=function(...args){
 const d=original.apply(this,args),parts=[];
 for(const method of ['update','final']){const fn=d[method].bind(d);d[method]=function(...values){const out=fn(...values);parts.push(Buffer.isBuffer(out)?out:Buffer.from(out,typeof values[2]==='string'?values[2]:'utf8'));if(method==='final'){try{const x=JSON.parse(Buffer.concat(parts).toString('utf8'));if(x&&typeof x.namedToken==='string'&&x.namedToken)sessions.push(Object.fromEntries(['namedToken','namedRefreshToken','namedTokenExpireAt','anonymousToken','anonymousTokenExpireAt'].filter(k=>x[k]!==undefined).map(k=>[k,x[k]])));}catch{}}return out;};}
 return d;
};
const quiet=()=>true;process.stdout.write=quiet;
process.on('beforeExit',()=>{
 if(!sessions.length){console.error('未读取到登录授权。先运行 npm run login；扫码完成后可重试 npm run sync-session。');process.exitCode=1;return;}
 const r=cp.spawnSync('pwsh',['-NoProfile','-File',path.join(__dirname,'protect.ps1'),'-Action','write','-Name','session'],{input:JSON.stringify(sessions),encoding:'utf8',windowsHide:true});
 if(r.status!==0){console.error('本地登录凭证保存失败，请确认已安装 PowerShell 7。');process.exitCode=1;}else console.error('登录授权已同步并加密保存。');
});
process.argv=[process.execPath,path.join(__dirname,'node_modules/@music163/ncm-cli/dist/index.js'),'commands'];
require('./node_modules/@music163/ncm-cli/dist/index.js');
