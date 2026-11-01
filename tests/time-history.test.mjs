import test from 'node:test';
import assert from 'node:assert/strict';
import {currentTime,TimerService} from '../time-tools.mjs';
import {PlayerHistory} from '../listening-history.mjs';
import {api} from '../netease.mjs';
import {readListeningHistory} from '../history-tools.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('clock reports actual epoch and timezone; background waits wake once and can be cancelled',async()=>{
 const t=currentTime('Asia/Shanghai');assert.ok(Math.abs(Date.now()-t.unix_ms)<1000);assert.equal(t.time_zone,'Asia/Shanghai');assert.throws(()=>currentTime('No/SuchZone'));
 const sent=[],service=new TimerService({send:(id,body)=>sent.push({id,body})});
 const timer=service.schedule({conversationId:'c',seconds:.02,reason:'继续'});await pause(40);assert.equal(sent.length,1);assert.equal(sent[0].id,'c');assert.equal(service.active(sent[0].body.automation),true);
 const cancelled=service.schedule({conversationId:'c',seconds:.02});service.cancel('c',cancelled.id);await pause(40);assert.equal(sent.length,1);
 const long=service.schedule({conversationId:'c',seconds:3000000});assert.ok(long.dueAt>Date.now());service.cancel('c',long.id);
 assert.throws(()=>service.schedule({conversationId:'c',atTime:'2026-10-31T23:00:00'}),/时区/);assert.throws(()=>service.schedule({conversationId:'c',seconds:-1}),/无效/);service.cancel('c',timer.id);
});
test('local playback history excludes model listening, pause time and seek jumps from estimated played time',()=>{
 let now=0;const history=new PlayerHistory({now:()=>now});
 const state=(time,paused=false,cycle=1)=>({song:{id:'s',name:'Song'},paused,current_time:time,playback_cycle:cycle});
 history.observe('w',state(0,true));assert.equal(history.list().total,0);
 history.observe('w',state(0));now=1000;history.observe('w',state(1));now=2000;history.observe('w',state(100));
 assert.equal(history.list().records[0].played_seconds,2);assert.equal(history.list().records[0].max_position,100);
 now=3000;history.observe('w',state(100,true));now=90000;history.observe('w',state(100,true));now=91000;history.observe('w',state(100));assert.equal(history.list().records[0].played_seconds,2);
 now=92000;history.observe('w',state(0,false,2));assert.equal(history.list().total,2);
});
test('NetEase recent-history reads are distinct from local history and permission failures stay visible',async()=>{
 const old=api.playHistory;try{
  api.playHistory=async limit=>{assert.equal(limit,2);return {data:[{id:'s',name:'Song',artistName:'Artist'}]};};
  const result=await readListeningHistory({source:'netease',limit:2});assert.equal(result.netease.records[0].artists,'Artist');assert.equal(result.netease.records[0].played_at,null);
  api.playHistory=async()=>{throw Error('permission denied');};const fallback=await readListeningHistory({source:'both'});assert.equal(fallback.netease.available,false);assert.ok(fallback.local);await assert.rejects(readListeningHistory({source:'netease'}),/permission/);
 }finally{api.playHistory=old;}
});
