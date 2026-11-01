(()=>{
 const panel=$('#artist-panel'),list=$('#artist-items'),status=$('#artist-status'),more=$('#artist-more');
 let generation=0,controller=null,artist=null,songs=[],albums=[],offset=0,hasMore=false,tab='songs',album=null,busy=false;
 const canonical=id=>/^\d+$/.test(String(id||''))?String(id):null;
 function officialLink(element,type,id){const numeric=canonical(id);element.hidden=!numeric;if(numeric)element.href='https://music.163.com/#/'+type+'?id='+numeric;else element.removeAttribute('href');}
 function info(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
 function begin(){generation++;controller?.abort();controller=new AbortController();busy=false;more.disabled=false;more.hidden=true;list.replaceChildren();$('#artist-retry').hidden=true;if(!panel.open)panel.showModal();return generation;}
 function image(src,label){const el=document.createElement(src?'img':'span');if(src){el.src=src;el.alt=label;el.loading='lazy';el.addEventListener('error',()=>{el.hidden=true;},{once:true});}else{el.className='artist-cover-fallback';el.textContent='♫';}return el;}
 function head(a){$('#artist-title').textContent=a?.name||'音乐人';$('#artist-avatar').replaceChildren(image(a?.cover,a?.name||'音乐人'));officialLink($('#artist-original'),'artist',a?.originalId);}
 function renderTrack(s,i){
  const row=document.createElement('div');row.className='artist-track'+(!s.available?' unavailable':'');
  const number=document.createElement('span');number.className='artist-track-number';number.textContent=String(i+1).padStart(2,'0');row.append(number,image(s.cover,s.name));
  const labels=document.createElement('div');labels.className='artist-track-label';const title=document.createElement('b');title.textContent=s.name;const authors=document.createElement('small');authors.textContent=s.artists||'';labels.append(title,authors);row.append(labels);
  const length=document.createElement('small');length.textContent=s.available?time(s.duration):'暂无音源';row.append(length);
  for(const [text,label,action] of [['▶','播放'+s.name,'play'],['＋','加入当前播放列表','queue']]){const button=document.createElement('button');button.textContent=text;button.title=label;button.setAttribute('aria-label',label);button.disabled=!s.available;button.onclick=async()=>{button.disabled=true;try{if(action==='play'){await applyPlayerCommand({action:'play_song',args:{song:s}});window.publishMusicPlayerState?.(true);info('正在播放：'+s.name);}else{appendQueue(s);info('已加入当前播放列表：'+s.name);}}catch(e){info(e.message,true);}finally{button.disabled=!s.available;}};row.append(button);}
  return row;
 }
 function render(){
  list.replaceChildren();$('#artist-back').hidden=!album;$('#artist-tabs').hidden=!!album;
  $('#artist-subtitle').textContent=album?album.name:tab==='songs'?'歌曲作品':'相关专辑 · 来自已加载的作品';
  $('#artist-description').textContent=album?.description||'';$('#artist-description').hidden=!album?.description;
  $('#artist-tab-songs').classList.toggle('active',tab==='songs');$('#artist-tab-albums').classList.toggle('active',tab==='albums');
  more.hidden=!!album||!hasMore;more.disabled=busy;
  if(album||tab==='songs'){
   const rows=album?.songs||songs;rows.forEach((s,i)=>list.append(renderTrack(s,i)));
   if(!rows.length){const empty=document.createElement('p');empty.className='artist-empty';empty.textContent=album?'此专辑暂无可展示曲目':'暂无可展示作品';list.append(empty);}
  }else{
   const cards=document.createElement('div');cards.className='artist-albums';
   for(const a of albums){const card=document.createElement('button');card.className='artist-album';card.append(image(a.cover,a.name));const name=document.createElement('b');name.textContent=a.name;card.append(name);card.onclick=()=>openAlbum(a);cards.append(card);}list.append(cards);
   if(!albums.length){const empty=document.createElement('p');empty.className='artist-empty';empty.textContent='已加载作品没有提供专辑信息';list.append(empty);}
  }
 }
 async function loadMore(){
  if(!artist?.id||busy)return;const current=generation;busy=true;more.disabled=true;info('正在加载作品…');
  try{const d=await get('/api/artist/'+encodeURIComponent(artist.id)+'/songs?offset='+offset,{signal:controller.signal});if(current!==generation)return;
   const seen=new Set(songs.map(s=>String(s.id))),known=new Set(albums.map(a=>String(a.id)));songs.push(...d.songs.filter(s=>!seen.has(String(s.id))));albums.push(...d.albums.filter(a=>!known.has(String(a.id))));offset=d.nextOffset;hasMore=d.more;
   info('已加载 '+songs.length+' 首作品'+(hasMore?' · 可继续加载':''));$('#artist-retry').hidden=true;render();
  }catch(e){if(current===generation&&e.name!=='AbortError'){info('作品加载失败：'+e.message,true);$('#artist-retry').hidden=false;}}
  finally{if(current===generation){busy=false;more.disabled=false;}}
 }
 function openArtist(a){begin();artist=a;album=null;songs=[];albums=[];offset=0;hasMore=false;tab='songs';head(a);$('#artist-retry').onclick=loadMore;render();loadMore();}
 async function openAlbum(a){const current=begin();$('#artist-tabs').hidden=true;$('#artist-back').hidden=false;$('#artist-subtitle').textContent=a.name;info('正在加载专辑…');try{const d=await get('/api/album/'+encodeURIComponent(a.id),{signal:controller.signal});if(current!==generation)return;album={...d.album,name:d.album.name==='专辑曲目'?a.name:d.album.name,songs:d.songs};info(d.warning||d.songs.length+' 首曲目',!!d.warning);render();}catch(e){if(current===generation&&e.name!=='AbortError'){info('专辑加载失败：'+e.message,true);$('#artist-retry').hidden=false;$('#artist-retry').onclick=()=>openAlbum(a);}}}
 async function fromSong(s){
  const current=begin();head({name:'选择音乐人'});$('#artist-tabs').hidden=true;$('#artist-back').hidden=true;$('#artist-subtitle').textContent=s.name||'';$('#artist-description').hidden=true;info('正在读取音乐人信息…');
  try{const d=s.artistList?.some(a=>a.id)?s:await get('/api/song/'+encodeURIComponent(s.id),{signal:controller.signal});if(current!==generation)return;
   const refs=d.artistList?.filter(a=>a.id)||[];if(!refs.length){info('此歌曲暂未提供可访问的音乐人信息');return;}if(refs.length===1){openArtist(refs[0]);return;}
   info('选择要查看的音乐人');for(const a of refs){const button=document.createElement('button');button.className='artist-choice';button.append(image(a.cover,a.name),document.createTextNode(a.name));button.onclick=()=>openArtist(a);list.append(button);}
  }catch(e){if(current===generation&&e.name!=='AbortError')info('音乐人信息加载失败：'+e.message,true);}
 }
 function names(container,s){
  if(!container||!s)return;container.replaceChildren();const refs=s.artistList?.filter(a=>a.name)||[];
  if(!refs.length){if(!s.artists)return;const button=document.createElement('button');button.className='artist-link';button.textContent=s.artists;button.title='查看音乐人作品';button.onclick=e=>{e.stopPropagation();fromSong(s);};container.append(button);return;}
  refs.forEach((a,i)=>{if(i)container.append(document.createTextNode(' / '));const button=document.createElement('button');button.className='artist-link';button.textContent=a.name;button.title='查看'+a.name+'的作品';button.onclick=e=>{e.stopPropagation();a.id?openArtist(a):fromSong(s);};container.append(button);});
 }
 window.refreshArtistLinks=()=>{document.querySelectorAll('#library .track').forEach(row=>names(row.querySelector('small'),current[Number(row.dataset.i)]));};
 const playing=s=>{names($('#now-artist'),s);names($('#lyrics-artist'),s);};
 window.addEventListener('music-track-change',e=>playing(e.detail));window.refreshArtistLinks();playing(queue[index]);
 $('#close-artist').onclick=()=>panel.close();panel.addEventListener('close',()=>{generation++;controller?.abort();busy=false;});
 $('#artist-tab-songs').onclick=()=>{tab='songs';render();};$('#artist-tab-albums').onclick=()=>{tab='albums';render();};
 $('#artist-back').onclick=()=>{generation++;controller?.abort();controller=new AbortController();album=null;$('#artist-retry').hidden=true;$('#artist-retry').onclick=loadMore;info('已加载 '+songs.length+' 首作品');render();};
 more.onclick=loadMore;$('#artist-retry').onclick=()=>{if(artist&&!album)loadMore();};
})();
