import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {APP_ROOT} from '../settings.mjs';

test('credential-free fresh startup serves the continuous UI and persists a new conversation',async()=>{
 await mkdir(new URL('../cache/',import.meta.url),{recursive:true});
 const state=await mkdtemp(new URL('../cache/startup-test-',import.meta.url));
 const env={...process.env,MUSIC_STATE_DIR:state,MUSIC_PORT:'0'};
 for(const k of ['DASHSCOPE_API_KEY','DASHSCOPE_BASE_URL','NCM_APP_ID','NCM_PRIVATE_KEY_PATH','MUSIC_INDEX_HTML'])delete env[k];
 const child=spawn(process.execPath,['server.mjs'],{cwd:APP_ROOT,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let logs='';child.stderr.on('data',b=>logs+=b);
 try{
  const url=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('启动超时：'+logs)),8000);
   child.once('error',e=>{clearTimeout(timer);reject(e);});
   child.once('exit',code=>{clearTimeout(timer);reject(Error('退出 '+code+': '+logs));});
   let output='';child.stdout.on('data',b=>{output+=b;const match=output.match(/Music room (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
  });
  const html=await (await fetch(url)).text();assert.match(html,/conversation-app\.js/);assert.match(html,/千小姐/);
  const list=await (await fetch(url+'/api/conversations')).json();assert.ok(Array.isArray(list));assert.ok(list.length>0);
  const saved=JSON.parse(await readFile(state+'/server.json','utf8'));assert.equal(saved.url,url);
  const denied=await fetch(url+'/api/conversations',{headers:{Origin:'https://other.example'}});assert.equal(denied.status,403);
 }finally{if(child.exitCode===null){const closed=once(child,'exit');child.kill();await closed;}}
});
