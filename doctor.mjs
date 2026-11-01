import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {APP_ROOT,modelBaseUrl,neteaseCredentials} from './settings.mjs';
let failed=false;
function check(name,fn){try{fn();console.log('OK '+name);}catch(e){failed=true;console.error('缺少 '+name+'：'+e.message);}}
check('Node.js 24+',()=>{if(Number(process.versions.node.split('.')[0])<24)throw Error('请升级 Node.js。');});
check('PowerShell 7',()=>{if(spawnSync('pwsh',['-NoProfile','-Command','$PSVersionTable.PSVersion.Major'],{encoding:'utf8',windowsHide:true}).stdout?.trim()!=='7')throw Error('安装 PowerShell 7，并让 pwsh 位于 PATH。');});
check('官方 CLI',()=>{if(!existsSync(join(APP_ROOT,'node_modules/@music163/ncm-cli/dist/index.js')))throw Error('运行 npm ci。');});
check('百炼配置',()=>{if(!process.env.DASHSCOPE_API_KEY?.trim())throw Error('填写 DASHSCOPE_API_KEY。');modelBaseUrl();});
check('网易云应用配置',()=>{neteaseCredentials();});
check('扫码登录',()=>{if(!existsSync(join(APP_ROOT,'private/session.xml')))throw Error('运行 npm run configure 和 npm run login。');});
console.log('仅检查本地配置；未调用模型或修改网易云账号。服务可用性和授权有效性需启动后验证。');
if(failed)process.exitCode=1;
