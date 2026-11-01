import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {api,records,ROOT} from './netease.mjs';
import {song,playlist} from './music-shapes.mjs';
export async function createdPlaylists(){let list=[],page;do{page=records((await api.created(list.length)).data);list.push(...page);}while(page.length===100);return list.map(playlist);}
async function playlistTracks(id){let list=[],page;do{page=records((await api.playlist(id,list.length)).data);list.push(...page);}while(page.length===100);return list;}
export async function setSongLiked(id,liked){if(typeof liked!=='boolean')throw Error('需要指定红心状态');const before=(await api.song(id)).data;if(before.liked!==liked)await api.like(id,liked);const after=song((await api.song(id)).data);if(after.liked!==liked)throw Error('已提交操作，但网易云尚未确认红心状态，请稍后刷新核对。');return after;}
export async function setPlaylistSubscribed(id,subscribed){if(typeof subscribed!=='boolean')throw Error('需要指定收藏状态');const before=(await api.playlistDetail(id)).data;if(before.subed!==subscribed)await api.subscribePlaylist(id,subscribed);const after=playlist((await api.playlistDetail(id)).data);if(after.subed!==subscribed)throw Error('已提交操作，但网易云尚未确认收藏状态，请稍后刷新核对。');return after;}
export async function removeSongFromPlaylist({playlistId,songId}){
 if(!playlistId||!songId)throw Error('请指定歌单和歌曲');
 const liked=playlist((await api.liked()).data);
 if(liked.id===playlistId){const s=await setSongLiked(songId,false);return {playlistId,songId,verified:true,liked:false,song:s};}
 const owned=await createdPlaylists();if(!owned.some(p=>p.id===playlistId))throw Error('只能从你创建的歌单中移除歌曲。');
 const before=await playlistTracks(playlistId);const present=before.some(s=>s.id===songId);if(present)await api.removeFromPlaylist(playlistId,[songId]);
 const after=await playlistTracks(playlistId);if(after.some(s=>s.id===songId))throw Error('歌曲尚未确认移出歌单，请稍后刷新核对。');
 return {playlistId,songId,verified:true,alreadyAbsent:!present,trackCount:after.length};
}
const inFlight=new Map();
export async function addSongToPlaylist(body){
 if(!/^[a-f0-9-]{36}$/i.test(body.requestId||''))throw Error('操作编号无效，请重试。');
 if(inFlight.has(body.requestId))return inFlight.get(body.requestId);
 const work=(async()=>{
 const directory=join(process.env.MUSIC_STATE_DIR||join(ROOT,'state'),'actions');await mkdir(directory,{recursive:true});const path=join(directory,body.requestId+'.json');let action;
 try{action=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;action={songId:String(body.songId||''),playlistId:body.playlistId,name:String(body.name||'').trim(),status:'new'};}
 if(action.songId!==String(body.songId||'')||(action.name||'')!==String(body.name||'').trim()||(body.playlistId&&action.playlistId!==body.playlistId))throw Error('操作编号已被其他操作使用，请重新选择。');
 const save=async()=>{await writeFile(path+'.tmp',JSON.stringify(action));await rename(path+'.tmp',path);};
 if(action.result)return action.result;
 if(!action.songId)throw Error('请先选一首歌');await api.song(action.songId);const owned=await createdPlaylists();
 if(!action.playlistId){
 if(!action.name)throw Error('请选择目标歌单或填写新歌单名称');
 if(action.status==='creating'){
 const matches=owned.filter(p=>p.name===action.name&&!action.existingIds.includes(p.id));if(matches.length!==1)throw Error('上次建单结果待核对，暂未重复创建，请在我的歌单中检查“'+action.name+'”。');action.playlistId=matches[0].id;
 }else{action.existingIds=owned.filter(p=>p.name===action.name).map(p=>p.id);action.status='creating';await save();const created=(await api.createPlaylist(action.name)).data;if(!created?.id)throw Error('歌单创建结果待核对');action.playlistId=created.id;}
 action.status='created';await save();
 }else if(!owned.some(p=>p.id===action.playlistId))throw Error('只能添加到你创建的歌单。');
 const before=await playlistTracks(action.playlistId);const exists=before.some(s=>s.id===action.songId);if(!exists)await api.addToPlaylist(action.playlistId,[action.songId]);
 const after=await playlistTracks(action.playlistId);if(!after.some(s=>s.id===action.songId))throw Error('歌曲尚未在歌单中读回确认，请保留当前窗口重试。');
 const detail=playlist((await api.playlistDetail(action.playlistId)).data);action.status='done';action.result={playlist:detail,songId:action.songId,alreadyPresent:exists,verified:true};await save();return action.result;
 })();inFlight.set(body.requestId,work);try{return await work;}finally{inFlight.delete(body.requestId);}
}
