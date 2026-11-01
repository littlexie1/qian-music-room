import {randomUUID} from 'node:crypto';
export function currentTime(timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone){const now=new Date();return {unix_ms:now.getTime(),iso_utc:now.toISOString(),time_zone:timeZone,local_time:new Intl.DateTimeFormat('zh-CN',{timeZone,dateStyle:'full',timeStyle:'long',hour12:false}).format(now)};}
export class TimerService {
 constructor({now=Date.now,send}={}){this.now=now;this.send=send;this.timers=new Map();}
 active(tag){return this.timers.get(tag.timerId)?.status==='fired';}
 schedule({conversationId,clientId,seconds,atTime,reason,kind='reminder'}){
  if(!conversationId)throw Error('定时器需要当前对话。');
  if((seconds!==undefined)===(atTime!==undefined))throw Error('请只指定等待秒数或绝对时间中的一种。');
  if(atTime!==undefined&&(!/(Z|[+-]\d\d:\d\d)$/.test(atTime)))throw Error('绝对时间需要包含时区，例如 2026-10-31T23:00:00+08:00。');
  const dueAt=atTime===undefined?this.now()+seconds*1000:Date.parse(atTime);
  if(!Number.isFinite(dueAt)||!Number.isFinite(new Date(dueAt).getTime())||(seconds!==undefined&&(!Number.isFinite(seconds)||seconds<0)))throw Error('定时时间无效。');
  const timer={id:'timer:'+randomUUID(),conversationId,clientId,kind,reason:reason||'等待结束，继续之前的请求。',due_at:new Date(dueAt).toISOString(),dueAt,status:'scheduled'};
  this.timers.set(timer.id,timer);this.arm(timer);return this.public(timer);
 }
 public(timer){const {handle,...value}=timer;return value;}
 arm(timer){timer.handle=setTimeout(()=>{if(timer.status!=='scheduled')return;if(this.now()<timer.dueAt){this.arm(timer);return;}timer.status='fired';delete timer.handle;Promise.resolve().then(()=>this.send?.(timer.conversationId,{message:'[后台定时器到期，沿用原对话与用户最新指令，不是新的用户偏好]\n'+timer.reason,playerClientId:timer.clientId,requestId:timer.id,automation:{type:'timer',timerId:timer.id},automationLabel:'⏰ 等待结束：'+timer.reason})).catch(e=>{timer.status='failed';timer.error=e.message;});},Math.max(0,Math.min(2147483647,timer.dueAt-this.now())));timer.handle.unref?.();}
 list(conversationId){return [...this.timers.values()].filter(t=>t.conversationId===conversationId).map(t=>this.public(t));}
 cancel(conversationId,id,kind){let cancelled=0;for(const t of this.timers.values())if(t.conversationId===conversationId&&(!id||t.id===id)&&(!kind||t.kind===kind)&&['scheduled','fired'].includes(t.status)){clearTimeout(t.handle);delete t.handle;t.status='cancelled';cancelled++;}return {cancelled};}
}
export const timerService=new TimerService();
