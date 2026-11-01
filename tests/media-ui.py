import json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];state=Path(tempfile.mkdtemp(prefix='media-ui-',dir=root/'cache'));env=os.environ.copy();env.update(MUSIC_STATE_DIR=str(state),MUSIC_PORT='0',MUSIC_INDEX_HTML='index-conversation.html')
log=open(state/'server.log','w',encoding='utf8');process=subprocess.Popen(['node','tests/media-server.mjs'],cwd=root,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
try:
 for _ in range(150):
  try:base=json.loads((state/'server.json').read_text())['url'];urllib.request.urlopen(base,timeout=1);break
  except Exception:time.sleep(.1)
 else:raise AssertionError((state/'server.log').read_text())
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True,args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'])
  context=browser.new_context(permissions=['microphone']);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base);page.wait_for_function('document.querySelector("#conversation-select").value')
  page.locator('#media-file').set_input_files([{'name':'input.wav','mimeType':'audio/wav','buffer':b'RIFF audio test'},{'name':'input.mp4','mimeType':'video/mp4','buffer':b'video test'}])
  page.wait_for_function('window.pendingMediaIds().length===2');assert page.locator('#pending-media audio').count()==1 and page.locator('#pending-media video').count()==1
  page.locator('#message').fill('请看这两个附件');page.locator('#send').click();page.wait_for_function('document.querySelector("#messages").textContent.includes("已原生收到音频视频")')
  assert page.locator('.user-attachments audio').count()==1 and page.locator('.user-attachments video').count()==1
  assert page.locator('.pending-media-item').count()==0
  audio_url=page.locator('.user-attachments audio').get_attribute('src');response=urllib.request.urlopen(urllib.request.Request(base+audio_url,headers={'Range':'bytes=0-3'}));assert response.status==206 and response.read()==b'RIFF'
  page.locator('#record-voice').click();page.wait_for_function('document.querySelector("#record-voice").getAttribute("aria-pressed")==="true"');page.wait_for_timeout(600);page.locator('#record-voice').click();page.wait_for_function('window.pendingMediaIds().length===1')
  page.locator('#send').click();page.wait_for_function('document.querySelectorAll(".user-attachments audio").length===2')
  recording=page.locator('.user-attachments audio').last.get_attribute('src');wav=urllib.request.urlopen(base+recording).read();assert wav[:4]==b'RIFF' and wav[8:12]==b'WAVE' and len(wav)>44
  page.locator('#media-file').set_input_files({'name':'discard.wav','mimeType':'audio/wav','buffer':b'test'});page.wait_for_function('window.pendingMediaIds().length===1');page.locator('#new-conversation').click();page.wait_for_function('window.pendingMediaIds().length===0')
  assert not errors,errors;browser.close()
 print('PASS: streamed audio/video upload; parent-context native parts; user-visible previews and Range reads; actual microphone recording converted to WAV; attachment drafts cleared on new conversation')
finally:process.terminate();process.wait(timeout=10);log.close()
