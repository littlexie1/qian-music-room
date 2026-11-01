import {api,records} from './netease.mjs';
import {song} from './music-shapes.mjs';
import {playerHistory} from './listening-history.mjs';
export async function readListeningHistory({source='both',limit=100,offset=0}={}){
 if(!['netease','local','both'].includes(source)||!Number.isInteger(limit)||limit<1||!Number.isInteger(offset)||offset<0)throw Error('听歌记录查询参数无效。');
 const result={};
 if(source!=='local'){try{const response=await api.playHistory(limit);result.netease={source:'netease_recent',records:records(response.data).map(record=>({...song(record),artists:record.artistName||song(record).artists,played_at:record.playTime||record.playedAt||record.played_at||null})),note:'网易云接口提供的最近播放记录；不代表完整历史或完整听过，平台可能未提供播放时间。本音乐室尚未把本地播放回传网易云。'};}catch(e){if(source==='netease')throw e;result.netease={available:false,error:e.message};}}
 if(source!=='netease')result.local=playerHistory.list(offset,limit);
 return result;
}
