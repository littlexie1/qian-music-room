import {api} from './netease.mjs';
export function normalizeComments(data,{offset=0,limit=20}={}){
 const list=data?.records||data?.comments||[];const total=Number(data?.recordCount??data?.total??0);
 const comments=list.map(c=>({id:c.id||c.commentId,content:String(c.content||''),author:c.creator?.nickname||c.creatorNickName||c.nickName||c.user?.nickname||'网易云用户',avatar:c.creator?.avatarUrl||c.user?.avatarUrl||'',time:c.time||c.timeStr||null,likedCount:Number(c.likedCount||0),replyCount:Number(c.replyCount||0)}));
 return {comments,total,cursor:data?.cursor||'',more:typeof data?.page?.more==='boolean'?data.page.more:(total?offset+comments.length<total:comments.length===limit)};
}
export async function loadComments(id,type='song',offset=0,cursor=''){
 if(!['song','playlist'].includes(type))throw Error('不支持的评论类型');
 if(!id||!Number.isSafeInteger(offset)||offset<0)throw Error('评论查询参数无效');
 const result=await api.comments(id,type,offset,cursor);return normalizeComments(result.data,{offset});
}
