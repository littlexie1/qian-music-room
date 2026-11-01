let activityLoadId=0,activityLimit=100;
function activityDate(value){if(!value)return '未提供时间';const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString():'未提供时间';}
function activityDuration(seconds){return time(Math.max(0,Number(seconds)||0)*1000);}
async function loadActivityRecords(){
 const id=++activityLoadId,kind=$('#activity-kind').value;$('#activity-status').textContent='正在读取…';$('#activity-list').innerHTML='';$('#activity-more').hidden=true;
 try{
  let rows=[],more=false;
  if(kind==='local'||kind==='netease'){
   const data=await get('/api/listening-history?source='+kind+'&limit='+activityLimit),section=kind==='local'?data.local:data.netease;
   rows=(section.records||[]).map(record=>{const s=record.song||record;return '<article class="activity-record"><b>'+esc(s.name||'未知歌曲')+'</b><small>'+esc(s.artists||'')+'</small><p>'+esc(kind==='local'?'本机实际播放 · '+activityDate(record.started_at):'网易云最近记录 · '+activityDate(record.played_at))+'</p>'+(kind==='local'?'<p>约播放 '+activityDuration(record.played_seconds)+' · 最远播放位置 '+activityDuration(record.max_position)+'</p>':'')+'</article>';});
   more=kind==='local'?section.total>activityLimit:rows.length>=activityLimit;
  }else if(kind==='notes'){
   const notes=await get('/api/listening-notes');rows=notes.map(n=>'<article class="activity-record"><b>'+esc(n.name||'未知歌曲')+'</b><small>'+esc(n.artists||'')+' · '+esc(activityDate(n.at))+'</small><p>'+esc(n.impression||'')+'</p><p>'+esc(n.selected?'入选':'未入选')+(n.reason?' · '+esc(n.reason):'')+'</p></article>');
  }else{
   const params=new URLSearchParams({conversationId,clientId:window.musicPlayerClientId||''}),data=await get('/api/timers?'+params);
   const names={scheduled:'等待触发',running:'执行中',completed:'已执行',fired:'已到期唤醒',cancelled:'已取消',failed:'失败'},actions={volume:'调节音量',play:'开始播放',pause:'暂停',next:'下一首',previous:'上一首',mode:'切换模式'};
   rows=[...(data.background||[]),...(data.player||[])].map(t=>'<article class="activity-record"><b>'+esc(t.reason||actions[t.action]||'后台等待')+'</b><small>'+esc(names[t.status]||t.status)+'</small><p>'+esc(t.trigger==='track_time'?'歌曲进度到 '+activityDuration(t.seconds):activityDate(t.due_at||t.deadline))+'</p>'+(t.actual_time!==undefined?'<p>实际触发位置 '+activityDuration(t.actual_time)+(t.actual_volume!==undefined?' · 音量 '+Math.round(t.actual_volume*100)+'%':'')+'</p>':'')+(t.error?'<p>'+esc(t.error)+'</p>':'')+'</article>');
  }
  if(id!==activityLoadId)return;$('#activity-list').innerHTML=rows.join('');$('#activity-status').textContent=rows.length?rows.length+' 条记录':kind==='notes'?'暂无试听笔记':kind==='timers'?'当前对话暂无定时操作':kind==='netease'?'网易云接口暂未返回最近记录。':'暂无本地播放记录，记录从功能启用后开始积累。';$('#activity-more').hidden=!more;
 }catch(e){if(id===activityLoadId)$('#activity-status').textContent='读取失败：'+e.message;}
}
$('#activity-records').onclick=()=>{$('#activity-panel').showModal();activityLimit=100;loadActivityRecords();};
$('#close-activity').onclick=()=>{$('#activity-panel').close();activityLoadId++;};
$('#activity-kind').onchange=()=>{activityLimit=100;loadActivityRecords();};
$('#refresh-activity').onclick=loadActivityRecords;
$('#activity-more').onclick=()=>{activityLimit+=100;loadActivityRecords();};
