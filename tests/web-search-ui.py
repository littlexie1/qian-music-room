import json,mimetypes
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

roots=[Path(__file__).resolve().parents[1]]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True)
 for root in roots:
  page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  tool={'id':'search-tool','kind':'tool','name':'web_search','args':{'query':'作曲与编曲资料'},'state':'done','result':{'answer':'资料摘要','sources':[{'title':'<script>unsafe()</script> 官方资料','url':'https://example.com/credits'},{'title':'bad','url':'javascript:alert(1)'}]}}
  conversation={'id':'c','title':'Test','status':'idle','entries':[tool],'plan':[],'selected':[],'playlists':{},'pendingCount':0}
  def route(r):
   path=urlparse(r.request.url).path
   if path.startswith('/api/'):
    if path=='/api/conversations':data=[conversation]
    elif path=='/api/conversations/c':data=conversation
    elif path.endswith('/events'):r.fulfill(content_type='text/event-stream',body=': test\n\n');return
    elif path=='/api/profile':data={'nickname':'Test'}
    else:data=[]
    r.fulfill(content_type='application/json',body=json.dumps(data));return
   f=root/'public'/('index-conversation.html' if path=='/' else path.lstrip('/'))
   r.fulfill(content_type=mimetypes.guess_type(f.name)[0] or 'application/octet-stream',body=f.read_bytes())
  page.route('http://localhost:59999/**',route)
  page.goto('http://localhost:59999/')
  page.wait_for_selector('.tool-call summary');assert '联网查询 · 作曲与编曲资料' in page.locator('.tool-call summary').inner_text()
  page.locator('.tool-call summary').click();link=page.locator('.web-sources a')
  assert link.count()==1;assert link.get_attribute('href')=='https://example.com/credits'
  assert '<script>' in link.inner_text();assert page.locator('.web-sources script').count()==0
  assert link.get_attribute('rel')=='noopener noreferrer';assert not errors,errors
  page.close()
 browser.close()
print('PASS: network query title, clickable sources, untrusted text escaping and unsafe URL rejection')
