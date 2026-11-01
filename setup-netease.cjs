const {spawnSync}=require('node:child_process');
const {mkdirSync}=require('node:fs');
const path=require('node:path');
const root=__dirname;
function run(file,args){const r=spawnSync(file,args,{cwd:root,stdio:'inherit',windowsHide:true});if(r.error)throw r.error;if(r.status!==0)throw Error('配置或登录未完成，请检查上面的提示。');}
(async()=>{
 for(const name of ['private','cache','state'])mkdirSync(path.join(root,name),{recursive:true});
 const action=process.argv[2],{neteaseCredentials}=await import('./settings.mjs');
 const config=neteaseCredentials();
 const args=['--use-env-proxy','--require',path.join(root,'ncm-isolate.cjs'),path.join(root,'node_modules/@music163/ncm-cli/dist/index.js')];
 if(action==='configure'){
  run(process.execPath,[...args,'config','set','appId',config.appId]);
  run(process.execPath,[...args,'config','set','privateKey',config.privateKeyPath]);
  console.log('网易云凭证已配置。下一步运行 npm run login 扫码授权。');
 }else if(action==='login'){
  run(process.execPath,[...args,'login','--output','human']);
  run(process.execPath,[path.join(root,'sync-session.cjs')]);
 }else throw Error('用法：npm run configure 或 npm run login');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
