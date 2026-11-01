import {spawnSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createSign} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {neteaseCredentials} from './settings.mjs';
export const ROOT=fileURLToPath(new URL('./',import.meta.url));
export function readProtected(name){const result=spawnSync('pwsh',['-NoProfile','-File',join(ROOT,'protect.ps1'),'-Action','read','-Name',name],{encoding:'utf8',windowsHide:true});if(result.status!==0||!result.stdout.trim())throw new Error('本地凭证尚未配置。');return JSON.parse(result.stdout);}
let credentials,session,device;
async function auth(){
 credentials??=neteaseCredentials();
 if(!session){const decoded=readProtected('session');session=decoded.filter(x=>x.namedToken).at(-1);if(!session)throw new Error('请先登录网易云账号。');}
 if(!device){const saved=JSON.parse(await readFile(join(ROOT,'state/ncm-profile/.netease_mcp_device.json'),'utf8'));device={deviceType:'openapi',os:'ncmcli',appVer:'0.1.7',channel:'ncmcli',model:'Windows_x64_cli',brand:'ncmcli',osVer:'10.0.26200',clientIp:'127.0.0.1',deviceId:saved.deviceId||saved.id||'qwen-music-local'};}
 return {credentials,session,device};
}
export async function ncm(endpoint,bizContent={},method='GET'){
 const a=await auth();
 const params={accessToken:a.session.namedToken,appId:a.credentials.appId,bizContent:JSON.stringify(bizContent),device:JSON.stringify(a.device),signType:'RSA_SHA256',timestamp:String(Date.now())};
 const canonical=Object.keys(params).sort().map(key=>key+'='+params[key]).join('&');
 params.sign=createSign('RSA-SHA256').update(canonical).sign(a.credentials.privateKey,'base64');
 const form=new URLSearchParams(params);const url='https://openncm.music.163.com'+endpoint;
 const response=await fetch(method==='GET'?url+'?'+form:url,{method,headers:method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:undefined,body:method==='POST'?form:undefined});
 if(!response.ok)throw new Error('网易云接口 HTTP '+response.status);
 const result=await response.json();
 if(result.code!==200)throw new Error(`网易云：${result.message||'接口请求失败'}（${result.code}）`);
 return result;
}
export function records(data){if(Array.isArray(data))return data;return data?.records||data?.songs||data?.songList||data?.list||[];}
const execFileAsync=promisify(execFile);
// Use the official CLI for account writes; argv is passed directly without a shell.
export async function cliWrite(command,args,group='playlist'){
 const {stdout}=await execFileAsync(process.execPath,['--use-env-proxy','--require',join(ROOT,'ncm-isolate.cjs'),join(ROOT,'node_modules/@music163/ncm-cli/dist/index.js'),group,command,...Object.entries(args).flatMap(([k,v])=>['--'+k,typeof v==='string'?v:JSON.stringify(v)]),'--output','json'],{cwd:ROOT,windowsHide:true,maxBuffer:16*1024*1024});
 let result;try{result=JSON.parse(stdout);}catch{throw Error('网易云写入未返回可识别的结果；请先核对歌单，避免重复创建。');}
 if(result.code!==200)throw Error('网易云：'+(result.message||result.msg||'写入失败')+'（'+result.code+'）');return result;
}
export const api={
 artistSongs:(artistId,offset=0)=>ncm('/openapi/music/basic/song/artist/bypubtime/get/v2',{artistId,limit:30,offset,startTime:1,endTime:Date.now(),qualityFlag:true}),
 albumDetail:albumId=>ncm('/openapi/music/basic/album/detail/get/v2',{albumId,descFlag:true},'POST'),
 albumTracks:albumId=>ncm('/openapi/music/basic/album/song/list/get/v2',{albumId,qualityFlag:true},'POST'),
 playHistory:(limit=100)=>ncm('/openapi/music/basic/song/play/record/list',{limit,qualityFlag:true}),
 profile:()=>ncm('/openapi/music/basic/user/profile/get/v2'),
 search:(keyword,type='song',offset=0)=>ncm(type==='playlist'?'/openapi/music/basic/search/playlist/get/v2':'/openapi/music/basic/search/song/get/v3',{keyword,limit:30,offset,qualityFlag:true}),
 created:(offset=0)=>ncm('/openapi/music/basic/playlist/created/get/v2',{limit:100,offset}),
 collected:(offset=0)=>ncm('/openapi/music/basic/playlist/subed/get/v2',{limit:100,offset}),
 liked:()=>ncm('/openapi/music/basic/playlist/star/get/v2'),
 playlist:(playlistId,offset=0)=>ncm('/openapi/music/basic/playlist/song/list/get/v3',{playlistId,limit:100,offset,qualityFlag:true}),
 playlistDetail:playlistId=>ncm('/openapi/music/basic/playlist/detail/get/v2',{playlistId}),
 daily:()=>ncm('/openapi/music/basic/recommend/songlist/get/v2',{limit:30,qualityFlag:true}),
 recommended:()=>ncm('/openapi/music/basic/recommend/playlist/get',{limit:20,offset:0}),
 song:songId=>ncm('/openapi/music/basic/song/detail/get/v2',{songId,withUrl:true,bitrate:320}),
 playurl:async songId=>{const result=await ncm('/openapi/music/basic/song/detail/get/v2',{songId,withUrl:true,bitrate:320});return {...result,data:{...result.data,url:result.data.playUrl,size:result.data.songSize,expires:result.data.playUrlExpireTime}};},
 lyric:songId=>ncm('/openapi/music/basic/song/lyric/get/v2',{songId}),
 like:(songId,isLike)=>cliWrite(isLike?'like':'dislike',{songId},'song'),
 subscribePlaylist:(id,subscribed)=>ncm('/openapi/music/basic/playlist/'+(subscribed?'sub':'unsub')+'/v2',{id},'POST'),
 createPlaylist:name=>cliWrite('create',{playlistName:name}),
 addToPlaylist:(id,ids)=>cliWrite('add',{playlistId:id,songIdList:ids}),
 removeFromPlaylist:(id,ids)=>cliWrite('remove',{playlistId:id,songIdList:ids}),
 comments:(resourceId,type='song',offset=0,cursor='')=>ncm('/openapi/music/basic/comments/get/v2',{resourceId,type,limit:20,offset,...(cursor?{cursor}:{})}),
 updatePlaylistDescription:(id,desc)=>cliWrite('updateDesc',{playlistId:id,desc}),
};
