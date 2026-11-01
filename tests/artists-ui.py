import io,json,os,subprocess,tempfile,time,urllib.request,wave
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];(root/'cache').mkdir(exist_ok=True)
state=Path(tempfile.mkdtemp(prefix='artists-ui-',dir=root/'cache'))
env=os.environ.copy();env.update(MUSIC_STATE_DIR=str(state),MUSIC_PORT='0')
with open(state/'server.log','w',encoding='utf8') as log:
 process=subprocess.Popen(['node','tests/artists-server.mjs'],cwd=root,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
 try:
  for _ in range(100):
   try:base=json.loads((state/'server.json').read_text())['url'];urllib.request.urlopen(base+'/api/conversations',timeout=1);break
   except Exception:time.sleep(.1)
  else:raise RuntimeError((state/'server.log').read_text())
  with sync_playwright() as p:
   browser=p.chromium.launch(channel='msedge',headless=True);context=browser.new_context(viewport={'width':1440,'height':960})
   context.add_init_script('''
const proto=HTMLMediaElement.prototype;
Object.defineProperty(proto,'paused',{get(){return this._paused!==false}});
Object.defineProperty(proto,'duration',{get(){return this.getAttribute('src')?180:NaN}});
Object.defineProperty(proto,'readyState',{get(){return this.getAttribute('src')?4:0}});
Object.defineProperty(proto,'seeking',{get(){return false}});
Object.defineProperty(proto,'currentTime',{get(){return this._time||0},set(v){this._time=v;this.dispatchEvent(new Event('seeked'));}});
proto.play=async function(){this._paused=false;this.dispatchEvent(new Event('playing'));};
proto.pause=function(){this._paused=true;this.dispatchEvent(new Event('pause'));};
proto.load=function(){this._time=0;this.dispatchEvent(new Event('loadedmetadata'));};
localStorage.setItem('musicQueue',JSON.stringify({queue:[{id:'old',name:'原来的歌曲',artists:'音乐人甲 / 音乐人乙',available:true}],index:0}));
''')
   wav=io.BytesIO()
   with wave.open(wav,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(8000);w.writeframes(b'\0\0'*8000)
   context.route('**/api/audio/**',lambda route:route.fulfill(body=wav.getvalue(),content_type='audio/wav'))
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base)
   page.wait_for_selector('#library .artist-link');assert page.locator('.track').first.locator('.artist-link').count()==2
   page.locator('.track').first.locator('.artist-link').first.click();page.wait_for_selector('.artist-track')
   assert page.locator('#artist-title').inner_text()=='音乐人甲';assert page.locator('.artist-track').count()==30
   assert page.evaluate('queue.length')==1 and page.evaluate('audio.paused')
   assert page.locator('#artist-original').get_attribute('href').endswith('artist?id=100')
   page.locator('#artist-more').click();page.wait_for_function('document.querySelectorAll(".artist-track").length===32')
   page.locator('#artist-tab-albums').click();assert page.locator('.artist-album').count()==2
   page.locator('.artist-album').first.click();page.wait_for_function('document.querySelector("#artist-subtitle").textContent.startsWith("专辑 album")')
   assert page.locator('.artist-track').count()==2 and not page.evaluate('window.BAD||false')
   page.locator('.artist-track').first.get_by_role('button',name='播放专辑第一首',exact=True).click()
   page.wait_for_function('queue.length===2 && queue[index].name==="专辑第一首"')
   assert page.evaluate('queue[0].name')=='原来的歌曲'
   page.locator('.artist-track').nth(1).get_by_role('button',name='加入当前播放列表',exact=True).click()
   assert page.evaluate('queue.length')==3
   page.locator('#artist-back').click();page.wait_for_selector('.artist-album');assert page.locator('.artist-album').count()==2
   page.screenshot(path=str(state/'artist-preview.png'))
   page.locator('#close-artist').click();page.locator('#now-cover-button').click();page.wait_for_selector('#lyrics-panel[open]')
   page.locator('#lyrics-artist .artist-link').first.click();page.wait_for_selector('#artist-panel[open] .artist-track')
   page.keyboard.press('Escape');assert not page.locator('#artist-panel').evaluate('el=>el.open');assert page.locator('#lyrics-panel').evaluate('el=>el.open')
   page.locator('#close-lyrics').click()
   # Old saved queues retain name-only metadata: fetch the song and offer an artist chooser.
   page.evaluate('nowPlaying({id:"old",name:"原来的歌曲",artists:"音乐人甲 / 音乐人乙",available:true})')
   page.locator('#now-artist .artist-link').click();page.wait_for_selector('.artist-choice');assert page.locator('.artist-choice').count()==2
   page.locator('.artist-choice').nth(1).click();page.wait_for_function('document.querySelector("#artist-title").textContent==="音乐人乙" && document.querySelectorAll(".artist-track").length===30')
   assert not errors,errors
   print('PASS: artist links and IDs, multi-artist choice, pagination, albums, play/add preserves queue, lyric overlay, safe text')
   browser.close()
 finally:process.terminate();process.wait(timeout=10)
