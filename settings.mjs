import {readFileSync} from 'node:fs';
import {createPrivateKey} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const APP_ROOT=fileURLToPath(new URL('./',import.meta.url));
export function modelBaseUrl(){
 const value=process.env.DASHSCOPE_BASE_URL?.trim();
 if(!value||value.includes('YOUR_WORKSPACE'))throw Error('请在 .env 配置自己的 DASHSCOPE_BASE_URL。');
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('DASHSCOPE_BASE_URL 需要不含凭证、查询或片段的 HTTPS 地址。');
 return url.href.replace(/\/$/,'');
}
export function neteaseCredentials(){
 const appId=process.env.NCM_APP_ID?.trim(), file=process.env.NCM_PRIVATE_KEY_PATH?.trim();
 if(!appId||!file)throw Error('请在 .env 配置 NCM_APP_ID 和 NCM_PRIVATE_KEY_PATH。');
 const privateKeyPath=resolve(APP_ROOT,file),privateKey=readFileSync(privateKeyPath,'utf8');
 const key=createPrivateKey(privateKey);if(key.asymmetricKeyType!=='rsa')throw Error('网易云 Private Key 需要 RSA PEM 格式。');
 return {appId,privateKey,privateKeyPath};
}
