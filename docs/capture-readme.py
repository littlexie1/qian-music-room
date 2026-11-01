"""Capture the real UI using isolated fixtures; no account or API Key required.
Optional developer dependencies: Python, Playwright and an installed browser.
"""
import json, os, shutil, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
(root/'cache').mkdir(exist_ok=True)
state=Path(tempfile.mkdtemp(prefix='readme-demo-',dir=root/'cache'))
out=root/'docs'/'images'
out.mkdir(parents=True,exist_ok=True)
env=os.environ.copy()
env.update(MUSIC_DOCS_DEMO='1',MUSIC_STATE_DIR=str(state),MUSIC_PORT='0')
for name in ['DASHSCOPE_API_KEY','DASHSCOPE_BASE_URL','NCM_APP_ID','NCM_PRIVATE_KEY_PATH']:
    env.pop(name,None)
with open(state/'demo.log','w',encoding='utf8') as log:
    process=subprocess.Popen(['node','docs/demo-server.mjs'],cwd=root,env=env,stdout=log,stderr=log,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    try:
        for _ in range(100):
            try:
                base=json.loads((state/'server.json').read_text())['url']
                urllib.request.urlopen(base+'/api/conversations',timeout=1)
                break
            except Exception:
                time.sleep(.1)
        else:
            raise RuntimeError((state/'demo.log').read_text())
        with sync_playwright() as p:
            browser=p.chromium.launch(channel='msedge',headless=True)
            page=browser.new_page(viewport={'width':1600,'height':1000},device_scale_factor=1)
            page.goto(base)
            page.wait_for_selector('.track')
            page.wait_for_function('document.querySelector("#conversation-select").value')
            page.locator('#message').fill('找些像《花之绪》《Flower Dance》的纯音乐，要有层次、旋律灵动，别太燃，也别和已有歌单重复。')
            page.locator('#send').click()
            page.wait_for_function('document.querySelectorAll(".bubble.assistant").length>0')
            page.wait_for_timeout(300)
            page.screenshot(path=str(out/'music-room.png'))
            for button in page.locator('[data-enqueue]').all()[:4]:
                button.click()
            page.locator('#queue-button').click()
            page.wait_for_selector('#queue-panel[open]')
            page.screenshot(path=str(out/'play-queue.png'))
            page.locator('#close-queue').click()
            page.locator('[data-view="created"]').click()
            page.wait_for_selector('.card')
            page.locator('.card').first.click()
            page.wait_for_selector('.remove-cloud-track')
            page.locator('[data-add]').first.click()
            page.wait_for_selector('#playlist-picker[open]')
            page.screenshot(path=str(out/'playlist-picker.png'))
            page.locator('#close-picker').click()
            # A tiny generated WAV demonstrates the attachment UI without using
            # anyone's voice, video, music or private files.
            import wave
            wav=state/'声音片段示例.wav'
            with wave.open(str(wav),'wb') as w:
                w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\0\0'*16000)
            page.locator('#media-file').set_input_files(str(wav))
            page.wait_for_selector('.pending-media-item audio')
            page.locator('#message').fill('听听这段声音，帮我找几首有类似感觉的歌。')
            page.screenshot(path=str(out/'audio-message.png'))
            browser.close()
        print('Saved four documentation screenshots to docs/images (demo data).')
    finally:
        process.terminate()
        process.wait(timeout=10)
