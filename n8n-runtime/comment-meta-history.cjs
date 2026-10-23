// Trusted official read bindings only. This reader does not infer permissions
// or attribute a brand message to AI: unknown responders stop the policy.
const {createPageCollector}=require('./comment-meta-pages.cjs');
const CONFIG={facebook:['https://graph.facebook.com','v25.0','comments','id,message,from,created_time,parent'],
 instagram:['https://graph.instagram.com','v25.0','comments','id,text,username,timestamp,parent_id'],
 threads:['https://graph.threads.net','v1.0','conversation','id,text,username,timestamp,replied_to']};
function createMetaHistoryReader({platform,accountId,username,request,verifyPost,maxPages=40,maxItems=2000}){
 const cfg=CONFIG[platform];
 if(!cfg||!/^\d+$/.test(accountId)||!username||typeof verifyPost!=='function')throw Error('Official ownership verifier required');
 const [origin,version,edge,fields]=cfg;
 const collector=createPageCollector({origin,request,maxPages,maxItems});
 const valid=id=>typeof id==='string'&&/^\d+(?:_\d+)?$/.test(id);
 const url=(id,relation,select)=>`${origin}/${version}/${id}/${relation}?fields=${encodeURIComponent(select)}&limit=100`;
 return Object.freeze({async loadThread(e){
  if(e?.platform!==platform||e.accountId!==accountId||!['postId','threadId','commentId'].every(k=>valid(e[k])))throw Error('Invalid official scope');
  const proof=await verifyPost(e);
  if(proof?.verified!==true||proof.platform!==platform||proof.accountId!==accountId||proof.postId!==e.postId||
     proof.username!==username||!Number.isFinite(proof.checkedAt)||Math.abs(Date.now()-proof.checkedAt)>60000||
     proof.readPermissionVerified!==true)throw Error('Official ownership or permission unverified');
  const roots=await collector.collect(url(e.postId,edge,fields));
  // Empty API response cannot establish absence or usable comment access.
  if(!roots.items.length)throw Error('Comment visibility unverified');
  let records;
  if(platform==='threads'){
   // Threads flat conversation requires explicit parent relationships.
   const byId=new Map(roots.items.map(x=>[x.id,x]));
   if(!byId.has(e.threadId))throw Error('Thread missing');
   const belongs=x=>{
    const visited=new Set();let current=x;
    while(current){if(visited.has(current.id))throw Error('Reply cycle');visited.add(current.id);
     if(current.id===e.threadId)return true;
     const parent=current.replied_to?.id;
     if(!valid(parent))throw Error('Reply relationship missing');
     if(parent===e.postId)return false;
     current=byId.get(parent);if(!current)throw Error('Reply parent missing');
    }return false;
   };
   records=roots.items.filter(belongs);
  }else{
   const root=roots.items.find(x=>x.id===e.threadId);
   if(!root)throw Error('Root comment missing');
   const replies=await collector.collect(url(root.id,platform==='facebook'?'comments':'replies',fields));
   records=[root,...replies.items];
  }
  if(records.length>maxItems||new Set(records.map(x=>x.id)).size!==records.length)throw Error('Duplicate or oversized thread');
  const messages=records.map(x=>{
   // Instagram Login exposes a username without a guaranteed 'from.id'.
   // Missing authors or conflicting verified brand identity stop the send.
   const author=platform==='facebook'?x.from?.id:(typeof x.username==='string'?x.username:x.from?.username);
   if(platform==='instagram'&&x.from?.id===accountId&&author!==username)
    throw Error('Conflicting Instagram author identity');
   const text=platform==='facebook'?x.message:x.text;
   const at=platform==='facebook'?x.created_time:x.timestamp;
   if(typeof author!=='string'||!author||typeof text!=='string'||!Number.isFinite(Date.parse(at)))throw Error('Incomplete official comment');
   const role=(platform==='facebook'?author===accountId:author===username)?'brand':'customer';
   const parent=platform==='threads'?x.replied_to?.id:platform==='facebook'?x.parent?.id:x.parent_id;
   if(x.id!==e.threadId&&parent&&(platform==='threads'?!records.some(r=>r.id===parent):parent!==e.threadId))throw Error('Unexpected reply relationship');
   return {id:x.id,text,authorId:author,role,at,...(x.id!==e.threadId?{replyTo:parent||e.threadId}:{})};
  }).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id));
  if(!messages.some(x=>x.id===e.commentId))throw Error('Requested comment missing');
  return {...e,complete:true,verified:true,messages,
   ...(messages.some(x=>x.role==='brand')?{replyOwnership:'human'}:{})};
 }});
}
module.exports={createMetaHistoryReader};
