import {writeFile} from 'node:fs/promises';
import {api} from '../netease.mjs';
import {chatServices} from '../chat-agent.mjs';
const song=id=>({id,name:'Test '+id,artists:[],duration:180000,visible:true,playFlag:true});
api.playHistory=async()=>({data:[{id:'s1',name:'网易云历史测试',artistName:'测试艺人'}]});
api.profile=async()=>({data:{nickname:'隔离播放器测试'}});api.daily=async()=>({data:['s1','s2','s3'].map(song)});api.song=async id=>({data:song(id)});
chatServices.readMemory=async()=>({preferences:[],listening:{s1:{id:'s1',name:'试听笔记测试',impression:'<script>window.BAD=1</script>',selected:true,at:new Date().toISOString()}}});
chatServices.completion=async messages=>{
 const last=messages.at(-1);
 if(last.role==='user'){
  const request=JSON.parse(last.content),call={id:'call-'+crypto.randomUUID(),type:'function',function:{name:request.tool,arguments:JSON.stringify(request.args||{})}};
  return {message:{role:'assistant',content:null,tool_calls:[call]},calls:[call],content:''};
 }
 const text='播放器已回传实际执行结果。';return {message:{role:'assistant',content:text},calls:[],content:text};
};
await writeFile(process.env.MUSIC_STATE_DIR+'/music-memory.json',JSON.stringify(await chatServices.readMemory()));
await import('../server.mjs');
