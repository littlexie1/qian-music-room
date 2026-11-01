import {api} from '../netease.mjs';
api.lyric=async id=>{
 if(id==='s2')await new Promise(r=>setTimeout(r,150));
 if(id==='s3')return {data:{pureMusic:true,lyric:''}};
 return {data:{lyric:Array.from({length:40},(_,i)=>`[${String(Math.floor(i*4/60)).padStart(2,'0')}:${String(i*4%60).padStart(2,'0')}.00]${id} 自己编写的测试歌词 ${i}`).join('\n')+'\n[02:50.00]<img src=x onerror="window.BAD=1">',transLyric:'[00:04.00]Translation written for the test'}};
};
await import('./player-server.mjs');
