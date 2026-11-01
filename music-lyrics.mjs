function value(input){return typeof input==='string'?input:typeof input?.lyric==='string'?input.lyric:'';}
export function parseLrc(input){
 const raw=value(input),rows=[];
 for(const line of raw.split(/\r?\n/)){
  const stamps=[...line.matchAll(/\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
  const text=line.replace(/\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/g,'').trim();
  for(const stamp of stamps){if(Number(stamp[2])>=60)continue;const time=Number(stamp[1])*60+Number(stamp[2])+Number((stamp[3]||'').padEnd(3,'0'))/1000;rows.push({time,text});}
 }
 if(rows.length){
  rows.sort((a,b)=>a.time-b.time);const groups=[];
  for(const row of rows){const last=groups.at(-1);if(last&&Math.round(last.time*1000)===Math.round(row.time*1000)){if(row.text&&!last.text.split('\n').includes(row.text))last.text=[last.text,row.text].filter(Boolean).join('\n');}else groups.push({...row});}
  return {timed:true,lines:groups};
 }
 return {timed:false,lines:raw.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!/^\[[a-z]+:.*\]$/i.test(s)).map(text=>({time:null,text}))};
}
export function normalizeLyrics(data={}){
 data??={};const main=parseLrc(value(data.lyric)||value(data.lrc)||value(data.txtLyric));
 const translations=parseLrc(value(data.transLyric)||value(data.tlyric));
 const lines=main.lines.map(row=>{const translated=main.timed&&translations.timed?translations.lines.find(t=>Math.abs(t.time-row.time)<0.15):null;return {...row,translation:translated?.text&&translated.text!==row.text?translated.text:''};});
 return {timed:main.timed,lines,pureMusic:data.pureMusic===true||data.pureMusic===1,empty:!lines.some(l=>l.text)};
}
