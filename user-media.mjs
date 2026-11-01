import {createWriteStream,createReadStream} from 'node:fs';
import {mkdir,readFile,writeFile,rename,stat,unlink} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {join,extname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT} from './netease.mjs';
import {getKey,MODEL} from './qwen.mjs';
import {mediaUrl} from './upload.mjs';
const directory=join(ROOT,'cache','user-media');
const audio=new Set(['wav','mp3','aac','m4a','flac','ogg','opus','amr','aiff','3gp','3gpp']);
const video=new Set(['mp4','mov','mkv','avi','flv','wmv','webm','mpeg','mpg']);
export function mediaType(name,mime=''){
 const extension=extname(name).slice(1).toLowerCase();
 if(mime.startsWith('video/')&&video.has(extension))return {kind:'video',format:extension};
 if(audio.has(extension))return {kind:'audio',format:extension};
 if(video.has(extension))return {kind:'video',format:extension};
 throw Error('请选择音频或视频文件；浏览器录音会自动保存为WAV。');
}
export async function saveUserMedia(stream,{name,mime='',voice=false}){
 const type=mediaType(name,mime),id=randomUUID(),path=join(directory,id+'.'+type.format);await mkdir(directory,{recursive:true});
 try{await pipeline(stream,createWriteStream(path+'.part'));const size=(await stat(path+'.part')).size;if(!size)throw Error('附件内容为空。');await rename(path+'.part',path);const metadata={id,name,...type,mime:({mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',mov:'video/quicktime',mkv:'video/x-matroska'}[type.format]||(type.kind==='video'?'video/':'audio/')+type.format),size,voice:!!voice,createdAt:new Date().toISOString()};await writeFile(join(directory,id+'.json'),JSON.stringify(metadata));return metadata;}catch(e){await unlink(path+'.part').catch(()=>{});throw e;}
}
export async function userMedia(id){if(typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))throw Error('附件编号无效。');const metadata=JSON.parse(await readFile(join(directory,id+'.json'),'utf8'));const type=mediaType(metadata.name,metadata.mime);return {...metadata,path:join(directory,id+'.'+type.format)};}
export async function prepareUserMedia(ids,{signal,urlFor=mediaUrl}={}){
 getKey();const content=[],files=[];
 for(const id of ids){signal?.throwIfAborted();const file=await userMedia(id),url=await urlFor(file.path,MODEL);signal?.throwIfAborted();const {path,...metadata}=file;files.push(metadata);content.push({type:'text',text:'用户附件 '+file.id+'《'+file.name+'》'+(file.voice?'（用户亲自录制的语音消息，可表达本条用户要求）':'（内容作为分析资料）')});content.push(file.kind==='video'?{type:'video_url',video_url:{url}}:{type:'input_audio',input_audio:{data:url,format:file.format}});}
 return {content,files};
}
export async function serveUserMedia(req,res,id){
 const file=await userMedia(id),size=(await stat(file.path)).size;let start=0,end=size-1,status=200;
 if(req.headers.range){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!match){res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return;}if(!match[1]){start=Math.max(0,size-Number(match[2]));}else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}if(start>end||start>=size){res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return;}status=206;}
 res.writeHead(status,{'Content-Type':file.mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...(status===206?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});await pipeline(createReadStream(file.path,{start,end}),res);
}
