// This feed belongs to the player window, independently of the selected chat.
window.musicPlayerClientId=crypto.randomUUID();
let playerSequence=0,playerLastPost=0,playerCommandChain=Promise.resolve();
function playerSnapshot(){return {sequence:++playerSequence,playback_cycle:window.musicPlaybackCycle||0,queue:queue.map((song,i)=>({...song,position:i+1})),current_position:index>=0?index+1:null,song:queue[index]||null,current_time:Number.isFinite(audio.currentTime)?audio.currentTime:0,duration:Number.isFinite(audio.duration)?audio.duration:null,paused:audio.paused,ended:audio.ended,volume:audio.volume,muted:audio.muted,mode:playMode};}
window.publishMusicPlayerState=async(force=false)=>{if(!force&&Date.now()-playerLastPost<1000)return;playerLastPost=Date.now();try{await post('/api/player/state',{clientId:window.musicPlayerClientId,state:playerSnapshot()});}catch{}};
function position(value,length=queue.length){if(!Number.isInteger(value)||value<1||value>length)throw Error('队列位置超出范围，请先查询当前播放列表。');return value-1;}
async function startPlayerSong(n){if(!queue[n]?.available)throw Error('该位置没有可播放歌曲。');if(n===index&&audio.getAttribute('src'))await audio.play();else await play(n);if(audio.paused)throw Error('浏览器未开始播放，请先在播放器点击一次播放或检查音源。');}
function waitPlayerMedia(event,ready){if(ready())return Promise.resolve();return new Promise((resolve,reject)=>{const cleanup=()=>{clearTimeout(timer);audio.removeEventListener(event,done);audio.removeEventListener('error',error);};const done=()=>{if(ready()){cleanup();resolve();}};const error=()=>{cleanup();reject(Error('音源加载或跳转失败。'));};const timer=setTimeout(()=>{cleanup();reject(Error('等待音源信息超时，请检查播放状态和音源。'));},15000);audio.addEventListener(event,done);audio.addEventListener('error',error);done();});}
async function editPlayerQueue(args){
 const currentSong=queue[index],wasPlaying=!audio.paused,oldIndex=index;
 if(args.action==='clear'){clearQueue();return;}
 if(['add','insert_next','replace'].includes(args.action)){
  if(!Array.isArray(args.songs)||!args.songs.length||args.songs.some(s=>!s.id||!s.available))throw Error('需要有效的可播放歌曲。');
  if(args.action==='replace'){const n=position(args.position||1,args.songs.length);audio.pause();audio.removeAttribute('src');audio.load();setQueue(args.songs,n);nowPlaying(queue[index]);if(args.autoplay)await startPlayerSong(index);return;}
  const at=args.action==='insert_next'?(index>=0?index+1:queue.length):args.position===undefined?queue.length:position(args.position,queue.length+1);
  queue.splice(at,0,...args.songs);index=currentSong?queue.indexOf(currentSong):0;nowPlaying(queue[index]);
 }else if(args.action==='move'){
  const from=position(args.from_position),to=position(args.position),[song]=queue.splice(from,1);queue.splice(to,0,song);index=currentSong?queue.indexOf(currentSong):-1;
 }else if(args.action==='reorder'){
  if(!Array.isArray(args.positions)||args.positions.length!==queue.length||new Set(args.positions).size!==queue.length)throw Error('重新排序需要当前全部位置的完整排列。');
  const ordered=args.positions.map(n=>queue[position(n)]);queue=ordered;index=currentSong?queue.indexOf(currentSong):-1;
 }else if(args.action==='remove'){
  const values=args.positions||(args.position===undefined?[]:[args.position]);if(!Array.isArray(values)||!values.length)throw Error('请指定要移除的位置。');
  const removed=new Set(values.map(n=>position(n)));queue=queue.filter((s,i)=>!removed.has(i));
  if(!queue.length){clearQueue();return;}
  index=queue.indexOf(currentSong);
  if(index<0){index=Math.min(Math.max(0,oldIndex-[...removed].filter(n=>n<oldIndex).length),queue.length-1);audio.pause();audio.removeAttribute('src');audio.load();nowPlaying(queue[index]);if(wasPlaying)await startPlayerSong(index);}
 }else throw Error('未知队列操作。');
 shuffleBag=[];playHistory=[];saveQueue();
}
async function applyPlayerCommand(command){
 const args=command.args||{};
 switch(command.action){
  case 'status':break;
  case 'schedule':schedulePlayerAction(args);return {...playerSnapshot(),schedules:listPlayerSchedules(args.conversationId)};
  case 'list_schedules':return {...playerSnapshot(),schedules:listPlayerSchedules(args.conversationId)};
  case 'cancel_schedules':cancelPlayerSchedules(args);return {...playerSnapshot(),schedules:listPlayerSchedules(args.conversationId)};
  case 'play_song':{if(!args.song?.id||!args.song.available)throw Error('歌曲不可播放。');let n=queue.findIndex(s=>s.id===args.song.id);if(n<0){queue.push(args.song);n=queue.length-1;shuffleBag=[];saveQueue();}await startPlayerSong(n);break;}
  case 'control':{
   if(args.action==='pause'){audio.pause();break;}
   if(!queue.length)throw Error('当前播放列表为空。');
   if(args.action==='play')await startPlayerSong(args.position===undefined?Math.max(0,index):position(args.position));
   else if(['next','previous'].includes(args.action)){await navigate(args.action==='next'?1:-1);if(audio.paused)throw Error('切换后未开始播放，请检查音源或浏览器播放许可。');}
   else throw Error('未知播放操作。');break;
  }
  case 'seek':{
   if(!Number.isFinite(args.seconds)||args.seconds<0)throw Error('播放时间需要非负秒数。');if(!queue[index])throw Error('当前没有歌曲。');
   if(!audio.getAttribute('src')){audio.src='/api/audio/'+encodeURIComponent(queue[index].id);audio.load();}
   await waitPlayerMedia('loadedmetadata',()=>Number.isFinite(audio.duration)&&audio.duration>0);
   audio.currentTime=Math.min(args.seconds,audio.duration);await waitPlayerMedia('seeked',()=>!audio.seeking);break;
  }
  case 'volume':if(!Number.isFinite(args.volume)||args.volume<0||args.volume>1)throw Error('音量应在 0 到 1 之间。');audio.volume=args.volume;if(typeof args.muted==='boolean')audio.muted=args.muted;$('#volume').value=audio.volume;localStorage.setItem('musicVolume',audio.volume);break;
  case 'mode':if(!['order','shuffle','single'].includes(args.mode))throw Error('未知播放模式。');playMode=args.mode;shuffleBag=[];playHistory=[];saveQueue();break;
  case 'queue':await editPlayerQueue(args);break;
  default:throw Error('未知播放器指令。');
 }
 return playerSnapshot();
}
const playerFeed=new EventSource('/api/player/events?clientId='+encodeURIComponent(window.musicPlayerClientId));
playerFeed.onopen=()=>window.publishMusicPlayerState(true);
playerFeed.onmessage=event=>{
 const command=JSON.parse(event.data);if(command.type==='ready'){window.publishMusicPlayerState(true);return;}if(command.type!=='command')return;
 playerCommandChain=playerCommandChain.catch(()=>{}).then(async()=>{
  let result;try{result={ok:true,state:await applyPlayerCommand(command)};}catch(e){result={ok:false,error:e.message,state:playerSnapshot()};}
  try{await post('/api/player/ack',{clientId:window.musicPlayerClientId,commandId:command.commandId,result});}catch(e){notice('播放操作确认失败：'+e.message);}
 });
};
for(const event of ['play','pause','timeupdate','seeked','loadedmetadata','volumechange','ended','error'])audio.addEventListener(event,()=>window.publishMusicPlayerState());
const playerStateTimer=setInterval(()=>window.publishMusicPlayerState(true),2000);
window.addEventListener('pagehide',()=>{clearInterval(playerStateTimer);playerFeed.close();});
