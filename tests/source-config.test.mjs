import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {generateKeyPairSync} from 'node:crypto';
import {modelBaseUrl,neteaseCredentials} from '../settings.mjs';
import {completion,getKey} from '../qwen.mjs';
import {getUploadPolicy} from '../upload.mjs';

test('fresh checkout requires its own credentials and routes model/upload to the configured workspace',async()=>{
 const saved={...process.env},fetcher=globalThis.fetch;
 try{
  delete process.env.DASHSCOPE_API_KEY;delete process.env.DASHSCOPE_BASE_URL;
  assert.throws(getKey,/DASHSCOPE_API_KEY/);assert.throws(modelBaseUrl,/DASHSCOPE_BASE_URL/);
  process.env.DASHSCOPE_BASE_URL='https://YOUR_WORKSPACE.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
  assert.throws(modelBaseUrl,/DASHSCOPE_BASE_URL/);
  process.env.DASHSCOPE_BASE_URL='https://workspace.example.com/compatible-mode/v1/';
  process.env.DASHSCOPE_API_KEY='synthetic-test-key';delete process.env.DASHSCOPE_UPLOAD_BASE_URL;
  let called;
  globalThis.fetch=async(url,options)=>{called={url,options};return new Response('data: '+JSON.stringify({choices:[{delta:{content:'ok'}}]})+'\n\ndata: [DONE]\n\n');};
  const result=await completion([{role:'user',content:'test'}]);
  assert.equal(result.content,'ok');assert.equal(called.url,'https://workspace.example.com/compatible-mode/v1/chat/completions');
  assert.equal(called.options.headers.Authorization,'Bearer synthetic-test-key');
  let policyUrl;
  await getUploadPolicy('synthetic-test-key','qwen3.8-omni-flash',async url=>{policyUrl=String(url);return new Response(JSON.stringify({data:{upload_host:'https://bucket.oss.aliyuncs.com',policy:'test',upload_dir:'test/'}}));});
  assert.equal(new URL(policyUrl).origin,'https://workspace.example.com');
  const keyPair=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
  await mkdir(new URL('../cache/',import.meta.url),{recursive:true});const folder=await mkdtemp(new URL('../cache/config-test-',import.meta.url));
  const file=folder+'/key.pem';await writeFile(file,keyPair.privateKey);process.env.NCM_APP_ID='test-app';process.env.NCM_PRIVATE_KEY_PATH=file;
  const credentials=neteaseCredentials();assert.equal(credentials.appId,'test-app');assert.equal(credentials.privateKey,keyPair.privateKey);
 }finally{globalThis.fetch=fetcher;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
