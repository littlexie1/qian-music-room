import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeComments,loadComments} from '../music-comments.mjs';
import {api} from '../netease.mjs';
test('comments retain full content and report cursor, counts, and pagination',()=>{
 const result=normalizeComments({recordCount:3,cursor:'normalHot#2',records:[{id:'c1',creator:{nickname:'Alice',avatarUrl:'avatar'},content:'line one\n<script>unsafe</script>',likedCount:8,time:123},{id:'c2',creatorNickName:'Bob',content:'second'}]},{offset:0});
 assert.equal(result.comments[0].content,'line one\n<script>unsafe</script>');assert.equal(result.comments[0].author,'Alice');assert.equal(result.comments[1].author,'Bob');assert.equal(result.more,true);assert.equal(result.total,3);assert.equal(result.cursor,'normalHot#2');
 assert.equal(normalizeComments({recordCount:3,records:[{id:'last'}]},{offset:2}).more,false);
 assert.equal(normalizeComments({recordCount:0,records:[]}).more,false);
});
test('song and playlist comments pass through the actual cursor and validate input',async()=>{
 let received;api.comments=async(...args)=>{received=args;return {data:{recordCount:21,records:[{id:'last',content:'last'}]}};};
 const r=await loadComments('playlist-id','playlist',20,'normalHot#20');assert.deepEqual(received,['playlist-id','playlist',20,'normalHot#20']);assert.equal(r.more,false);
 await assert.rejects(loadComments('id','song',-1),/参数/);await assert.rejects(loadComments('id','unsupported'),/不支持/);
});
