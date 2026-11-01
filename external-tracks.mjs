import {createHash} from 'node:crypto';
const tracks=new Map();
export function registerExternalTrack(input){const url=new URL(input.url);if(!['http:','https:'].includes(url.protocol)||!input.name||!input.source||!input.id)throw Error('外部歌曲信息无效。');const id='external_'+createHash('sha256').update(input.source+':'+input.id).digest('hex');const song={id,name:input.name,artists:input.artists||'',duration:input.duration,cover:input.cover,available:true,source:input.source,sourceId:input.id,url:url.href};tracks.set(id,song);return song;}
export function externalTrack(id){const s=tracks.get(id);if(!s)throw Error('该跨平台音源已失效，请让千小姐重新解析歌曲。');return s;}
