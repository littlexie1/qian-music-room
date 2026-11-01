import http from 'node:http';
import {playerBridge} from './player-bridge.mjs';
import {registerExternalTrack,externalTrack} from './external-tracks.mjs';
import {listeningDJ} from './player-dj.mjs';
import {timerService} from './time-tools.mjs';
import {playerHistory} from './listening-history.mjs';
import {readListeningHistory} from './history-tools.mjs';
import {readMemory} from './music-tools.mjs';
import {saveUserMedia,serveUserMedia} from './user-media.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {join,extname} from 'node:path';
import {api,records,ROOT} from './netease.mjs';
const PORT=Number(process.env.MUSIC_PORT||58238);
const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
import {song,playlist} from './music-shapes.mjs';
import {initChat,listConversations,createConversation,getConversation,conversationInfo,sendMessage,subscribeConversation,stopConversation,continueConversation} from './chat-agent.mjs';
import {createdPlaylists,setSongLiked,setPlaylistSubscribed,addSongToPlaylist,removeSongFromPlaylist} from './music-actions.mjs';
import {loadComments} from './music-comments.mjs';
const songs=r=>records(r.data).map(song);
await Promise.all(['private','cache','state'].map(name=>mkdir(join(ROOT,name),{recursive:true})));
await initChat();
listeningDJ.send=sendMessage;
timerService.send=sendMessage;
await playerHistory.init(join(process.env.MUSIC_STATE_DIR||join(ROOT,'state'),'play-history.json'));
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1:'+server.address().port), p=u.pathname;
 if(req.headers.origin&&req.headers.origin!==u.origin)return json(res,{error:'请求来源不匹配'},403);
 if(p.startsWith('/api/')){
 if(p==='/api/player/events'&&req.method==='GET'){
  const id=u.searchParams.get('clientId');if(!id)return json(res,{error:'缺少播放器窗口编号'},400);
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','Connection':'keep-alive'});
  const unsubscribe=playerBridge.subscribe(id,event=>res.write('data: '+JSON.stringify(event)+'\n\n'));
  const timer=setInterval(()=>res.write(': heartbeat\n\n'),15000);res.on('close',()=>{clearInterval(timer);unsubscribe();});return;
 }
 if(p==='/api/player/windows'&&req.method==='GET')return json(res,{windows:[...playerBridge.clients.values()].map(c=>({clientId:c.id,state:c.state}))});
 if(['/api/player/command','/api/player/external-play'].includes(p)&&req.method==='POST'){
  let text='';for await(const part of req)text+=part;const body=JSON.parse(text);
  if(p==='/api/player/external-play'){const song=registerExternalTrack(body.song);return json(res,await playerBridge.request(body.clientId,'play_song',{song}));}
  return json(res,await playerBridge.request(body.clientId,body.action,body.args||{}));
 }
 if(p==='/api/player/state'&&req.method==='GET')return json(res,playerBridge.state(u.searchParams.get('clientId')));
 if(['/api/player/state','/api/player/ack'].includes(p)&&req.method==='POST'){
  let text='';for await(const part of req)text+=part;const body=JSON.parse(text);
  if(p==='/api/player/state'){playerBridge.update(body.clientId,body.state);return json(res,{saved:true});}
  return json(res,playerBridge.acknowledge(body.clientId,body.commandId,body.result));
 }
 if(p==='/api/media'&&req.method==='POST')return json(res,await saveUserMedia(req,{name:u.searchParams.get('name')||'附件',mime:req.headers['content-type']||'',voice:u.searchParams.get('voice')==='1'}),201);
 if(p.startsWith('/api/media/')&&req.method==='GET')return serveUserMedia(req,res,p.split('/').pop());
 if(p==='/api/listening-history')return json(res,await readListeningHistory({source:u.searchParams.get('source')||'both',limit:Number(u.searchParams.get('limit')||100),offset:Number(u.searchParams.get('offset')||0)}));
 if(p==='/api/listening-notes')return json(res,Object.values((await readMemory()).listening||{}).sort((a,b)=>(b.at||'').localeCompare(a.at||'')));
 if(p==='/api/timers'){
  const id=u.searchParams.get('conversationId');if(!getConversation(id))return json(res,{error:'对话不存在'},404);
  const clientId=u.searchParams.get('clientId'),result={background:timerService.list(id),player:[]};
  if(clientId&&playerBridge.clients.has(clientId)){const r=await playerBridge.request(clientId,'list_schedules',{conversationId:id});result.player=r.state.schedules||[];}
  return json(res,result);
 }
 if(p==='/api/profile')return json(res,(await api.profile()).data);
 if(p==='/api/daily')return json(res,songs(await api.daily()));
 if(p==='/api/search'){const type=u.searchParams.get('type')||'song';const r=await api.search(u.searchParams.get('q')||'',type,Number(u.searchParams.get('offset')||0));return json(res,type==='playlist'?records(r.data).map(playlist):songs(r));}
 if(p==='/api/playlists')return json(res,records((await (u.searchParams.get('kind')==='collected'?api.collected:api.created)(Number(u.searchParams.get('offset')||0))).data).map(playlist));
 if(p==='/api/liked')return json(res,playlist((await api.liked()).data));
 if(p==='/api/playlist-picker')return json(res,await createdPlaylists());
 if(p==='/api/comments')return json(res,await loadComments(u.searchParams.get('id'),u.searchParams.get('type')||'song',Number(u.searchParams.get('offset')||0),u.searchParams.get('cursor')||''));
 if(p==='/api/playlist-remove'&&req.method==='POST'){let text='';for await(const part of req)text+=part;return json(res,await removeSongFromPlaylist(JSON.parse(text)));}
 if(p.startsWith('/api/song/external_'))return json(res,externalTrack(p.split('/').pop()));
 if(p.startsWith('/api/song/'))return json(res,song((await api.song(p.split('/').pop())).data));
 if(p.startsWith('/api/playlist-detail/'))return json(res,playlist((await api.playlistDetail(p.split('/').pop())).data));
 if(['/api/like','/api/subscribe-playlist','/api/playlist-add'].includes(p)&&req.method==='POST'){let text='';for await(const part of req)text+=part;const body=JSON.parse(text);return json(res,p==='/api/like'?await setSongLiked(body.id,body.liked):p==='/api/subscribe-playlist'?await setPlaylistSubscribed(body.id,body.subscribed):await addSongToPlaylist(body));}
 if(p.startsWith('/api/playlist/'))return json(res,songs(await api.playlist(decodeURIComponent(p.split('/').pop()),Number(u.searchParams.get('offset')||0))));
 if(p.startsWith('/api/audio/')){const id=p.split('/').pop(),r=id.startsWith('external_')?{data:{url:externalTrack(id).url}}:await api.playurl(id);if(!r.data.url)throw Error('此歌曲暂无可播放音源');const remote=await fetch(r.data.url,{headers:req.headers.range?{Range:req.headers.range}:{}});res.writeHead(remote.status,Object.fromEntries(['content-type','content-length','content-range','accept-ranges'].flatMap(h=>remote.headers.has(h)?[[h,remote.headers.get(h)]]:[])));await pipeline(Readable.fromWeb(remote.body),res);return;}
 if(p==='/api/tasks'&&req.method==='GET')return json(res,listConversations().filter(c=>['running','stopping'].includes(c.status)).map(c=>({id:c.id,conversationId:c.id,status:c.status,goal:getConversation(c.id).workspace.goal})));
 if(p==='/api/conversations'&&req.method==='GET')return json(res,listConversations());
 if(p==='/api/conversations'&&req.method==='POST')return json(res,await createConversation(),201);
 if(p.startsWith('/api/conversations/')){
  const [,,,id,action]=p.split('/');const c=getConversation(id);if(!c)return json(res,{error:'对话不存在'},404);
  if(action==='events'){
   res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');
   const unsubscribe=subscribeConversation(id,e=>res.write('data: '+JSON.stringify(e)+'\n\n'));const timer=setInterval(()=>res.write(': heartbeat\n\n'),15000);res.on('close',()=>{clearInterval(timer);unsubscribe?.();});return;
  }
  if(action==='messages'&&req.method==='POST'){let body='';for await(const part of req)body+=part;return json(res,await sendMessage(id,JSON.parse(body)),202);}
  if(action==='stop'&&req.method==='POST')return json(res,await stopConversation(id));
  if(action==='continue'&&req.method==='POST')return json(res,await continueConversation(id));
  return json(res,{...conversationInfo(c),entries:c.timeline,messages:c.timeline.filter(e=>['user','assistant'].includes(e.kind)).map(e=>({role:e.kind,content:e.content}))});
 }
 if(p.startsWith('/api/tasks/')){
  const [,,,id,action]=p.split('/');const c=listConversations().map(x=>getConversation(x.id)).find(c=>c.id===id||c.legacyTaskIds?.includes(id));
  if(!c)return json(res,{error:'旧记录不存在'},404);
  if(action==='stop'&&req.method==='POST')return json(res,await stopConversation(c.id));
  if(action==='resume'&&req.method==='POST')return json(res,await continueConversation(c.id));
  return json(res,{...conversationInfo(c),conversationId:c.id});
 }
 return json(res,{error:'接口不存在'},404);
 }
 const name=p==='/'?(process.env.MUSIC_INDEX_HTML||'index-conversation.html'):decodeURIComponent(p.slice(1));if(name.includes('..')||name.includes('\\'))return json(res,{error:'无效路径'},400);const path=join(ROOT,'public',name);const data=await readFile(path);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'})[extname(path)]||'application/octet-stream'});res.end(data);
 }catch(e){if(!res.headersSent)json(res,{error:e.message},500);else res.end();}});
server.listen(PORT,'127.0.0.1',async()=>{const stateRoot=process.env.MUSIC_STATE_DIR||join(ROOT,'state');await mkdir(stateRoot,{recursive:true});await writeFile(join(stateRoot,'server.json'),JSON.stringify({pid:process.pid,url:'http://127.0.0.1:'+server.address().port}));console.log('Music room http://127.0.0.1:'+server.address().port);});

// Stream local media without an application-imposed upload-duration limit.
server.requestTimeout=0;
