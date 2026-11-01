import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
await mkdir(new URL('../cache/',import.meta.url),{recursive:true});process.env.MUSIC_STATE_DIR=await mkdtemp(new URL('../cache/actions-test-',import.meta.url));
const {api}=await import('../netease.mjs');const {setSongLiked,setPlaylistSubscribed,addSongToPlaylist,removeSongFromPlaylist}=await import('../music-actions.mjs');
test('song hearts and playlist subscriptions read back the actual state and are idempotent',async()=>{
 let liked=false,subed=false,hearts=0,collections=0;
 api.song=async()=>({data:{id:'song',name:'Song',artists:[],liked}});api.like=async(id,state)=>{hearts++;liked=state;};
 api.playlistDetail=async()=>({data:{id:'list',name:'List',subed}});api.subscribePlaylist=async(id,state)=>{collections++;subed=state;};
 assert.equal((await setSongLiked('song',true)).liked,true);await setSongLiked('song',true);assert.equal(hearts,1);
 assert.equal((await setPlaylistSubscribed('list',true)).subed,true);await setPlaylistSubscribed('list',true);assert.equal(collections,1);
 api.like=async()=>{};await assert.rejects(setSongLiked('song',false),/尚未确认/);
 api.subscribePlaylist=async()=>{throw Error('应用未授权当前接口（300）');};await assert.rejects(setPlaylistSubscribed('list',false),/未授权/);
});
test('adding to an existing playlist never creates a new one, and retries do not duplicate tracks',async()=>{
 let tracks=[],adds=0,creates=0;
 api.song=async()=>({data:{id:'song',name:'Song'}});api.created=async()=>({data:[{id:'existing',name:'My existing list'}]});api.playlist=async()=>({data:tracks});api.playlistDetail=async()=>({data:{id:'existing',name:'My existing list'}});
 api.createPlaylist=async()=>{creates++;throw Error('must not create');};api.addToPlaylist=async(id,ids)=>{assert.equal(id,'existing');adds++;tracks.push(...ids.map(id=>({id})));};
 const body={songId:'song',playlistId:'existing',requestId:randomUUID()};const first=await addSongToPlaylist(body);const retry=await addSongToPlaylist(body);assert.equal(first.verified,true);assert.equal(retry.verified,true);assert.equal(creates,0);assert.equal(adds,1);
 const again=await addSongToPlaylist({...body,requestId:randomUUID()});assert.equal(again.alreadyPresent,true);assert.equal(adds,1);
 await assert.rejects(addSongToPlaylist({...body,playlistId:'not-mine',requestId:randomUUID()}),/你创建的歌单/);
});
test('playlist removal checks ownership, reads back deletion, and handles repeated removal',async()=>{
 let tracks=[{id:'remove'},{id:'keep'}],removes=0,ignoreWrite=false;
 api.liked=async()=>({data:{id:'liked'}});api.created=async()=>({data:[{id:'mine'}]});api.playlist=async()=>({data:tracks});api.removeFromPlaylist=async(id,ids)=>{assert.equal(id,'mine');removes++;if(!ignoreWrite)tracks=tracks.filter(s=>!ids.includes(s.id));};
 const result=await removeSongFromPlaylist({playlistId:'mine',songId:'remove'});assert.equal(result.verified,true);assert.deepEqual(tracks,[{id:'keep'}]);
 const retry=await removeSongFromPlaylist({playlistId:'mine',songId:'remove'});assert.equal(retry.alreadyAbsent,true);assert.equal(removes,1);
 await assert.rejects(removeSongFromPlaylist({playlistId:'someone-else',songId:'keep'}),/你创建的歌单/);
 ignoreWrite=true;await assert.rejects(removeSongFromPlaylist({playlistId:'mine',songId:'keep'}),/尚未确认移出/);
});
