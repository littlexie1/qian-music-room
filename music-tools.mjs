import {readFile,writeFile,rename,stat} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {join} from 'node:path';
import {api,records,ROOT} from './netease.mjs';
import {song,playlist} from './music-shapes.mjs';
import {getKey,MODEL} from './qwen.mjs';
import {mediaUrl} from './upload.mjs';
import {setSongLiked,setPlaylistSubscribed} from './music-actions.mjs';
import {webSearch} from './web-search.mjs';
import {playerBridge} from './player-bridge.mjs';
import {listeningDJ} from './player-dj.mjs';
import {currentTime,timerService} from './time-tools.mjs';
import {readListeningHistory} from './history-tools.mjs';
import {prepareUserMedia} from './user-media.mjs';
import {randomUUID} from 'node:crypto';
const str={type:'string'},ids={type:'array',items:str},offset={type:'integer',minimum:0};
const definitions=[
 ['read_user_media','重新原生读取当前对话中用户发送的音频或视频附件。id取自userMedia或附件标注；不要猜测附件内容。',{id:str},['id']],
 ['get_current_time','读取真实当前时间、时区、UTC时间和Unix毫秒。time_zone可指定IANA时区，如Asia/Shanghai。',{time_zone:str},[]],
 ['sleep','后台等待指定秒数，到点唤醒本主对话继续reason。会暂停本轮Agent执行，不阻塞服务；用户新消息会打断sleep。不要用sleep猜测歌曲进度，精确定点播放器操作用schedule_player_action。',{seconds:{type:'number',minimum:0},reason:str},['seconds']],
 ['set_timer','设置后台提醒，到时唤醒当前主对话继续reason。seconds与at_time只选一个；at_time必须是带时区的ISO时间。精确定点调音量用schedule_player_action，不等待模型推理。',{seconds:{type:'number',minimum:0},at_time:str,reason:str},['reason']],
 ['list_timers','查看本对话的后台计时和播放器定时操作及执行/取消结果。',{},[]],
 ['cancel_timer','取消本对话的指定定时器；不传id则取消全部后台计时及播放器定时操作。',{id:str},[]],
 ['schedule_player_action','让播放器按时直接执行操作，无需等模型再次推理。trigger=track_time时seconds是当前歌曲的播放位置，暂停期间不推进，切歌/重播自动取消；delay是从现在起秒数；clock使用带时区的at_time。action可为volume/play/pause/next/previous/mode；volume取0到1，mode取order/shuffle/single；delay/clock可bind_current_song。返回scheduled只代表已安排，执行结果用list_timers查询。',{trigger:{type:'string',enum:['track_time','delay','clock']},seconds:{type:'number',minimum:0},at_time:str,action:{type:'string',enum:['volume','play','pause','next','previous','mode']},volume:{type:'number',minimum:0,maximum:1},muted:{type:'boolean'},mode:{type:'string',enum:['order','shuffle','single']},bind_current_song:{type:'boolean'}},['trigger','action']],
 ['listening_history','查询用户听歌记录。source=netease读取网易云账号最近播放记录；local读取本音乐室实际播放片段历史；both同时查询。limit指定条数，本地另支持offset；网易云接口仅提供最近记录，不代表完整历史。模型试听笔记不是用户听歌记录，短暂播放也不等于完整听过。',{source:{type:'string',enum:['netease','local','both']},limit:{type:'integer',minimum:1},offset},[]],
 ['set_listening_mode','用户明确要求后开启或停止自动陪听/续歌循环。off停止；listen每首开始后在本主对话原生听音频并简短评价；dj陪听评价并持续找歌加下一首；radio持续原生试听筛选并接下一首但不逐首评价。不需新建任务，不创建网易云歌单；应先说明模式已开启，后续由播放器事件自动唤醒本对话。',{mode:{type:'string',enum:['off','listen','dj','radio']}},['mode']],
 ['get_player_state','读取发出消息的播放器窗口的真实歌曲、播放时间（秒）、音量、模式和完整队列；位置从1开始。',{},[]],
 ['control_playback','控制本机播放器继续/暂停、上一首/下一首，或播放当前队列指定位置；不修改网易云歌单。',{action:{type:'string',enum:['play','pause','next','previous']},position:{type:'integer',minimum:1}},['action']],
 ['seek_playback','把当前歌曲跳转到指定秒数，保留原来的播放或暂停状态。',{seconds:{type:'number',minimum:0}},['seconds']],
 ['set_volume','设置本机音量，0为静音、1为最大音量；可另设muted静音开关。',{volume:{type:'number',minimum:0,maximum:1},muted:{type:'boolean'}},['volume']],
 ['set_play_mode','切换播放模式：order顺序、shuffle随机、single单曲循环。',{mode:{type:'string',enum:['order','shuffle','single']}},['mode']],
 ['edit_play_queue','编辑本机播放队列，先get_player_state确认位置，位置从1开始。add追加或插到position；insert_next插入下一首；move从from_position移动到position；remove删除positions或position；reorder用positions给出完整新顺序（如[3,1,2]）；replace替换整队列；clear清空。add/insert_next/replace使用song_ids；replace默认不播放，可明确autoplay。移除当前曲会切换到相邻曲并保持播放/暂停状态。不会删除网易云歌单内的歌曲。',{action:{type:'string',enum:['add','insert_next','move','remove','reorder','replace','clear']},song_ids:ids,position:{type:'integer',minimum:1},from_position:{type:'integer',minimum:1},positions:{type:'array',items:{type:'integer',minimum:1}},autoplay:{type:'boolean'}},['action']],
 ['web_search','联网查询曲目背景、创作者、音乐风格和其他公开资料，返回检索摘要与来源链接。网页描述不能代替实际试听；不要上传用户完整歌单或对话，仅提交必要查询词。',{query:str},['query']],
 ['set_plan','记录或更新本任务的执行计划。每步为普通文字，完成后可更新。',{steps:ids},['steps']],
 ['update_task_options','只有用户明确更改要求时，更新是否需要建歌单、是否必须原生试听的完成条件。不得自行降低要求以提前完成。',{make_playlist:{type:'boolean'},require_listening:{type:'boolean'}},[]],
 ['remove_selection','用户变更要求后移除不再符合要求的入选歌曲；仅更改候选清单，不会自动删除网易云中的歌曲。',{id:str,reason:str},['id','reason']],
 ['like_song','按用户明确要求红心或取消红心歌曲，不要自行修改用户喜欢列表',{id:str,liked:{type:'boolean'}},['id','liked']],
 ['collect_playlist','按用户明确要求收藏或取消收藏歌单',{id:str,subscribed:{type:'boolean'}},['id','subscribed']],
 ['search','搜索真实歌曲或歌单；支持 offset 翻页，不应只依赖第一批候选',{keyword:str,type:{type:'string',enum:['song','playlist']},offset},['keyword']],
 ['daily','读取每日推荐歌曲',{},[]],
 ['recommended_playlists','读取网易云推荐歌单',{},[]],
 ['my_playlists','读取用户创建或收藏的歌单，支持翻页',{kind:{type:'string',enum:['created','collected']},offset},[]],
 ['liked_songs','读取用户红心歌单歌曲，支持翻页',{offset},[]],
 ['playlist','读取歌单中的真实歌曲，支持翻页',{id:str,offset},['id']],
 ['listen_song','获取完整授权音频并附加到下一轮，供你原生聆听。调用成功不代表已经分析，下一轮处理音频后才能写听感',{id:str},['id']],
 ['record_listening','在原生听过音频后，保存简短听感及入选/淘汰决定。听感必须来自真实音频',{id:str,impression:str,selected:{type:'boolean'},reason:str},['id','impression','selected','reason']],
 ['select_song','按用户要求选歌。不要求试听的明确歌名任务可用；需按声音筛选时先 listen_song 和 record_listening。',{id:str,reason:str},['id','reason']],
 ['create_playlist','在用户网易云账号真正创建歌单。key 是任务内此歌单的唯一标识，重复调用同一 key 返回原歌单，避免重复建单',{name:str,key:str},['name','key']],
 ['use_existing_playlist','用户明确说要修改某个已有歌单或刚才的歌单时，验证这是用户自己的目标歌单，并将其设为本任务写入目标',{id:str},['id']],
 ['add_to_playlist','向任务创建的歌单或用户明确指定的目标歌单添加已选歌曲；会过滤重复并核对是否实际写入',{id:str,song_ids:ids},['id','song_ids']],
 ['update_playlist_description','更新任务创建的歌单的简介',{id:str,description:str},['id','description']],
 ['verify_playlist','重新从网易云读取歌单，检查选中歌曲是否确实存在。完成建单任务前必须调用',{id:str},['id']],
 ['play_song','在播放器播放歌曲',{id:str},['id']],
 ['play_playlist','将一个歌单中的可播放歌曲加入本地队列，并播放第一首',{id:str},['id']],
 ['save_preference','保存用户明确表达的长期音乐偏好或反馈；不把自己的猜测当用户偏好',{note:str},['note']],
 ['finish_task','任务做完后调用。创建歌单时必须已写入歌曲且核对成功；如受权限限制无法完成，明确说明阻碍，outcome 用 blocked',{summary:str,outcome:{type:'string',enum:['completed','blocked']}},['summary','outcome']],
];
export const toolSpecs=definitions.map(([name,description,properties,required])=>({type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}}));
const musicMemoryFile=join(process.env.MUSIC_STATE_DIR||join(ROOT,'state'),'music-memory.json');
export async function readMemory(){try{return JSON.parse(await readFile(musicMemoryFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {preferences:[],listening:{}};}}
let memoryUpdates=Promise.resolve();
async function updateMusicMemory(change){const operation=memoryUpdates.catch(()=>{}).then(async()=>{const memory=await readMemory();change(memory);await writeFile(musicMemoryFile+'.tmp',JSON.stringify(memory,null,2));await rename(musicMemoryFile+'.tmp',musicMemoryFile);});memoryUpdates=operation;await operation;}
const downloads=new Map();
export async function audioFile(id,signal){if(!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('歌曲 ID 无效');if(downloads.has(id))return downloads.get(id);const work=(async()=>{const path=join(ROOT,'cache',id+'.mp3');try{if((await stat(path)).size)return path;}catch(e){if(e.code!=='ENOENT')throw e;}const r=await api.playurl(id);if(!r.data.url)throw Error('开放接口未提供此歌曲音源，不能试听。请换候选，不能从歌名推测听感。');const response=await fetch(r.data.url,{signal});if(!response.ok)throw Error('音源下载失败 '+response.status);const part=path+'.part';await pipeline(Readable.fromWeb(response.body),createWriteStream(part),{signal});await rename(part,path);return path;})();downloads.set(id,work);try{return await work;}finally{downloads.delete(id);}}
async function allTracks(id,signal){let list=[],page;do{signal?.throwIfAborted();page=records((await api.playlist(id,list.length)).data);list.push(...page.map(song));}while(page.length===100);return list;}
export function publicTask(task){return {id:task.id,conversationId:task.conversationId,goal:task.goal,mode:task.mode,status:task.status,phase:task.phase,plan:task.plan,selected:task.selected,playlists:task.playlists,summary:task.summary,createdAt:task.createdAt,updatedAt:task.updatedAt,error:task.error,round:task.round,toolCount:task.toolCount,instructions:task.instructions||[]};}
export async function executeTool(name,args,ctx){
 const {task,emit,save,signal}=ctx;signal.throwIfAborted();let result;
 const candidates=task.candidates;
 const remember=list=>{for(const s of list)candidates[s.id]=s;return list;};
 const getSong=async id=>candidates[id]||(candidates[id]=song((await api.song(id)).data));
 const owned=id=>Object.values(task.playlists).some(p=>p.id===id);
 const selected=id=>task.selected.some(s=>s.id===id);
 switch(name){
 case 'web_search':return webSearch(args.query,{signal});
 case 'get_current_time':return currentTime(args.time_zone);
 case 'sleep':{const t=timerService.schedule({conversationId:ctx.conversationId,clientId:ctx.playerClientId,seconds:args.seconds,reason:args.reason,kind:'sleep'});return {...t,backgroundWait:true,wake_at:t.due_at};}
 case 'set_timer':return timerService.schedule({conversationId:ctx.conversationId,clientId:ctx.playerClientId,seconds:args.seconds,atTime:args.at_time,reason:args.reason});
 case 'schedule_player_action':{const id='cue:'+randomUUID(),r=await playerBridge.request(ctx.playerClientId,'schedule',{...args,id,conversationId:ctx.conversationId},signal);return {...r,scheduled:true,timer_id:id};}
 case 'list_timers':{const result={background:timerService.list(ctx.conversationId)};if(ctx.playerClientId&&playerBridge.clients.has(ctx.playerClientId)){const r=await playerBridge.request(ctx.playerClientId,'list_schedules',{conversationId:ctx.conversationId},signal);result.player=r.state.schedules;}else result.playerUnavailable=true;return result;}
 case 'cancel_timer':{const result={background:timerService.cancel(ctx.conversationId,args.id)};if((!args.id||args.id.startsWith('cue:'))&&ctx.playerClientId&&playerBridge.clients.has(ctx.playerClientId)){const r=await playerBridge.request(ctx.playerClientId,'cancel_schedules',{conversationId:ctx.conversationId,id:args.id},signal);result.player=r.state.schedules;}return result;}
 case 'listening_history':return readListeningHistory(args);
 case 'read_user_media':{if(!task.userMedia?.some(x=>x.id===args.id))throw Error('该附件不在当前对话中。');const m=await prepareUserMedia([args.id],{signal});ctx.media.push(...m.content);return {attached:true,files:m.files};}
 case 'get_player_state':{const result=await playerBridge.request(ctx.playerClientId,'status',{},signal);return {...result,listening:listeningDJ.status(ctx.playerClientId||playerBridge.choose().id)};}
 case 'set_listening_mode':return listeningDJ.configure(ctx.playerClientId,ctx.conversationId,args.mode);
 case 'control_playback':return playerBridge.request(ctx.playerClientId,'control',args,signal);
 case 'seek_playback':return playerBridge.request(ctx.playerClientId,'seek',args,signal);
 case 'set_volume':return playerBridge.request(ctx.playerClientId,'volume',args,signal);
 case 'set_play_mode':return playerBridge.request(ctx.playerClientId,'mode',args,signal);
 case 'edit_play_queue':{const payload={...args};if(['add','insert_next','replace'].includes(args.action)){if(!Array.isArray(args.song_ids)||!args.song_ids.length)throw Error('请指定需要加入队列的歌曲。');payload.songs=[];for(const id of args.song_ids){signal.throwIfAborted();const s=await getSong(id);if(!s.available)throw Error('歌曲当前不可播放：'+s.name);payload.songs.push(s);}}return playerBridge.request(ctx.playerClientId,'queue',payload,signal);}
 case 'update_task_options':if(typeof args.make_playlist==='boolean')task.wantPlaylist=args.make_playlist;if(typeof args.require_listening==='boolean')task.requireListening=args.require_listening;return {makePlaylist:task.wantPlaylist,requireListening:task.requireListening};
 case 'remove_selection':task.selected=task.selected.filter(s=>s.id!==args.id);for(const p of Object.values(task.playlists))p.verified=false;emit('selection',{songs:task.selected});return {removed:args.id,reason:args.reason,remotePlaylistUnchanged:true};
 case 'like_song':result=await setSongLiked(args.id,args.liked);emit('song_liked',{song:result});return result;
 case 'collect_playlist':result=await setPlaylistSubscribed(args.id,args.subscribed);emit('playlist_collected',{playlist:result});return result;
 case 'set_plan':task.plan=args.steps;emit('plan',{steps:args.steps});return {saved:true};
 case 'search':{const r=await api.search(args.keyword,args.type,args.offset||0);result=args.type==='playlist'?records(r.data).map(playlist):remember(records(r.data).map(song));if(args.type!=='playlist')emit('songs',{songs:result});return result;}
 case 'daily':result=remember(records((await api.daily()).data).map(song));emit('songs',{songs:result});return result;
 case 'recommended_playlists':return records((await api.recommended()).data).map(playlist);
 case 'my_playlists':return records((await (args.kind==='collected'?api.collected:api.created)(args.offset||0)).data).map(playlist);
 case 'liked_songs':{const p=playlist((await api.liked()).data);return remember(records((await api.playlist(p.id,args.offset||0)).data).map(song));}
 case 'playlist':result=remember(records((await api.playlist(args.id,args.offset||0)).data).map(song));emit('songs',{songs:result});return result;
 case 'listen_song':{await getSong(args.id);getKey();const path=await audioFile(args.id,signal);signal.throwIfAborted();const url=await mediaUrl(path,MODEL);signal.throwIfAborted();ctx.media.push({type:'text',text:'歌曲 '+args.id+'《'+candidates[args.id].name+'》完整实际音频：'},{type:'input_audio',input_audio:{data:url,format:'mp3'}});ctx.attached.push(args.id);return {audioAttached:true,id:args.id};}
 case 'record_listening':{if(!task.heard.includes(args.id))throw Error('尚未在本任务中实际处理此歌音频。请先 listen_song 并在下一轮听过后再记录。');const s=await getSong(args.id);const note={...s,impression:args.impression,selected:args.selected,reason:args.reason,at:new Date().toISOString()};task.listening[args.id]=note;await updateMusicMemory(memory=>{memory.listening[args.id]=note;});if(args.selected){if(!s.available)throw Error('歌曲不可播放，无法入选');if(!selected(s.id))task.selected.push({...s,reason:args.reason,heard:true,impression:args.impression});}else task.selected=task.selected.filter(x=>x.id!==s.id);for(const p of Object.values(task.playlists))p.verified=false;emit('selection',{songs:task.selected});return {saved:true,note};}
 case 'select_song':{const s=await getSong(args.id);if(!s.available)throw Error('此歌曲开放接口不可播放，请换候选。');if(task.requireListening&&!task.listening[args.id])throw Error('本任务要求按实际音频筛选，先原生试听并 record_listening。');if(!selected(s.id))task.selected.push({...s,reason:args.reason,heard:task.heard.includes(s.id)});for(const p of Object.values(task.playlists))p.verified=false;emit('selection',{songs:task.selected});return {selected:true,song:s};}
 case 'create_playlist':{
 if(!args.key.trim()||!args.name.trim())throw Error('歌单名称和 key 不能为空');
 if(task.playlists[args.key])return task.playlists[args.key];
 // Persist an intent before sending the write; an interrupted result needs reconciliation, never blind retry.
 const prior=task.writes.find(w=>w.key==='create:'+args.key&&w.status!=='failed');if(prior?.status==='done'&&prior.id){const existing=Object.values(task.playlists).find(p=>p.id===prior.id);if(existing)return existing;}if(prior)throw Error('此建单操作结果尚未核对。请查看我的歌单找到刚才创建的歌单，不要重复创建。');
 let existing=[],page;do{signal.throwIfAborted();page=records((await api.created(existing.length)).data);existing.push(...page);}while(page.length===100);
 const op={key:'create:'+args.key,name:args.name,existingIds:existing.filter(p=>p.name===args.name).map(p=>p.id),status:'pending',at:new Date().toISOString()};task.writes.push(op);await save();
 let r;try{r=await api.createPlaylist(args.name);}catch(e){op.status='uncertain';await save();throw e;}
 if(!r.data?.id){op.status='uncertain';await save();throw Error('网易云未返回新歌单 ID，请核对，不能声称创建成功。');}
 const p={...r.data,name:args.name,verified:false,addedIds:[]};task.playlists[args.key]=p;op.status='done';op.id=p.id;await save();emit('playlist_created',{playlist:p});return p;
 }
 case 'use_existing_playlist':{
 let all=[],page;do{signal.throwIfAborted();page=records((await api.created(all.length)).data);all.push(...page);}while(page.length===100);
 const p=all.find(p=>p.id===args.id);if(!p)throw Error('这不是当前账号创建的歌单。');
 const goals=task.goal+'\n'+(task.instructions||[]).filter(i=>i.status==='applied').map(i=>i.text).join('\n');
 const named=goals.includes(p.name)||goals.includes(args.id)||task.allowedPlaylistIds?.includes(args.id);
 const refersBack=/刚才|刚建|上一|上次|这个歌单|这份歌单/.test(goals)&&(task.recentPlaylists||[]).some(x=>x.id===p.id);
 if(!named&&!refersBack)throw Error('用户没有指定这个歌单为修改目标。请创建新歌单，或在用户明确指定时再使用。');
 task.playlists['existing:'+p.id]={...p,existing:true,verified:false,addedIds:[]};await save();emit('playlist_created',{playlist:task.playlists['existing:'+p.id]});return task.playlists['existing:'+p.id];
 }
 case 'add_to_playlist':{
 if(!owned(args.id)&&!task.goal.includes(args.id)&&!task.allowedPlaylistIds?.includes(args.id))throw Error('只能写入本任务新建的歌单或用户明确指定的目标。请先创建任务歌单。');
 const ids=[...new Set(args.song_ids)];if(!ids.length)throw Error('没有待添加歌曲');for(const id of ids)if(!selected(id))throw Error('先将歌曲 select_song 或 record_listening 入选，再添加。');
 const before=await allTracks(args.id,signal),existing=new Set(before.map(s=>s.id)),missing=ids.filter(id=>!existing.has(id));
 if(missing.length){const op={key:'add:'+args.id,ids:missing,status:'pending',at:new Date().toISOString()};task.writes.push(op);await save();try{for(let i=0;i<missing.length;i+=500){signal.throwIfAborted();await api.addToPlaylist(args.id,missing.slice(i,i+500));}op.status='done';}catch(e){op.status='uncertain';await save();throw e;}}
 const actual=await allTracks(args.id,signal),actualIds=new Set(actual.map(s=>s.id));const absent=ids.filter(id=>!actualIds.has(id));for(const p of Object.values(task.playlists))if(p.id===args.id){p.addedIds=actual.map(s=>s.id);if(ctx.continuous)p.expectedIds=[...new Set([...(p.expectedIds||[]),...ids])];p.verified=false;}
 await save();emit('playlist_updated',{id:args.id,count:actual.length});if(absent.length)throw Error('部分歌曲尚未在歌单中核对到：'+absent.join(','));return {added:missing.length,alreadyPresent:ids.length-missing.length,total:actual.length,verifiedIds:ids};
 }
 case 'update_playlist_description':if(!owned(args.id))throw Error('此工具仅修改本任务创建的歌单简介。');return (await api.updatePlaylistDescription(args.id,args.description)).data;
 case 'verify_playlist':{const list=await allTracks(args.id,signal);const actual=new Set(list.map(s=>s.id));const target=Object.values(task.playlists).find(p=>p.id===args.id);const expected=ctx.continuous?(target?.expectedIds||[]):task.selected.map(s=>s.id);const missing=expected.filter(id=>!actual.has(id));for(const p of Object.values(task.playlists))if(p.id===args.id){p.verified=!missing.length&&list.length>0;p.addedIds=[...actual];}const result={id:args.id,verified:!missing.length&&list.length>0,count:list.length,missing,songs:list};emit('playlist_verified',result);return result;}
 case 'play_song':result=await getSong(args.id);if(!result.available)throw Error('当前开放接口不可播放');return playerBridge.request(ctx.playerClientId,'play_song',{song:result},signal);
 case 'play_playlist':{const list=(await allTracks(args.id,signal)).filter(s=>s.available);if(!list.length)throw Error('歌单没有可播放歌曲');return playerBridge.request(ctx.playerClientId,'queue',{action:'replace',songs:list,autoplay:true},signal);}
 case 'save_preference':{await updateMusicMemory(memory=>{if(!memory.preferences.includes(args.note))memory.preferences.push(args.note);});return {saved:true};}
 case 'finish_task':{
 if(args.outcome==='completed'&&Object.values(task.playlists).some(p=>!p.verified))throw Error('歌单还没有通过最终核对，先 verify_playlist。');
 if(args.outcome==='completed'&&task.wantPlaylist&&!Object.values(task.playlists).some(p=>p.verified))throw Error('用户要求建立歌单，任务中尚无已创建并核对的歌单；继续执行，确实受阻则 outcome=blocked。');
 task.summary=args.summary;task.outcome=args.outcome;return {finished:true,outcome:args.outcome,summary:args.summary};
 }
 default:throw Error('未知工具：'+name);
 }
}
