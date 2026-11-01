import {randomUUID} from 'node:crypto';

export class PlayerBridge {
 constructor({timeoutMs=30000}={}){this.clients=new Map();this.pending=new Map();this.timeoutMs=timeoutMs;this.observers=new Set();}
 observe(fn){this.observers.add(fn);return ()=>this.observers.delete(fn);}
 subscribe(id,send){
  if(typeof id!=='string'||!id)throw Error('缺少播放器窗口编号。');
  const client={id,send,state:null};this.clients.get(id)?.close?.();this.clients.set(id,client);
  const close=()=>{if(this.clients.get(id)!==client)return;this.clients.delete(id);for(const pending of this.pending.values())if(pending.client===client)pending.reject(Error('播放器窗口已断开，未确认操作结果。'));};
  client.close=close;send({type:'ready'});return close;
 }
 update(id,state){const c=this.clients.get(id);if(!c)throw Error('播放器窗口尚未连接。');if(!state||!Array.isArray(state.queue)||!Number.isInteger(state.sequence))throw Error('播放器状态无效。');if(!c.state||state.sequence>c.state.sequence){c.state={...state,reported_at:new Date().toISOString()};for(const observer of this.observers)observer(id,c.state);}return c;}
 choose(id){if(id){const c=this.clients.get(id);if(!c)throw Error('发出指令的播放器窗口未连接，请在该窗口刷新后重试。');return c;}const list=[...this.clients.values()];if(list.length!==1)throw Error(list.length?'打开了多个播放器窗口，请在要控制的窗口发送指令。':'播放器窗口未打开，请先打开音乐室。');return list[0];}
 state(id){const c=this.choose(id);if(!c.state)throw Error('播放器尚未上报状态，请稍后重试。');return c.state;}
 request(id,action,args={},signal){
  signal?.throwIfAborted();const client=this.choose(id),commandId=randomUUID();
  return new Promise((resolve,reject)=>{
   let timer;const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);this.pending.delete(commandId);};
   const fail=error=>{cleanup();reject(error);};const abort=()=>fail(signal.reason||Error('操作已取消。'));
   this.pending.set(commandId,{client,resolve:result=>{cleanup();resolve(result);},reject:fail});
   timer=setTimeout(()=>fail(Error('未收到播放器执行确认。先查询播放状态再决定是否重试，避免重复插入歌曲。')),this.timeoutMs);
   signal?.addEventListener('abort',abort,{once:true});
   try{client.send({type:'command',commandId,action,args});}catch(e){fail(e);}
  });
 }
 acknowledge(id,commandId,result){
  const pending=this.pending.get(commandId);if(pending&&pending.client.id!==id)throw Error('播放器窗口与操作编号不匹配。');
  if(result?.state)this.update(id,result.state);
  if(!pending)return {accepted:false};
  if(result?.ok!==true)pending.reject(Error(result?.error||'播放器未完成操作。'));
  else pending.resolve({verified:true,...result,state:this.state(id)});
  return {accepted:true};
 }
}
export const playerBridge=new PlayerBridge();
