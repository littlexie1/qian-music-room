import {api} from '../netease.mjs';
import {chatServices} from '../chat-agent.mjs';
import {prepareUserMedia} from '../user-media.mjs';
process.env.DASHSCOPE_API_KEY='synthetic-test-key';
api.profile=async()=>({data:{nickname:'附件隔离测试'}});api.daily=async()=>({data:[]});
chatServices.readMemory=async()=>({preferences:[]});
chatServices.prepareUserMedia=async(ids,opts)=>prepareUserMedia(ids,{...opts,urlFor:async()=> 'oss://test/media'});
chatServices.completion=async messages=>{const parts=messages.filter(m=>Array.isArray(m.content)).flatMap(m=>m.content),audio=parts.some(p=>p.type==='input_audio'),video=parts.some(p=>p.type==='video_url');const content='已原生收到'+(audio?'音频':'')+(video?'视频':'');return {message:{role:'assistant',content},content,calls:[]};};
await import('../server.mjs');
