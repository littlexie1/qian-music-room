import {modelBaseUrl} from './settings.mjs';
export const getBaseUrl=modelBaseUrl;
export const MODEL=process.env.DASHSCOPE_MODEL||'qwen3.8-omni-flash';
export function getKey(){const key=process.env.DASHSCOPE_API_KEY?.trim();if(!key)throw Error('请在 .env 配置 DASHSCOPE_API_KEY。');return key;}
export async function completion(messages,{tools,signal,onText=()=>{}}={}){
 const response=await fetch(modelBaseUrl()+'/chat/completions',{method:'POST',signal,headers:{Authorization:'Bearer '+getKey(),'Content-Type':'application/json','X-DashScope-OssResourceResolve':'enable'},body:JSON.stringify({model:MODEL,messages,...(tools?{tools}:{}),modalities:['text'],stream:true,stream_options:{include_usage:true},enable_thinking:false})});
 if(!response.ok){const text=await response.text();throw Error('Qwen HTTP '+response.status+': '+text.slice(0,700));}
 let buffer='',content='',calls=[],usage;const decoder=new TextDecoder();
 for await(const bytes of response.body){buffer+=decoder.decode(bytes,{stream:true});let cut;while((cut=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,cut).trim();buffer=buffer.slice(cut+1);if(!line.startsWith('data: ')||line==='data: [DONE]')continue;const chunk=JSON.parse(line.slice(6));if(chunk.error)throw Error(chunk.error.message||'模型返回错误');usage=chunk.usage||usage;const d=chunk.choices?.[0]?.delta;if(d?.content){content+=d.content;onText(d.content);}for(const t of d?.tool_calls||[]){const c=calls[t.index]??={id:t.id,type:'function',function:{name:'',arguments:''}};if(t.id)c.id=t.id;c.function.name+=t.function?.name||'';c.function.arguments+=t.function?.arguments||'';}}}
 return {message:{role:'assistant',content:content||null,...(calls.length?{tool_calls:calls}:{})},calls,content,usage};
}
