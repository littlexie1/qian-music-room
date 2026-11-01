// Documentation fixtures only. No real account, model request or music download.
import {api} from '../netease.mjs';
import {chatServices} from '../chat-agent.mjs';
if(process.env.MUSIC_DOCS_DEMO!=='1')throw Error('This fixture requires MUSIC_DOCS_DEMO=1.');
const cover=(label,a,b)=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="240" height="240" rx="24" fill="url(#g)"/><circle cx="150" cy="80" r="68" fill="white" opacity=".15"/><path d="M0 210Q80 100 240 160V240H0" fill="white" opacity=".12"/><text x="24" y="182" fill="white" font-family="sans-serif" font-size="25">${label}</text><text x="25" y="207" fill="white" opacity=".7" font-family="sans-serif" font-size="12">MUSIC ROOM · DEMO</text></svg>`);
const rows=[['花之绪','南有乔木',208000,'#888cc8','#c3b4df'],['Flower Dance','DJ OKAWARI',268000,'#568f9a','#a9c6bb'],['Summer','久石让',187000,'#d8a676','#e7ca9e'],['A Little Story','Valentin',206000,'#6684ac','#a8bfd8'],['Luv Letter','DJ OKAWARI',269000,'#b18499','#d6b5b0'],['夜的钢琴曲五','石进',140000,'#7b8999','#abb8c7']];
const songs=rows.map(([name,artist,duration,a,b],i)=>({id:'demo-'+i,name,artists:[{name:artist}],duration,album:{picUrl:cover(name,a,b)},visible:true,playFlag:true,liked:i===0}));
const playlists=[{id:'demo-list',name:'钢琴与微风',trackCount:6,coverImgUrl:cover('钢琴与微风','#888cc8','#c3b4df')},{id:'demo-list-2',name:'把日子放慢一点',trackCount:6,coverImgUrl:cover('把日子放慢','#568f9a','#a9c6bb')}];
api.profile=async()=>({data:{nickname:'音乐室访客 · 演示'}});
api.daily=api.search=api.playlist=async()=>({data:songs});
api.created=api.collected=api.recommended=async()=>({data:playlists});
api.liked=async()=>({data:playlists[0]});
api.song=async id=>({data:songs.find(s=>s.id===id)||songs[0]});
api.comments=async()=>({data:{records:[],total:0}});
api.playHistory=async()=>({data:[]});
api.playurl=async()=>{throw Error('文档演示不提供实际歌曲音源。');};
chatServices.readMemory=async()=>({preferences:[],listening:{}});
chatServices.completion=async()=>{const content='好，先按这个方向找：旋律要灵动，层次要足，避开太燃的电子音色。我会先听候选，再挑给你；已有歌单里的也会避开。';return {message:{role:'assistant',content},content,calls:[]};};
await import('../server.mjs');
