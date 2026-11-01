// Execute time-critical player actions in the actual player, without LLM latency.
const playerSchedules=new Map();
function listPlayerSchedules(conversationId){return [...playerSchedules.values()].filter(c=>!conversationId||c.conversationId===conversationId).map(c=>({...c}));}
function cancelPlayerSchedules({conversationId,id}={}){let cancelled=0;for(const cue of playerSchedules.values())if(cue.status==='scheduled'&&(!conversationId||cue.conversationId===conversationId)&&(!id||cue.id===id)){cue.status='cancelled';cue.reason='已取消';cancelled++;}return {cancelled};}
function schedulePlayerAction(args){
 if(!args.id||!args.conversationId)throw Error('定时操作缺少编号或所属对话。');if(playerSchedules.has(args.id))return playerSchedules.get(args.id);
 if(!['volume','play','pause','next','previous','mode'].includes(args.action))throw Error('不支持的定时操作。');
 if(args.action==='volume'&&(!Number.isFinite(args.volume)||args.volume<0||args.volume>1))throw Error('音量应在0到1之间。');
 if(args.action==='mode'&&!['order','shuffle','single'].includes(args.mode))throw Error('未知播放模式。');
 if(!['track_time','delay','clock'].includes(args.trigger))throw Error('未知计时方式。');
 if(args.trigger!=='clock'&&(!Number.isFinite(args.seconds)||args.seconds<0))throw Error('需要非负秒数。');
 const cue={...args,status:'scheduled',created_at:new Date().toISOString()};
 if(args.trigger==='clock'){if(typeof args.at_time!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(args.at_time)||!Number.isFinite(Date.parse(args.at_time)))throw Error('绝对时间需要有效的ISO时间和时区。');cue.deadline=Date.parse(args.at_time);}
 if(args.trigger==='delay'){cue.deadline=Date.now()+args.seconds*1000;if(!Number.isFinite(new Date(cue.deadline).getTime()))throw Error('计时时间超出日期范围。');}
 if(args.trigger==='track_time'||args.bind_current_song){if(!queue[index])throw Error('当前没有可以绑定的歌曲。');cue.song_id=queue[index].id;cue.playback_cycle=audio.getAttribute('src')?(window.musicPlaybackCycle||0):null;}
 if(args.trigger==='track_time'&&Number.isFinite(audio.duration)&&args.seconds>audio.duration)throw Error('指定时间超过当前歌曲长度。');
 playerSchedules.set(cue.id,cue);queueMicrotask(runPlayerSchedules);return cue;
}
function runPlayerSchedules(){for(const cue of playerSchedules.values()){
 if(cue.status!=='scheduled')continue;
 if(cue.song_id){if(queue[index]?.id!==cue.song_id||(cue.playback_cycle!==null&&cue.playback_cycle!==(window.musicPlaybackCycle||0))){cue.status='cancelled';cue.reason='已切歌或重播，取消旧歌曲上的定时操作';continue;}if(cue.playback_cycle===null&&audio.getAttribute('src'))cue.playback_cycle=window.musicPlaybackCycle||0;}
 const due=cue.trigger==='track_time'?!audio.paused&&audio.currentTime>=cue.seconds:Date.now()>=cue.deadline;if(!due)continue;
 cue.status='running';const action=cue.action==='volume'?'volume':cue.action==='mode'?'mode':'control';
 Promise.resolve().then(()=>applyPlayerCommand({action,args:{...cue,action:cue.action}})).then(state=>{cue.status='completed';cue.executed_at=new Date().toISOString();cue.actual_time=state.current_time;cue.actual_volume=state.volume;}).catch(e=>{cue.status='failed';cue.error=e.message;}).finally(()=>window.publishMusicPlayerState?.(true));
}}
for(const name of ['timeupdate','play','pause','seeked','loadedmetadata','ended'])audio.addEventListener(name,runPlayerSchedules);
const playerCueClock=setInterval(runPlayerSchedules,100);
window.addEventListener('pagehide',()=>clearInterval(playerCueClock));
