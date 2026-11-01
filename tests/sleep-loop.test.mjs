import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
await mkdir(new URL('../cache/',import.meta.url),{recursive:true});process.env.MUSIC_STATE_DIR=await mkdtemp(new URL('../cache/sleep-test-',import.meta.url));
const chat=await import('../chat-agent.mjs');const {timerService}=await import('../time-tools.mjs');const {executeTool}=await import('../music-tools.mjs');
const wait=async fn=>{for(let i=0;i<500;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('wait timeout');};
const reply=(content,calls=[])=>({content,calls,message:{role:'assistant',content:content||null,...(calls.length?{tool_calls:calls}:{})}});
const call=(name,args)=>({id:crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}});
test('sleep suspends the loop and later wakes the same context without executing premature actions',async()=>{
 await chat.initChat();timerService.send=chat.sendMessage;chat.chatServices.readMemory=async()=>({preferences:[]});const info=await chat.createConversation(),c=chat.getConversation(info.id);let adjustments=0,rounds=0;
 chat.chatServices.executeTool=async(name,args,ctx)=>{if(name==='set_volume'){adjustments++;return {verified:true};}return executeTool(name,args,ctx);};
 chat.chatServices.completion=async messages=>{rounds++;const last=messages.at(-1);if(last.role==='user'&&last.content==='等一下再调音量')return reply('',[call('sleep',{seconds:.08,reason:'现在调音量'}),call('set_volume',{volume:.8})]);if(last.role==='user'&&last.content.startsWith('[后台定时器到期')){assert.ok(messages.some(m=>m.content==='等一下再调音量'));return reply('',[call('set_volume',{volume:.8})]);}return reply('已完成。');};
 await chat.sendMessage(c.id,{message:'等一下再调音量'});await wait(()=>c.status==='idle'&&c.waitingUntil);assert.equal(rounds,1);assert.equal(adjustments,0);
 await wait(()=>c.status==='idle'&&!c.waitingUntil&&adjustments===1);assert.equal(c.workspace.goal,'等一下再调音量');assert.ok(c.messages.some(m=>m.role==='tool'&&m.content.includes('已后台等待')));
});
test('new user input interrupts sleeping immediately and prevents the old sleep wakeup',async()=>{
 const info=await chat.createConversation(),c=chat.getConversation(info.id);let wakes=0;
 chat.chatServices.completion=async messages=>{const last=messages.at(-1);if(last.role==='user'&&last.content==='先等一会')return reply('',[call('sleep',{seconds:.12})]);if(last.role==='user'&&last.content.startsWith('[后台定时器到期'))wakes++;return reply('收到新指令。');};
 await chat.sendMessage(c.id,{message:'先等一会'});await wait(()=>c.waitingUntil&&c.status==='idle');await chat.sendMessage(c.id,{message:'不用等了'});await wait(()=>c.status==='idle'&&!c.waitingUntil);await new Promise(r=>setTimeout(r,160));assert.equal(wakes,0);
});
