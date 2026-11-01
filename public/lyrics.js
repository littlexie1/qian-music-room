// Lyrics and artwork follow actual media events, independently of the chat.
(()=>{
 const panel=$('#lyrics-panel'),viewport=$('#lyrics-lines'),trigger=$('#now-cover-button'),large=$('#lyrics-cover');
 let song=null,controller=null,request=0,lines=[],active=-2,manual=false,spinning=false;
 const cache=new Map();
 const follow=()=>{manual=false;$('#lyrics-follow').hidden=true;sync(true);};
 function motion(playing){spinning=playing;$('#now-cover').classList.toggle('is-spinning',playing);large.classList.toggle('is-spinning',playing);}
 function update(s){
  const changed=String(song?.id)!==String(s?.id);song=s||null;trigger.disabled=!song;trigger.title=song?'展开滚动歌词':'选一首歌曲后查看歌词';
  $('#lyrics-title').textContent=song?.name||'还没有播放';$('#lyrics-artist').textContent=song?.artists||'';
  const src=song?.cover||'/qwen.png';if(large.getAttribute('src')!==src)large.src=src;
  trigger.classList.toggle('no-cover',!song?.cover);
  if(changed){request++;controller?.abort();lines=[];active=-2;manual=false;$('#lyrics-follow').hidden=true;viewport.replaceChildren();motion(false);if(!song){if(panel.open)panel.close();}else if(panel.open)load();}
 }
 function status(text,error=false){$('#lyrics-status').textContent=text;$('#lyrics-retry').hidden=!error;}
 async function load(){
  if(!song)return;const id=String(song.id),current=++request;controller?.abort();controller=new AbortController();lines=[];active=-2;manual=false;viewport.replaceChildren();status('正在加载歌词…');
  try{
   let result=cache.get(id);
   if(!result){result=await get('/api/lyrics/'+encodeURIComponent(id),{signal:controller.signal});cache.set(id,result);}
   if(current!==request||String(song?.id)!==id||!panel.open)return;
   lines=result.lines||[];
   status(result.message||(result.empty?(result.pureMusic?'纯音乐，暂无歌词':'这首歌暂无歌词'):result.timed?'歌词随播放进度滚动 · 点击歌词可跳转':'暂无时间轴，显示完整歌词'));
   for(const line of lines){
    const el=document.createElement(result.timed?'button':'p');el.className='lyric-line';
    const text=document.createElement('span');text.textContent=line.text||'♪';el.append(text);
    if(line.translation){const translation=document.createElement('small');translation.textContent=line.translation;el.append(translation);}
    if(result.timed){el.type='button';el.onclick=async()=>{if(current!==request)return;el.disabled=true;try{await applyPlayerCommand({action:'seek',args:{seconds:line.time}});window.publishMusicPlayerState?.(true);follow();}catch(e){status('跳转失败：'+e.message,true);}finally{el.disabled=false;}};}
    viewport.append(el);
   }
   sync(true);
  }catch(e){if(current===request&&e.name!=='AbortError')status('歌词加载失败：'+e.message,true);}
 }
 function sync(force=false){
  if(!panel.open||!lines.length||lines[0].time===null)return;
  const position=Number(audio.currentTime)||0;let low=0,high=lines.length;
  while(low<high){const mid=(low+high)>>1;if(lines[mid].time<=position)low=mid+1;else high=mid;}
  const next=low-1;if(next===active&&!force)return;active=next;
  [...viewport.children].forEach((el,i)=>{el.classList.toggle('active',i===active);if(i===active)el.setAttribute('aria-current','true');else el.removeAttribute('aria-current');});
  const el=viewport.children[active];if(el&&!manual){const top=viewport.scrollTop+el.getBoundingClientRect().top-viewport.getBoundingClientRect().top-viewport.clientHeight/2+el.clientHeight/2;viewport.scrollTo({top:Math.max(0,top),behavior:force?'instant':'smooth'});}
 }
 trigger.onclick=()=>{if(!song)return;if(panel.open){panel.close();return;}panel.show();trigger.setAttribute('aria-expanded','true');load();};
 document.addEventListener('click',e=>{const cover=e.target.closest('.track-cover');if(!cover)return;e.preventDefault();e.stopPropagation();const row=cover.closest('.track'),selected=current[Number(row.dataset.i)];if(!selected?.available){notice('这首歌目前没有可用音源。');return;}if(String(song?.id)!==String(selected.id))row.click();if(!panel.open)trigger.click();},true);
 $('#close-lyrics').onclick=()=>panel.close();panel.addEventListener('close',()=>{request++;controller?.abort();trigger.setAttribute('aria-expanded','false');});
 $('#lyrics-retry').onclick=()=>{if(song)cache.delete(String(song.id));load();};$('#lyrics-follow').onclick=follow;
 for(const name of ['wheel','touchmove'])viewport.addEventListener(name,()=>{manual=true;$('#lyrics-follow').hidden=false;},{passive:true});
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel.open&&!document.querySelector('dialog:modal'))panel.close();});
 window.addEventListener('music-track-change',e=>update(e.detail));window.addEventListener('resize',()=>sync(true));
 audio.addEventListener('playing',()=>motion(true));for(const name of ['pause','ended','emptied','error','waiting'])audio.addEventListener(name,()=>motion(false));
 for(const name of ['timeupdate','seeked','loadedmetadata'])audio.addEventListener(name,()=>sync());
 audio.addEventListener('seeked',()=>motion(!audio.paused&&audio.readyState>=3));
 update(queue[index]||null);motion(!audio.paused&&!audio.ended&&audio.readyState>=3);
})();
