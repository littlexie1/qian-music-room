import json,os,re,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
state=Path(tempfile.mkdtemp(prefix='player-ui-',dir=root/'cache'));env=os.environ.copy();env.update(MUSIC_STATE_DIR=str(state),MUSIC_PORT='0',MUSIC_INDEX_HTML='index-conversation.html')
log=open(state/'server.log','w',encoding='utf8')
process=subprocess.Popen(['node','tests/player-server.mjs'],cwd=root,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
try:
 for _ in range(150):
  info=state/'server.json'
  if info.exists():
   try:base=json.loads(info.read_text())['url'];urllib.request.urlopen(base+'/api/conversations',timeout=1);break
   except Exception:pass
  time.sleep(.1)
 else:raise AssertionError((state/'server.log').read_text())
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True)
  context=browser.new_context()
  context.add_init_script('''
   const proto=HTMLMediaElement.prototype;
   Object.defineProperty(proto,'paused',{get(){return this._paused!==false}});
   Object.defineProperty(proto,'duration',{get(){return this.getAttribute('src')?180:NaN}});
   Object.defineProperty(proto,'currentTime',{get(){return this._time||0},set(v){this._time=v;this.dispatchEvent(new Event('seeked'));}});
   Object.defineProperty(proto,'seeking',{get(){return false}});
   proto.play=async function(){this._paused=false;this.dispatchEvent(new Event('play'));};
   proto.pause=function(){this._paused=true;this.dispatchEvent(new Event('pause'));};
   proto.load=function(){this._time=0;this.dispatchEvent(new Event('loadedmetadata'));};
   if(!localStorage.getItem('musicQueue'))localStorage.setItem('musicQueue',JSON.stringify({queue:['s1','s2','s3'].map(id=>({id,name:id,available:true})),index:0}));
  ''')
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base)
  page.wait_for_function('window.musicPlayerClientId && document.querySelector("#conversation-select").value')
  def run(tool,args=None):
   count=page.locator('.tool-call').count();page.locator('#message').fill(json.dumps({'tool':tool,'args':args or {}}));page.locator('#send').click()
   page.wait_for_function('(n)=>{const e=[...document.querySelectorAll(".tool-call")];return e.length>n&&!e.at(-1).classList.contains("running")}',arg=count)
   page.wait_for_function('document.querySelector("#ai-status").textContent===""')
   cid=page.locator('#conversation-select').input_value();data=json.load(urllib.request.urlopen(base+'/api/conversations/'+cid));entry=[e for e in data['entries'] if e['kind']=='tool'][-1]
   assert entry['state']=='done',entry
   return entry['result'].get('state',entry['result'])
  def ids(s):return [x['id'] for x in s['queue']]
  s=run('get_player_state');assert ids(s)==['s1','s2','s3'] and s['paused']
  s=run('control_playback',{'action':'play','position':2});assert s['song']['id']=='s2' and not s['paused']
  s=run('seek_playback',{'seconds':90});assert s['current_time']==90
  s=run('set_volume',{'volume':.25});assert s['volume']==.25
  for mode in ['shuffle','single','order']:assert run('set_play_mode',{'mode':mode})['mode']==mode
  assert run('control_playback',{'action':'next'})['song']['id']=='s3'
  assert run('control_playback',{'action':'previous'})['song']['id']=='s2'
  run('seek_playback',{'seconds':90})
  s=run('edit_play_queue',{'action':'insert_next','song_ids':['s4','s5']});assert ids(s)==['s1','s2','s4','s5','s3'] and s['current_time']==90
  s=run('edit_play_queue',{'action':'move','from_position':1,'position':5});assert ids(s)==['s2','s4','s5','s3','s1'] and s['current_position']==1 and s['current_time']==90
  s=run('edit_play_queue',{'action':'reorder','positions':[5,4,3,2,1]});assert ids(s)==['s1','s3','s5','s4','s2'] and s['current_position']==5 and s['current_time']==90
  s=run('edit_play_queue',{'action':'remove','positions':[1,2]});assert ids(s)==['s5','s4','s2'] and s['current_time']==90
  s=run('edit_play_queue',{'action':'remove','position':3});assert ids(s)==['s5','s4'] and s['song']['id']=='s4' and not s['paused']
  assert run('control_playback',{'action':'pause'})['paused']
  s=run('edit_play_queue',{'action':'replace','song_ids':['s1','s3']});assert ids(s)==['s1','s3'] and s['paused']
  s=run('play_song',{'id':'s2'});assert ids(s)==['s1','s3','s2'] and s['song']['id']=='s2'
  # Song-time cues follow actual media position, respect pause and cancel on track changes.
  run('schedule_player_action',{'trigger':'track_time','seconds':30,'action':'volume','volume':.7})
  run('control_playback',{'action':'pause'});run('seek_playback',{'seconds':35})
  assert page.locator('audio').evaluate('(a)=>a.volume')==.25
  run('control_playback',{'action':'play'});page.wait_for_function('document.querySelector("audio").volume===.7')
  timers=run('list_timers');assert any(t['status']=='completed' and t['actual_time']==35 for t in timers['player'])
  run('schedule_player_action',{'trigger':'track_time','seconds':100,'action':'volume','volume':.9})
  run('play_song',{'id':'s1'});timers=run('list_timers');assert any(t['status']=='cancelled' for t in timers['player'])
  run('schedule_player_action',{'trigger':'delay','seconds':.05,'action':'volume','volume':.2})
  page.wait_for_function('document.querySelector("audio").volume===.2')
  run('schedule_player_action',{'trigger':'track_time','seconds':90,'action':'pause'})
  run('cancel_timer');run('seek_playback',{'seconds':95});assert not page.locator('audio').evaluate('(a)=>a.paused')
  now=run('get_current_time');assert 'iso_utc' in now
  history=run('listening_history',{'source':'local'});assert history['local']['total']>0
  page.locator('#activity-records').click();page.wait_for_selector('.activity-record')
  assert '约播放' in page.locator('#activity-list').inner_text()
  page.select_option('#activity-kind','netease');page.wait_for_function('document.querySelector("#activity-list").textContent.includes("网易云历史测试")')
  page.select_option('#activity-kind','notes');page.wait_for_function('document.querySelector("#activity-list").textContent.includes("试听笔记测试")');assert page.evaluate('window.BAD') is None
  page.select_option('#activity-kind','timers');page.wait_for_function('document.querySelector("#activity-list").textContent.includes("已执行")');page.locator('#close-activity').click()
  run('play_song',{'id':'s2'})
  s=run('seek_playback',{'seconds':999});assert s['current_time']==180
  second=context.new_page();second.goto(base);second.wait_for_function('window.musicPlayerClientId')
  run('set_volume',{'volume':.1});assert second.locator('audio').evaluate('(a)=>a.volume')==.2
  second.close()
  page.reload();page.wait_for_function('window.musicPlayerClientId && document.querySelector("#conversation-select").value')
  s=run('get_player_state');assert ids(s)==['s1','s3','s2'] and s['volume']==.1 and s['paused']
  s=run('edit_play_queue',{'action':'clear'});assert s['queue']==[] and s['current_position'] is None and s['paused']
  assert not errors,errors
  browser.close()
 print('PASS: actual HTTP/SSE/Agent tool loop; play/pause/skip/seek/volume/modes; queue insert/move/reorder/remove/replace/clear; current-track continuity; multi-window targeting and reload persistence')
finally:
 process.terminate();process.wait(timeout=10);log.close()
