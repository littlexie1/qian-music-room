import test from 'node:test';
import assert from 'node:assert/strict';
import {song} from '../music-shapes.mjs';
import {api} from '../netease.mjs';
import {artistWorks,albumWorks} from '../music-artists.mjs';
test('song preserves separate artist identities, public IDs and avatars',()=>{
 const d=song({id:'s',artists:[{id:'a',originalId:10,name:'甲',coverImgUrl:'https://example.com/a.jpg'},{id:'b',originalId:11,name:'乙'}]});
 assert.equal(d.artists,'甲 / 乙');assert.equal(d.artistList[1].id,'b');assert.equal(d.artistList[0].originalId,10);assert.equal(d.artistList[0].cover,'https://example.com/a.jpg');
 assert.equal(song({artistName:'歌手',artistId:'c',originalArtistId:12}).artistList[0].id,'c');
});
test('artist pages preserve pagination and deduplicate albums from loaded works',async()=>{
 let seen;api.artistSongs=async(id,offset)=>{seen={id,offset};return {data:Array.from({length:30},(_,i)=>({id:'s'+i,name:'曲'+i,artists:[],album:{id:'album',name:'专辑'}}))};};
 const d=await artistWorks('artist',30);assert.deepEqual(seen,{id:'artist',offset:30});assert.equal(d.songs.length,30);assert.equal(d.more,true);assert.equal(d.nextOffset,60);assert.equal(d.albums.length,1);
 await assert.rejects(()=>artistWorks('artist',-1),/分页/);
});
test('album tracks remain available when the optional introduction is denied',async()=>{
 api.albumDetail=async()=>{throw Error('未授权')};api.albumTracks=async()=>({data:[{id:'song',name:'作品',artists:[]}]});
 const d=await albumWorks('album');assert.equal(d.songs.length,1);assert.match(d.warning,/未授权/);
 api.albumTracks=async()=>{throw Error('曲目接口失败')};await assert.rejects(()=>albumWorks('album'),/曲目接口失败/);
});
