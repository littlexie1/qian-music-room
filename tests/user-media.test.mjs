import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {saveUserMedia,prepareUserMedia,userMedia} from '../user-media.mjs';
await mkdir(new URL('../cache/',import.meta.url),{recursive:true});process.env.MUSIC_STATE_DIR=await mkdtemp(new URL('../cache/media-test-',import.meta.url));process.env.DASHSCOPE_API_KEY='synthetic-test-key';
const chat=await import('../chat-agent.mjs');
test('streamed files become native audio/video parts with metadata, without Base64 or local paths in requests',async()=>{
 const a=await saveUserMedia(Readable.from([Buffer.from('RIFF test audio')]),{name:'语音.wav',mime:'text/html',voice:true});
 const v=await saveUserMedia(Readable.from([Buffer.alloc(1024*1024,1),Buffer.from('tail')]),{name:'视频.mp4',mime:'video/mp4'});
 assert.equal(a.mime,'audio/wav');assert.equal(v.size,1024*1024+4);
 const result=await prepareUserMedia([a.id,v.id],{urlFor:async()=> 'oss://test/native'});
 assert.ok(result.content.some(p=>p.type==='input_audio'&&p.input_audio.data==='oss://test/native'));assert.ok(result.content.some(p=>p.type==='video_url'&&p.video_url.url==='oss://test/native'));assert.ok(!JSON.stringify(result.files).includes('path'));
 await assert.rejects(userMedia('../private/file'),/无效/);await assert.rejects(saveUserMedia(Readable.from(['x']),{name:'script.html',mime:'text/html'}),/音频或视频/);
});
test('attachments enter the parent context, survive as metadata after archival, and retain user-visible file records',async()=>{
 await chat.initChat();const a=await saveUserMedia(Readable.from(['audio']),{name:'sample.wav'}),v=await saveUserMedia(Readable.from(['video']),{name:'sample.mp4'});
 chat.chatServices.readMemory=async()=>({preferences:[]});chat.chatServices.prepareUserMedia=async(ids,options)=>prepareUserMedia(ids,{...options,urlFor:async()=> 'oss://test/file'});
 let seen;
 chat.chatServices.completion=async messages=>{seen=structuredClone(messages);return {message:{role:'assistant',content:'收到音视频'},content:'收到音视频',calls:[]};};
 const info=await chat.createConversation();await chat.sendMessage(info.id,{message:'看这个，帮我找相似的歌',attachmentIds:[a.id,v.id]});
 for(let i=0;i<500&&chat.getConversation(info.id).status!=='idle';i++)await new Promise(r=>setTimeout(r,5));
 const c=chat.getConversation(info.id);assert.equal(c.status,'idle');assert.ok(seen.some(m=>Array.isArray(m.content)&&m.content.some(p=>p.type==='video_url')));assert.equal(c.workspace.userMedia.length,2);assert.equal(c.timeline.find(e=>e.kind==='user').attachments.length,2);assert.ok(!c.messages.some(m=>Array.isArray(m.content)));
});
