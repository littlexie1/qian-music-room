import test from 'node:test';
import assert from 'node:assert/strict';
import {registerExternalTrack,externalTrack} from '../external-tracks.mjs';
test('external source identity survives resolution changes and invalid media is rejected',()=>{
 const first=registerExternalTrack({id:'123',source:'kugou',name:'测试歌',url:'https://example.com/old.mp3'});
 const next=registerExternalTrack({id:'123',source:'kugou',name:'测试歌',url:'https://example.com/new.mp3'});
 assert.equal(first.id,next.id);assert.equal(externalTrack(first.id).url,'https://example.com/new.mp3');
 assert.notEqual(first.id,registerExternalTrack({id:'123',source:'migu',name:'测试歌',url:'https://example.com/song.mp3'}).id);
 assert.throws(()=>registerExternalTrack({id:'1',source:'bad',name:'bad',url:'file:///C:/secret'}),/无效/);
 assert.throws(()=>externalTrack('external_missing'),/已失效/);
});
