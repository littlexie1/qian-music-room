import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateConversation,repairMessages} from '../session-history.mjs';
test('legacy failed and stopped branches merge chronologically instead of disappearing',()=>{
 const base=[{role:'user',content:'先找蒙古歌'},{role:'assistant',content:'已整理好蒙古歌。'}];
 const tool={role:'assistant',content:'我来听。',tool_calls:[{id:'listen',type:'function',function:{name:'listen_song',arguments:'{"id":"song"}'}}]};
 const runs=[{id:'one',conversationId:'c',goal:'先找蒙古歌',createdAt:'1',updatedAt:'2',status:'completed',messages:base},{id:'two',conversationId:'c',goal:'再找纯音乐',createdAt:'3',updatedAt:'4',status:'failed',messages:[...base,{role:'user',content:'再找纯音乐'},tool,{role:'tool',tool_call_id:'listen',content:'{"audioAttached":true}'}],error:'模型服务中止',selected:[{id:'song'}]},{id:'three',conversationId:'c',goal:'怎么出错了',createdAt:'5',updatedAt:'6',status:'cancelled',messages:[...base,{role:'user',content:'怎么出错了'},{role:'assistant',content:'我检查一下。'}]}];
 const result=migrateConversation({id:'c',title:'旧对话',createdAt:'1',updatedAt:'6',messages:base},runs);
 assert.deepEqual(result.messages.filter(m=>m.role==='user').map(m=>m.content),['先找蒙古歌','再找纯音乐','怎么出错了']);assert.equal(result.workspace.selected[0].id,'song');assert.ok(result.messages.some(m=>m.role==='tool'&&m.tool_call_id==='listen'));assert.ok(result.timeline.some(e=>e.kind==='status'&&e.content.includes('模型服务中止')));assert.equal(result.schemaVersion,2);
 assert.deepEqual(migrateConversation(result,runs),result);
});
test('interrupted tool groups receive explicit missing results and remain API-valid',()=>{
 const messages=repairMessages([{role:'assistant',content:null,tool_calls:[{id:'a',function:{name:'one'}},{id:'b',function:{name:'two'}}]},{role:'tool',tool_call_id:'a',content:'{}'},{role:'user',content:'继续'}]);assert.equal(messages[2].tool_call_id,'b');assert.equal(JSON.parse(messages[2].content).interrupted,true);assert.equal(messages[3].content,'继续');
});
