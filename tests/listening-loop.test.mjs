import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
await mkdir(new URL('../cache/',import.meta.url),{recursive:true});process.env.MUSIC_STATE_DIR=await mkdtemp(new URL('../cache/listening-test-',import.meta.url));process.env.DASHSCOPE_API_KEY='synthetic-test-key';
const chat=await import('../chat-agent.mjs');const {playerBridge}=await import('../player-bridge.mjs');const {listeningDJ}=await import('../player-dj.mjs');const {executeTool}=await import('../music-tools.mjs');
const song=id=>({id,name:id,available:true});
const wait=async fn=>{for(let i=0;i<500;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('loop timed out');};
const reply=(text='',calls=[])=>({content:text,calls,message:{role:'assistant',content:text||null,...(calls.length?{tool_calls:calls}:{})}});
const call=(name,args)=>({id:crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}});
test('DJ continues in its parent conversation, receives native media, prepares the next song each cycle and stops by instruction',async()=>{
 await chat.initChat();const info=await chat.createConversation(),c=chat.getConversation(info.id);for(const id of ['s1','s2','s3'])c.workspace.candidates[id]=song(id);
 let state={sequence:0,queue:[song('s1')],song:song('s1'),current_position:1,paused:false,playback_cycle:1,volume:.5},native=0,volumeConfirmed=false;
 playerBridge.subscribe('w',command=>{
  if(command.type!=='command')return;
  if(command.action==='volume'){state.volume=command.args.volume;volumeConfirmed=true;}
  if(command.action==='queue'){assert.equal(command.args.action,'insert_next');state.queue.splice(state.current_position,0,...command.args.songs);}
  playerBridge.acknowledge('w',command.commandId,{ok:true,state:{...state,queue:[...state.queue],sequence:++state.sequence}});
 });playerBridge.update('w',{...state,sequence:++state.sequence});listeningDJ.send=chat.sendMessage;
 chat.chatServices.readMemory=async()=>({preferences:[]});chat.chatServices.audioFile=async id=>'native-'+id;chat.chatServices.mediaUrl=async file=>'oss://test/'+file;
 chat.chatServices.executeTool=async(name,args,ctx)=>{
  if(name==='listen_song'){ctx.media.push({type:'text',text:'candidate '+args.id},{type:'input_audio',input_audio:{data:'oss://test/'+args.id,format:'mp3'}});ctx.attached.push(args.id);return {audioAttached:true,id:args.id};}
  return executeTool(name,args,ctx);
 };
 chat.chatServices.completion=async messages=>{
  const last=messages.at(-1);
  if(last.role==='user'&&typeof last.content==='string'){
   if(last.content==='开始自动DJ')return reply('',[call('set_listening_mode',{mode:'dj'}),call('set_volume',{volume:.4})]);
   if(last.content==='停止自动找歌')return reply('',[call('set_listening_mode',{mode:'off'})]);
  }
  if(Array.isArray(last.content)){
   assert.ok(last.content.some(p=>p.type==='input_audio'));native++;
   const text=last.content.find(p=>p.type==='text').text;
   if(text.startsWith('candidate ')){const id=text.split(' ')[1];return reply('',[call('record_listening',{id,selected:true,impression:'模拟听感',reason:'模拟筛选'})]);}
   const current=text.match(/歌曲 (s\d)/)[1],next=current==='s1'?'s2':'s3';return reply('',[call('listen_song',{id:next})]);
  }
  const prior=messages.at(-2)?.tool_calls?.[0];
  if(last.role==='tool'&&prior?.function.name==='record_listening'){const {id}=JSON.parse(prior.function.arguments);return reply('',[call('edit_play_queue',{action:'insert_next',song_ids:[id]})]);}
  return reply('已处理。');
 };
 await chat.sendMessage(c.id,{message:'开始自动DJ',playerClientId:'w'});await wait(()=>c.status==='idle'&&state.queue.length===2);
 assert.equal(volumeConfirmed,true,'automatic event must not interrupt the remaining manual tool calls');assert.equal(native,2);assert.deepEqual(state.queue.map(s=>s.id),['s1','s2']);assert.equal(c.workspace.goal,'开始自动DJ');assert.equal(c.timeline.filter(e=>e.kind==='user').length,1);
 state={...state,song:song('s2'),current_position:2,playback_cycle:2};playerBridge.update('w',{...state,sequence:++state.sequence});await wait(()=>c.status==='idle'&&state.queue.length===3);assert.equal(native,4);assert.deepEqual(state.queue.map(s=>s.id),['s1','s2','s3']);
 await chat.sendMessage(c.id,{message:'停止自动找歌',playerClientId:'w'});await wait(()=>c.status==='idle'&&listeningDJ.status('w').mode==='off');
 state={...state,song:song('s3'),current_position:3,playback_cycle:3};playerBridge.update('w',{...state,sequence:++state.sequence});await new Promise(r=>setTimeout(r,20));assert.equal(native,4);
});
