import test from 'node:test';
import assert from 'node:assert/strict';
import {PlayerBridge} from '../player-bridge.mjs';
import {ListeningDJ} from '../player-dj.mjs';
const song=id=>({id,name:id,available:true});
test('spoken listening mode wakes the same conversation once per playback cycle with actual audio requested',async()=>{
 const bridge=new PlayerBridge(),sent=[];bridge.subscribe('window',()=>{});const dj=new ListeningDJ({bridge,send:(id,body)=>sent.push({id,body})});
 let sequence=0;const update=(extra={})=>bridge.update('window',{sequence:++sequence,queue:[song('a')],song:song('a'),current_position:1,paused:true,playback_cycle:1,...extra});
 update();dj.configure('window','conversation','listen');await Promise.resolve();assert.equal(sent.length,0);
 update({paused:false});update({paused:false,current_time:20});assert.equal(sent.length,1);assert.equal(sent[0].id,'conversation');assert.equal(sent[0].body.listenId,'a');assert.equal(sent[0].body.playerClientId,'window');
 update({paused:false,playback_cycle:2});assert.equal(sent.length,2);
 const tag=sent[1].body.automation;assert.equal(dj.active(tag),true);dj.configure(null,'conversation','off');assert.equal(dj.active(tag),false);
 update({paused:false,playback_cycle:3});assert.equal(sent.length,2);
});
test('radio bootstraps an empty queue once and requests refill only on track changes or loss of the prepared next song',()=>{
 const bridge=new PlayerBridge(),sent=[];bridge.subscribe('w',()=>{});const dj=new ListeningDJ({bridge,send:(id,body)=>sent.push(body)});dj.configure('w','c','radio');
 let sequence=0;const update=s=>bridge.update('w',{sequence:++sequence,playback_cycle:1,...s});
 update({queue:[],song:null,current_position:null,paused:true});update({queue:[],song:null,current_position:null,paused:true});assert.equal(sent.length,1);assert.equal(sent[0].listenId,undefined);
 update({queue:[song('a')],song:song('a'),current_position:1,paused:false});assert.equal(sent.length,2);assert.match(sent[1].message,/自己搜索候选/);
 update({queue:[song('a'),song('b')],song:song('a'),current_position:1,paused:false});assert.equal(sent.length,2);
 update({queue:[song('a')],song:song('a'),current_position:1,paused:false});assert.equal(sent.length,3);
 update({queue:[song('a')],song:song('a'),current_position:1,paused:false});assert.equal(sent.length,3);
 update({queue:[song('a'),song('b')],song:song('b'),current_position:2,paused:false,playback_cycle:2});assert.equal(sent.length,4);
});
