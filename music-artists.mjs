import {api,records} from './netease.mjs';
import {song,artistRefs} from './music-shapes.mjs';
function requireId(id){if(typeof id!=='string'||!id.trim())throw Error('缺少音乐人或专辑标识');return id;}
export async function artistWorks(id,offset=0){
 requireId(id);if(!Number.isSafeInteger(offset)||offset<0)throw Error('作品分页参数无效');
 const result=await api.artistSongs(id,offset),raw=records(result.data),albums=new Map();
 for(const s of raw){const a=s.album||s.al;if(a?.id&&!albums.has(String(a.id)))albums.set(String(a.id),{id:String(a.id),originalId:a.originalId??null,name:a.name||'专辑',cover:a.picUrl||a.coverImgUrl||s.coverImgUrl||s.picUrl||null});}
 return {songs:raw.map(song),albums:[...albums.values()],nextOffset:offset+raw.length,more:typeof result.data?.page?.more==='boolean'?result.data.page.more:raw.length>=30};
}
export async function albumWorks(id){
 requireId(id);const [details,tracks]=await Promise.allSettled([api.albumDetail(id),api.albumTracks(id)]);
 if(tracks.status==='rejected')throw tracks.reason;
 const d=details.status==='fulfilled'?details.value.data||{}:{};
 return {album:{id,originalId:d.originalId??null,name:d.name||'专辑曲目',cover:d.coverImgUrl||d.picUrl||null,description:d.description||d.briefDesc||'',artistList:artistRefs(d),publishTime:d.publishTime??null},songs:records(tracks.value.data).map(song),warning:details.status==='rejected'?'专辑介绍暂不可用：'+details.reason.message:null};
}
