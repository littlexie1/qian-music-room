import io,json,os,subprocess,tempfile,time,urllib.request,wave
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
(root/'cache').mkdir(exist_ok=True)
state=Path(tempfile.mkdtemp(prefix='lyrics-ui-',dir=root/'cache'))
env=os.environ.copy();env.update(MUSIC_STATE_DIR=str(state),MUSIC_PORT='0')
with open(state/'server.log','w',encoding='utf8') as log:
 process=subprocess.Popen(['node','tests/lyrics-server.mjs'],cwd=root,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
 try:
  for _ in range(100):
   try:
    base=json.loads((state/'server.json').read_text())['url'];urllib.request.urlopen(base+'/api/conversations',timeout=1);break
   except Exception:time.sleep(.1)
  else:raise RuntimeError((state/'server.log').read_text())
  with sync_playwright() as p:
   browser=p.chromium.launch(channel='msedge',headless=True)
   context=browser.new_context(viewport={'width':1440,'height':960})
   context.add_init_script('''
const proto=HTMLMediaElement.prototype;
Object.defineProperty(proto,'paused',{get(){return this._paused!==false}});
Object.defineProperty(proto,'duration',{get(){return this.getAttribute('src')?180:NaN}});
Object.defineProperty(proto,'readyState',{get(){return this.getAttribute('src')?4:0}});
Object.defineProperty(proto,'seeking',{get(){return false}});
Object.defineProperty(proto,'currentTime',{get(){return this._time||0},set(v){this._time=v;this.dispatchEvent(new Event('seeked'));}});
proto.play=async function(){this._paused=false;this.dispatchEvent(new Event('play'));this.dispatchEvent(new Event('playing'));};
proto.pause=function(){this._paused=true;this.dispatchEvent(new Event('pause'));};
proto.load=function(){this._time=0;this.dispatchEvent(new Event('loadedmetadata'));};
''')
   wav=io.BytesIO()
   with wave.open(wav,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(8000);w.writeframes(b'\0\0'*8000)
   context.route('**/api/audio/**',lambda route:route.fulfill(body=wav.getvalue(),content_type='audio/wav'))
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(base);page.wait_for_selector('.track-cover')
   page.locator('.track-cover').first.click();page.wait_for_selector('#lyrics-panel[open] .lyric-line')
   assert page.locator('#lyrics-title').inner_text()=='Test s1'
   page.evaluate("audio.dispatchEvent(new Event('playing'))")
   assert page.locator('#now-cover').evaluate("el=>getComputedStyle(el).animationPlayState")=='running'
   assert page.locator('#lyrics-cover').evaluate("el=>getComputedStyle(el).animationPlayState")=='running'
   page.evaluate('audio.currentTime=80;audio.dispatchEvent(new Event("timeupdate"))')
   assert page.locator('.lyric-line.active').inner_text()=='s1 自己编写的测试歌词 20'
   page.wait_for_function('document.querySelector("#lyrics-lines").scrollTop>0')
   page.evaluate('audio.pause()')
   assert page.locator('#lyrics-cover').evaluate("el=>getComputedStyle(el).animationPlayState")=='paused'
   angle=page.locator('#lyrics-cover').evaluate('el=>getComputedStyle(el).transform')
   page.wait_for_timeout(120)
   assert page.locator('#lyrics-cover').evaluate('el=>getComputedStyle(el).transform')==angle
   page.screenshot(path=str(state/'lyrics-preview.png'))
   page.locator('.lyric-line').nth(1).click();assert page.evaluate('audio.currentTime')==4
   assert page.locator('.lyric-line.active small').inner_text()=='Translation written for the test'
   assert page.locator('#lyrics-lines img').count()==0 and not page.evaluate('window.BAD||false')
   page.keyboard.press('Escape');assert not page.locator('#lyrics-panel').evaluate('el=>el.open')
   page.locator('#now-cover-button').click();page.wait_for_selector('#lyrics-panel[open] .lyric-line')
   # A slow response for the previous track must never overwrite the next one.
   page.evaluate('play(1);play(2)')
   page.wait_for_function('document.querySelector("#lyrics-status").textContent.includes("纯音乐")')
   page.wait_for_timeout(220);assert page.locator('#lyrics-title').inner_text()=='Test s3'
   assert page.locator('.lyric-line').count()==0
   page.evaluate('clearQueue()');assert not page.locator('#lyrics-panel').evaluate('el=>el.open')
   assert page.locator('#now-cover-button').is_disabled()
   assert not errors,errors
   print('PASS: cover click, rotation pause/resume, synced scroll, line seek, translation, XSS, instrumental state, track race, clear queue')
   browser.close()
 finally:
  process.terminate();process.wait(timeout=10)
