let pendingUserMedia=[],mediaRecording=null,mediaRecordingStream=null,mediaPreparing=false,mediaInputGeneration=0;
function drawPendingMedia(){
 const list=$('#pending-media');list.innerHTML='';for(const item of pendingUserMedia){const row=document.createElement('div');row.className='pending-media-item';const label=document.createElement('span');label.textContent=item.file.name+' · '+({uploading:'正在保存…',ready:'待发送',error:item.error||'上传失败'})[item.state];row.append(label);if(item.state==='ready'){const preview=document.createElement(item.kind==='video'?'video':'audio');preview.controls=true;preview.preload='none';preview.src=item.preview;row.append(preview);}const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.title='移除附件';remove.onclick=()=>{item.controller.abort();URL.revokeObjectURL(item.preview);pendingUserMedia=pendingUserMedia.filter(x=>x!==item);drawPendingMedia();};row.append(remove);list.append(row);}updateComposer();
}
window.mediaIsPreparing=()=>mediaPreparing;
window.mediaUploadPending=()=>mediaPreparing||!!mediaRecording||pendingUserMedia.some(x=>x.state==='uploading');
window.pendingMediaIds=()=>pendingUserMedia.filter(x=>x.state==='ready').map(x=>x.id);
window.pendingMediaAreVoice=()=>pendingUserMedia.some(x=>x.voice);
window.consumePendingMedia=ids=>{for(const item of pendingUserMedia.filter(x=>ids.includes(x.id)))URL.revokeObjectURL(item.preview);pendingUserMedia=pendingUserMedia.filter(x=>!ids.includes(x.id));drawPendingMedia();};
window.clearPendingMedia=()=>{mediaInputGeneration++;for(const item of pendingUserMedia){item.controller.abort();URL.revokeObjectURL(item.preview);}pendingUserMedia=[];if(mediaRecording){mediaRecording.discard=true;mediaRecording.stop();}drawPendingMedia();};
async function addUserMedia(file,voice=false){
 if(!file||!(/^(audio|video)\//.test(file.type)||/\.(wav|mp3|aac|m4a|flac|ogg|opus|amr|aiff|3gp|3gpp|mp4|mov|mkv|avi|flv|wmv|webm|mpeg|mpg)$/i.test(file.name)))return notice('请选择音频或视频文件。');
 const item={file,voice,state:'uploading',preview:URL.createObjectURL(file),controller:new AbortController()};pendingUserMedia.push(item);drawPendingMedia();
 try{const response=await fetch('/api/media?name='+encodeURIComponent(file.name)+(voice?'&voice=1':''),{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file,signal:item.controller.signal});const data=await response.json();if(!response.ok)throw Error(data.error||'附件保存失败');Object.assign(item,data,{state:'ready'});}catch(e){if(e.name!=='AbortError'){item.state='error';item.error=e.message;}}drawPendingMedia();
}
$('#attach-media').onclick=()=>$('#media-file').click();$('#media-file').onchange=e=>{for(const file of e.target.files)addUserMedia(file);e.target.value='';};
$('#message').addEventListener('paste',e=>{const files=[...(e.clipboardData?.files||[])].filter(f=>/^(audio|video)\//.test(f.type));if(files.length){e.preventDefault();for(const f of files)addUserMedia(f);}});
$('#message').addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
$('#message').addEventListener('drop',e=>{if(e.dataTransfer?.files.length){e.preventDefault();for(const f of e.dataTransfer.files)addUserMedia(f);}});
async function recordingWav(blob){
 const context=new AudioContext();try{const decoded=await context.decodeAudioData(await blob.arrayBuffer()),channels=decoded.numberOfChannels,length=decoded.length,buffer=new ArrayBuffer(44+length*channels*2),view=new DataView(buffer);const text=(at,s)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};text(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,decoded.sampleRate,true);view.setUint32(28,decoded.sampleRate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,length*channels*2,true);const data=Array.from({length:channels},(_,c)=>decoded.getChannelData(c));let at=44;for(let i=0;i<length;i++)for(let c=0;c<channels;c++){const sample=Math.max(-1,Math.min(1,data[c][i]));view.setInt16(at,sample<0?sample*32768:sample*32767,true);at+=2;}return new Blob([buffer],{type:'audio/wav'});}finally{await context.close();}
}
$('#record-voice').onclick=async()=>{
 if(mediaRecording){mediaRecording.stop();return;}if(mediaPreparing)return;const generation=mediaInputGeneration;mediaPreparing=true;updateComposer();
 try{
  mediaRecordingStream=await navigator.mediaDevices.getUserMedia({audio:true});if(generation!==mediaInputGeneration){mediaRecordingStream.getTracks().forEach(t=>t.stop());mediaRecordingStream=null;mediaPreparing=false;updateComposer();return;}mediaPreparing=false;const chunks=[],recorder=new MediaRecorder(mediaRecordingStream);mediaRecording=recorder;$('#record-voice').textContent='■ 停止录音';$('#record-voice').setAttribute('aria-pressed','true');
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=async()=>{mediaRecording=null;mediaRecordingStream?.getTracks().forEach(t=>t.stop());mediaRecordingStream=null;$('#record-voice').textContent='🎙 语音';$('#record-voice').setAttribute('aria-pressed','false');if(recorder.discard){drawPendingMedia();return;}mediaPreparing=true;updateComposer();try{const wav=await recordingWav(new Blob(chunks,{type:recorder.mimeType}));if(generation!==mediaInputGeneration)return;await addUserMedia(new File([wav],'语音-'+new Date().toISOString().replaceAll(':','-')+'.wav',{type:'audio/wav'}),true);}catch(e){notice('录音处理失败：'+e.message);}finally{mediaPreparing=false;updateComposer();}};
  recorder.start();updateComposer();
 }catch(e){mediaRecordingStream?.getTracks().forEach(t=>t.stop());mediaRecordingStream=null;mediaRecording=null;mediaPreparing=false;updateComposer();notice('无法使用麦克风：'+e.message);}
};
window.addEventListener('pagehide',()=>{if(mediaRecording)mediaRecording.discard=true;mediaRecordingStream?.getTracks().forEach(t=>t.stop());for(const item of pendingUserMedia){item.controller.abort();URL.revokeObjectURL(item.preview);}});
