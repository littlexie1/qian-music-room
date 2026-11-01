import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {playerBridge} from './player-bridge.mjs';
export class PlayerHistory {
 constructor({bridge,now=Date.now}={}){this.records=[];this.last=new Map();this.now=now;this.writes=Promise.resolve();bridge?.observe((id,s)=>this.observe(id,s));}
 async init(file){this.file=file;try{this.records=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}await mkdir(dirname(file),{recursive:true});}
 observe(clientId,state){
  const previous=this.last.get(clientId),key=state.song?String(state.song.id)+':'+(state.playback_cycle||0):null,now=this.now();
  let record=previous?.key===key?previous.record:null;
  if(!record&&state.song&&!state.paused){record={id:randomUUID(),source:'local_player',song:{...state.song},started_at:new Date(now).toISOString(),last_seen_at:new Date(now).toISOString(),played_seconds:0,max_position:0};this.records.push(record);}
  if(record){const current=Number(state.current_time)||0;if(previous?.record===record&&!previous.paused){const advanced=Math.max(0,current-previous.position),elapsed=Math.max(0,(now-previous.at)/1000);record.played_seconds+=Math.min(advanced,elapsed);}record.max_position=Math.max(record.max_position,current);record.last_seen_at=new Date(now).toISOString();record.current_position=current;this.persist();}
  this.last.set(clientId,{key,record,paused:state.paused,position:Number(state.current_time)||0,at:now});
 }
 persist(){if(!this.file)return;const snapshot=JSON.stringify(this.records);this.writes=this.writes.catch(()=>{}).then(async()=>{await writeFile(this.file+'.tmp',snapshot);await rename(this.file+'.tmp',this.file);});this.writes.catch(()=>{});}
 list(offset=0,limit=100){if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1)throw Error('历史记录分页参数无效。');return {source:'local_player',total:this.records.length,records:[...this.records].reverse().slice(offset,offset+limit),note:'实际播放片段的本地记录；played_seconds为估计播放时长，跳过与拖动不算完整听过；此记录不会自动回传网易云。'};}
}
export const playerHistory=new PlayerHistory({bridge:playerBridge});
