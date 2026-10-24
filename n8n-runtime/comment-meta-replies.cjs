// Official public-reply transport. request is a protected, authenticated HTTP
// binding: no automatic retries, redirects or raw API-error logging permitted.
// Complete paginated history and granted-scope evidence remain required inputs.
const {createHash}=require('node:crypto');
const {scoped,decide}=require('./comment-policy.cjs');
const SETTINGS={
 facebook:{origin:'https://graph.facebook.com',version:'v25.0',scopes:['pages_read_engagement','pages_read_user_content','pages_manage_engagement']},
 instagram:{origin:'https://graph.instagram.com',version:'v25.0',scopes:['instagram_business_basic','instagram_business_manage_comments']},
 threads:{origin:'https://graph.threads.net',version:'v1.0',scopes:['threads_basic','threads_read_replies','threads_manage_replies','threads_content_publish']}
};
function createMetaReplyAdapter({platform,accountId,request,loadThread,permissionEvidence,catalog}){
 const config=SETTINGS[platform];
 if(!config||!/^\d+$/.test(accountId)||[request,loadThread,permissionEvidence].some(f=>typeof f!=='function'))throw Error('Protected Meta bindings required');
 const call=async(method,path,body)=>{
  // This timeout does not authorize retries; late POST outcomes stay unknown.
  const controller=new AbortController();let timer;
  let result;
  try{result=await Promise.race([
   request({method,url:`${config.origin}/${config.version}/${path}`,body,
    timeoutMs:15000,retries:0,followRedirects:false,signal:controller.signal}),
   new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('API timeout'));},15000);})
  ]);}finally{clearTimeout(timer);}
  // Protected HTTP bindings can return parsed JSON alongside a numeric HTTP
  // status or fetch-style ok flag. An error response carrying an `id` must
  // never become a successful identity check or public reply receipt.
  if(!result||typeof result!=='object'||result.error||result.ok===false||
     [result.status,result.statusCode].some(status=>status!==undefined&&
       (!Number.isInteger(status)||status<200||status>=300)))
   throw Error('Official API rejected request');
  return result;
 };
 const match=e=>e?.platform===platform&&e.accountId===accountId&&/^\d+(?:_\d+)?$/.test(e.commentId);
 return Object.freeze({loadThread,
  async authorize(e){
   if(!match(e))return false;
   const identity=await call('GET',platform==='instagram'?'me?fields=user_id,username':'me?fields=id');
   if(String(platform==='instagram'?identity?.user_id:identity?.id)!==accountId)return false;
   const evidence=await permissionEvidence();
   return evidence?.accountId===accountId&&evidence.platform===platform&&evidence.verified===true&&
    Number.isFinite(evidence.checkedAt)&&Math.abs(Date.now()-evidence.checkedAt)<60000&&
    Number.isFinite(evidence.expiresAt)&&evidence.expiresAt>Date.now()+60000&&
    Array.isArray(evidence.scopes)&&config.scopes.every(s=>evidence.scopes.includes(s));
  },
  async sendReply(e,reply,version){
   if(!match(e)||typeof reply!=='string'||!reply.trim()||reply.length>500)throw Error('Invalid reply scope');
   if(platform!=='threads')return call('POST',`${e.commentId}/${platform==='instagram'?'replies':'comments'}`,{message:reply});
   // An invalid or missing conversation fingerprint must not create even an
   // unpublished Threads reply container. The final official history read
   // still runs immediately before publishing any valid container.
   if(typeof version!=='string'||!/^[0-9a-f]{64}$/.test(version))
    throw Error('Unverified conversation version');
   const container=await call('POST',`${accountId}/threads`,{media_type:'TEXT',text:reply,reply_to_id:e.commentId});
   if(typeof container?.id!=='string'||!/^\d+$/.test(container.id))throw Error('Container unconfirmed');
   // A container ID is never a published reply receipt. Recheck before publish.
   const thread=await loadThread(e);
   const hash=createHash('sha256').update(JSON.stringify(thread?.messages)).digest('hex');
   if(!scoped(thread,e)||hash!==version||decide(e,thread,catalog).reply!==reply)throw Error('Conversation changed');
   return call('POST',`${accountId}/threads_publish`,{creation_id:container.id});
  }
 });
}
module.exports={createMetaReplyAdapter};
