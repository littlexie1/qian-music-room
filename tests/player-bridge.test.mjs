import test from 'node:test';
import assert from 'node:assert/strict';
import {PlayerBridge} from '../player-bridge.mjs';
test('player commands target their originating window and wait for actual confirmation',async()=>{
 const bridge=new PlayerBridge(),a=[],b=[];bridge.subscribe('a',x=>a.push(x));bridge.subscribe('b',x=>b.push(x));
 assert.throws(()=>bridge.state(),/多个/);
 let resolved=false;const pending=bridge.request('a','seek',{seconds:90}).then(r=>{resolved=true;return r;});
 const command=a.at(-1);assert.equal(command.action,'seek');assert.equal(b.length,1);await Promise.resolve();assert.equal(resolved,false);
 assert.throws(()=>bridge.acknowledge('b',command.commandId,{ok:true}),/不匹配/);
 bridge.acknowledge('a',command.commandId,{ok:true,state:{sequence:2,queue:[],current_time:90}});
 const result=await pending;assert.equal(result.verified,true);assert.equal(result.state.current_time,90);
 bridge.update('a',{sequence:1,queue:[],current_time:1});assert.equal(bridge.state('a').current_time,90);
 assert.throws(()=>bridge.choose('missing'),/未连接/);
});
test('browser failure, disconnection, cancellation and missing receipts are never reported as success',async()=>{
 const bridge=new PlayerBridge({timeoutMs:15}),events=[];const close=bridge.subscribe('one',x=>events.push(x));
 const failure=bridge.request('one','control',{action:'play'});bridge.acknowledge('one',events.at(-1).commandId,{ok:false,error:'browser refused'});await assert.rejects(failure,/browser refused/);
 const cancelled=new AbortController(),work=bridge.request('one','control',{action:'pause'},cancelled.signal);cancelled.abort();await assert.rejects(work);
 const timeout=bridge.request('one','control',{action:'next'});await assert.rejects(timeout,/未收到/);
 const disconnected=bridge.request('one','status');close();await assert.rejects(disconnected,/断开/);assert.equal(bridge.pending.size,0);
});
