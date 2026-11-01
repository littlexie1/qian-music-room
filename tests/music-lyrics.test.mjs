import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLyrics,parseLrc} from '../music-lyrics.mjs';
test('LRC supports repeated timestamps, fractions, chronological order and same-time translations',()=>{
 const d=normalizeLyrics({lyric:'[ti:示例]\n[00:12.34][00:42.005]这是我们自己写的歌词\n[00:01]第一句\n[00:12.34]同时出现的第二行',transLyric:'[00:12.34]A line written for this test'});
 assert.equal(d.timed,true);assert.deepEqual(d.lines.map(l=>l.time),[1,12.34,42.005]);assert.match(d.lines[1].text,/第二行/);assert.equal(d.lines[1].translation,'A line written for this test');
});
test('plain lyrics, instrumental music, absent data and literal markup remain honest data',()=>{
 assert.equal(normalizeLyrics({txtLyric:'没有时间戳\n另一行'}).timed,false);assert.equal(normalizeLyrics({pureMusic:true}).empty,true);assert.equal(normalizeLyrics(null).empty,true);
 assert.equal(parseLrc('[00:01]<img src=x onerror=alert(1)>').lines[0].text,'<img src=x onerror=alert(1)>');
});
