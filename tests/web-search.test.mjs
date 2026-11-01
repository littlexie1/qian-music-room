import test from 'node:test';
import assert from 'node:assert/strict';
import {webSearch} from '../web-search.mjs';
import {executeTool,toolSpecs} from '../music-tools.mjs';
const payload={status:'completed',output:[{type:'web_search_call',status:'completed',action:{sources:[{title:'官方资料',url:'https://example.com/music'},{title:'重复',url:'https://example.com/music'},{title:'无效',url:'javascript:alert(1)'}]}},{type:'message',content:[{type:'output_text',text:'查到的资料',annotations:[{type:'url_citation',title:'另一来源',url:'https://example.org/credits'}]}]}]};
test('web query is an explicit tool, sends only query, and returns actual source metadata',async()=>{
 const saved={...process.env};const previous=globalThis.fetch;
 try{
  process.env.DASHSCOPE_API_KEY='synthetic-test-key';process.env.DASHSCOPE_BASE_URL='https://workspace.example.com/compatible-mode/v1';
  let request;globalThis.fetch=async(url,options)=>{request={url,body:JSON.parse(options.body)};return Response.json(payload);};
  const result=await executeTool('web_search',{query:'  某曲的编曲者  '},{signal:new AbortController().signal,task:{candidates:{},playlists:{},selected:[],messages:[{role:'user',content:'private history must not be sent'}]},emit(){},save(){}});
  assert.ok(toolSpecs.some(t=>t.function.name==='web_search'));assert.equal(result.searched,true);assert.equal(result.query,'某曲的编曲者');assert.equal(result.sources.length,2);assert.equal(result.answer,'查到的资料');
  assert.equal(request.body.store,false);assert.deepEqual(request.body.tools,[{type:'web_search'}]);assert.equal(request.body.input.length,2);assert.ok(!JSON.stringify(request.body).includes('private history'));assert.match(request.url,/\/responses$/);
 }finally{globalThis.fetch=previous;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
test('no actual search, failed responses, empty queries and cancellation never produce fake successful searches',async()=>{
 const saved={...process.env};
 try{
  process.env.DASHSCOPE_API_KEY='synthetic-test-key';process.env.DASHSCOPE_BASE_URL='https://workspace.example.com/compatible-mode/v1';
  await assert.rejects(webSearch(''),/关键词/);
  await assert.rejects(webSearch('test',{fetcher:async()=>Response.json({output:[{type:'message',content:[{type:'output_text',text:'guess'}]}]})}),/未实际执行/);
  await assert.rejects(webSearch('test',{fetcher:async()=>new Response('permission denied',{status:403})}),/HTTP 403/);
  await assert.rejects(webSearch('test',{fetcher:async()=>Response.json({status:'incomplete',output:payload.output})}),/未完成/);
  const stop=new AbortController();stop.abort();let called=false;
  await assert.rejects(webSearch('test',{signal:stop.signal,fetcher:async()=>{called=true;return Response.json(payload);}}));assert.equal(called,false);
 }finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
