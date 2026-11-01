import {randomUUID} from 'node:crypto';

export function archiveAudio(messages){
 return messages.map(message=>Array.isArray(message.content)?{...message,content:message.content.filter(p=>p.type==='text').map(p=>p.text).join('\n')+'\n[原始音频曾在此处提供，现已归档；需确认细节时重新试听]'}:structuredClone(message));
}
export function repairMessages(messages){
 const result=[];
 for(let i=0;i<messages.length;i++){
  const message=messages[i];if(message.role==='tool')continue;result.push(structuredClone(message));
  if(!message.tool_calls?.length)continue;
  const results=[];while(messages[i+1]?.role==='tool')results.push(messages[++i]);
  for(const call of message.tool_calls)result.push(structuredClone(results.find(r=>r.tool_call_id===call.id)||{role:'tool',tool_call_id:call.id,content:JSON.stringify({interrupted:true,error:'执行结果未记录；先核对已有结果，再决定是否重试，不要重复创建歌单。'})}));
 }
 return result;
}
const synthetic=s=>/^这是自主执行任务，请基于任务状态继续调用工具完成/.test(s||'');
const developmentIds=new Set(['f9be3184-1a78-48a6-88ba-2ab4180350ef','48dd38f7-860d-447a-b31d-48456701b527','7fb7a064-9b23-45bf-8f38-0b8755196d6b','4bd017cb-20ed-4361-8f74-69feafa76b74']);
export function blankWorkspace(){return {goal:'',plan:[],selected:[],heard:[],listening:{},playlists:{},writes:[],candidates:{},instructions:[],recentPlaylists:[],requireListening:true,wantPlaylist:false,allowedPlaylistIds:[]};}
export function mergeWorkspace(workspace,previous){
 for(const s of previous.selected||[])if(!workspace.selected.some(x=>x.id===s.id))workspace.selected.push(s);
 workspace.heard=[...new Set([...workspace.heard,...(previous.heard||[])])];
 Object.assign(workspace.listening,previous.listening||{});Object.assign(workspace.candidates,previous.candidates||{});
 for(const p of Object.values(previous.playlists||{}))workspace.playlists[p.id]={...workspace.playlists[p.id],...p};
 for(const op of previous.writes||[])if(!workspace.writes.some(w=>JSON.stringify(w)===JSON.stringify(op)))workspace.writes.push(op);
 workspace.goal=previous.goal||workspace.goal;workspace.plan=previous.plan||workspace.plan;
 workspace.recentPlaylists=Object.values(workspace.playlists);
}
export function entryForMessage(message,at){
 const id=randomUUID();const content=typeof message.content==='string'?message.content:'';
 if(message.role==='user'){
  if(synthetic(content))return null;
  if(/完整实际音频|原始音频曾在此处|实际音频已在前轮提供|请原生听歌曲/.test(content))return {id,kind:'audio',content:'原生试听音频',at};
  return {id,kind:'user',content:content.replace(/^\[任务中途补充指令[^\]]*\]\n/,''),at};
 }
 if(message.role==='assistant'&&content)return {id,kind:'assistant',content,at};
 return null;
}
export function timelineFromMessages(messages,at){
 const timeline=[];const tools=new Map();
 for(const m of messages){
  const e=entryForMessage(m,at);if(e)timeline.push(e);
  for(const c of m.tool_calls||[]){let args;try{args=JSON.parse(c.function.arguments||'{}');}catch{args={raw:c.function.arguments};}const entry={id:randomUUID(),kind:'tool',name:c.function.name,callId:c.id,args,state:'interrupted',at};tools.set(c.id,entry);timeline.push(entry);}
  if(m.role==='tool'){const entry=tools.get(m.tool_call_id);if(entry){try{entry.result=JSON.parse(m.content);}catch{entry.result=m.content;}entry.state=entry.result?.error?'error':entry.result?.interrupted||entry.result?.skipped?'interrupted':'done';}}
 }
 return timeline;
}
export function migrateConversation(old,runs){
 if(old.schemaVersion===2)return old;
 const relevant=runs.filter(t=>t.conversationId===old.id&&!developmentIds.has(t.id)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 let messages=[];const workspace=blankWorkspace();const timeline=[];
 for(const run of relevant){
  let snapshot=archiveAudio(repairMessages(run.messages||[]));
  const start=snapshot.findLastIndex(m=>m.role==='user'&&m.content===run.goal);
  if(!messages.length&&start>0){const prefix=snapshot.slice(0,start).filter(m=>!synthetic(m.content));messages.push(...prefix);timeline.push(...timelineFromMessages(prefix,run.createdAt));}
  let tail=start>=0?snapshot.slice(start):[{role:'user',content:run.goal},...snapshot];
  tail=tail.filter(m=>!synthetic(m.content));
  if(!snapshot.length)tail=[{role:'user',content:run.goal}];
  messages.push(...tail);timeline.push(...timelineFromMessages(tail,run.createdAt));
  if(run.summary&&tail.at(-1)?.content!==run.summary){const summary={role:'assistant',content:run.summary};messages.push(summary);timeline.push(entryForMessage(summary,run.updatedAt));}
  if(run.error){const text='执行中断：'+run.error;messages.push({role:'assistant',content:'[执行状态记录] '+text});timeline.push({id:randomUUID(),kind:'status',content:text,at:run.updatedAt});}
  else if(['cancelled','interrupted','stopping'].includes(run.status))timeline.push({id:randomUUID(),kind:'status',content:'这次执行已停止，已完成的操作保留。',at:run.updatedAt});
  mergeWorkspace(workspace,run);
 }
 if(!relevant.length){messages=archiveAudio(repairMessages(old.messages||[]));timeline.push(...timelineFromMessages(messages,old.createdAt));}
 const last=relevant.at(-1);const needsContinue=last&&['failed','cancelled','interrupted','running','queued','stopping','blocked'].includes(last.status);
 return {id:old.id,title:old.title,createdAt:old.createdAt,updatedAt:old.updatedAt,schemaVersion:2,archived:!!old.archived,messages,timeline,workspace,incoming:[],requests:[],sequence:0,legacyTaskIds:relevant.map(t=>t.id),status:needsContinue?'stopped':'idle',phase:needsContinue?'此前执行已停止，可以在这里接着说。':'',round:0,toolCount:0,error:last?.error||null};
}
