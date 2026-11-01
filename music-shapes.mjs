export function artistRefs(s){
 const source=[s.artists,s.ar,s.artistList,s.fullArtists].find(a=>Array.isArray(a)&&a.length)||[];
 const raw=source.length?source:s.artistName?[{id:s.artistId,originalId:s.originalArtistId,name:s.artistName}]:[];
 const seen=new Set();return raw.filter(a=>a?.name).map(a=>({id:a.id||a.artistId?String(a.id||a.artistId):null,originalId:a.originalId??a.originalArtistId??null,name:a.name,cover:a.coverImgUrl||a.picUrl||a.img1v1Url||null})).filter(a=>{const key=a.id||a.originalId||a.name;if(seen.has(key))return false;seen.add(key);return true;});
}
export function song(s){const artistList=artistRefs(s);return {id:s.id||s.songId,originalId:s.originalId,name:s.name||s.songName,artists:artistList.map(a=>a.name).join(' / ')||(typeof s.artists==='string'?s.artists:''),artistList,cover:s.album?.picUrl||s.album?.coverImgUrl||s.al?.picUrl||s.coverImgUrl||s.picUrl,duration:s.duration||s.dt,liked:s.liked,available:s.visible!==false&&s.playFlag!==false};}
export function playlist(p){return {...p,id:p.id||p.playlistId,cover:p.coverImgUrl||p.picUrl||p.cover};}
