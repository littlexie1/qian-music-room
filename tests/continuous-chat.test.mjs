import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir} from 'node:fs/promises';
await mkdir(new URL('../cache/',import.meta.url),{recursive:true});process.env.MUSIC_STATE_DIR=await mkdtemp(new URL('../cache/continuous-test-',import.meta.url));
const chat=await import('../chat-agent.mjs');await chat.initChat();chat.chatServices.readMemory=async()=>({preferences:[]});
const wait=async fn=>{const at=Date.now();while(!fn()){if(Date.now()-at>5000)throw Error('timed out');await new Promise(r=>setTimeout(r,5));}};
function answer(content,calls=[]){return {content,calls,message:{role:'assistant',content:content||null,...(calls.length?{tool_calls:calls}:{})}};}
const call=(name,id='call')=>({id,type:'function',function:{name,arguments:'{}'}});
test('ordinary chat and tool use share one continuous context without forced playlist completion',async()=>{
 const info=await chat.createConversation();let observed=[];chat.chatServices.completion=async messages=>{observed.push(structuredClone(messages));return answer(observed.length===1?'你好，小天。':'你刚才说想听安静的音乐。');};chat.chatServices.executeTool=async()=>{throw Error('no tool should run');};
 await chat.sendMessage(info.id,{message:'你好，想听安静的音乐',requestId:'a'});await wait(()=>chat.getConversation(info.id).status==='idle');
 await chat.sendMessage(info.id,{message:'我刚才说了什么？',requestId:'b'});await wait(()=>chat.getConversation(info.id).status==='idle');
 const messages=observed[1];assert.ok(messages.some(m=>m.role==='user'&&m.content==='你好，想听安静的音乐'));assert.ok(messages.some(m=>m.role==='assistant'&&m.content==='你好，小天。'));assert.ok(messages.some(m=>m.role==='user'&&m.content==='我刚才说了什么？'));assert.equal(chat.getConversation(info.id).workspace.wantPlaylist,false);assert.ok(!chat.chatTools.some(t=>t.function.name==='finish_task'));
 const files=await readdir(process.env.MUSIC_STATE_DIR);assert.ok(!files.includes('tasks'));
});
test('new messages during execution join the same conversation and skip stale calls',async()=>{
 const info=await chat.createConversation();let release,entered=false,round=0,seen=[],executed=[];
 chat.chatServices.completion=async messages=>{seen.push(structuredClone(messages));if(++round===1){entered=true;await new Promise(r=>release=r);return answer('',[call('create_playlist')]);}return answer('好，改成只找纯音乐。');};chat.chatServices.executeTool=async name=>{executed.push(name);return {};};
 await chat.sendMessage(info.id,{message:'找几首歌',requestId:'first'});await wait(()=>entered);
 await chat.sendMessage(info.id,{message:'只要纯音乐，先别建歌单',requestId:'second'});await chat.sendMessage(info.id,{message:'只要纯音乐，先别建歌单',requestId:'second'});release();await wait(()=>chat.getConversation(info.id).status==='idle');
 const c=chat.getConversation(info.id);assert.deepEqual(executed,[]);assert.equal(c.messages.filter(m=>m.role==='user'&&m.content==='只要纯音乐，先别建歌单').length,1);assert.ok(seen[1].some(m=>m.role==='user'&&m.content==='找几首歌'));assert.ok(seen[1].some(m=>m.role==='tool'&&JSON.parse(m.content).skipped));assert.equal(c.timeline.filter(e=>e.kind==='user').length,2);
});
test('model failure retains the preceding tool result and question in the next turn',async()=>{
 const info=await chat.createConversation();let n=0,received;
 chat.chatServices.completion=async messages=>{if(++n===1)return answer('',[call('search')]);if(n===2)throw Error('test serving failure');received=messages;return answer('刚才模型服务出错，搜索结果还在。');};chat.chatServices.executeTool=async()=>[{id:'song-known',name:'已找到的歌'}];
 await chat.sendMessage(info.id,{message:'找古风纯音乐'});await wait(()=>chat.getConversation(info.id).status==='error');
 await chat.sendMessage(info.id,{message:'为什么报错？'});await wait(()=>chat.getConversation(info.id).status==='idle');
 assert.ok(received.some(m=>m.role==='tool'&&m.content.includes('song-known')));assert.ok(received.some(m=>m.content?.includes?.('test serving failure')));assert.ok(received.some(m=>m.role==='user'&&m.content==='找古风纯音乐'));assert.ok(received.some(m=>m.role==='user'&&m.content==='为什么报错？'));
 const saved=JSON.parse(await readFile(process.env.MUSIC_STATE_DIR+'/conversations/'+info.id+'.json','utf8'));assert.ok(saved.messages.some(m=>m.role==='tool'&&m.content.includes('song-known')));
});
test('new conversations isolate model history',async()=>{
 const a=await chat.createConversation(),b=await chat.createConversation();let seen;
 chat.chatServices.completion=async messages=>{seen=messages;return answer('收到');};
 await chat.sendMessage(a.id,{message:'只在A对话出现的暗号'});await wait(()=>chat.getConversation(a.id).status==='idle');await chat.sendMessage(b.id,{message:'新的话题'});await wait(()=>chat.getConversation(b.id).status==='idle');assert.ok(!JSON.stringify(seen).includes('只在A对话出现的暗号'));
});
test('stop followed immediately by a new message resumes the same context without a stuck queue',async()=>{
 const info=await chat.createConversation();let entered=false,n=0,received;
 chat.chatServices.completion=async(messages,{signal})=>{if(++n===1){entered=true;await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('stopped')),{once:true}));}received=messages;return answer('接着聊。');};
 await chat.sendMessage(info.id,{message:'先听歌'});await wait(()=>entered);await chat.stopConversation(info.id);await chat.sendMessage(info.id,{message:'先不找了，告诉我刚才发生了什么'});await wait(()=>chat.getConversation(info.id).status==='idle');
 assert.ok(received.some(m=>m.role==='user'&&m.content==='先听歌'));assert.ok(received.some(m=>m.role==='user'&&m.content==='先不找了，告诉我刚才发生了什么'));assert.equal(chat.getConversation(info.id).incoming.length,0);
});
