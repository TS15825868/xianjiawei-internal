import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const req=JSON.parse(fs.readFileSync('ops/request-three-public-historical-media-recovery-20261108.json','utf8'));
if(req.schema!=='xjw-three-public-historical-post-media-recovery-20261108-v1'||req.noD1Writes!==true||req.noGitHubMediaOverwrite!==true||req.noApproval!==true||req.noPublication!==true||req.targets?.length!==3)throw Error('Unsafe request');
const outDir='historical-media-public-recovery-20261108';fs.mkdirSync(outDir,{recursive:true});
const decode=s=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&#x27;/gi,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
function getMeta(html,key){
 for(const tag of String(html).match(/<meta\s+[^>]*>/gi)||[]){
  const attrs={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g))attrs[m[1].toLowerCase()]=decode(m[3]??m[4]);
  if(attrs.property===key||attrs.name===key)return attrs.content||'';
 }
 return '';
}
function allowedImage(link){
 try{const u=new URL(link);
  return u.protocol==='https:'&&(/(^|\.)fbcdn\.net$|(^|\.)fbcdn\.com$|(^|\.)cdninstagram\.com$|^static\.xx\.fbcdn\.net$/).test(u.hostname.toLowerCase());
 }catch{return false}
}
const results=[];
for(const t of req.targets){
 const result={platform:t.platform,postId:t.postId,permalink:t.url,sourceReachable:false,sourceImageVerified:false,samePublishedPostConfirmed:false,reason:null};
 try{
  const u=new URL(t.url),expected=t.platform==='instagram'?'www.instagram.com':'www.facebook.com';
  if(u.hostname!==expected)throw Error('Unapproved public source');
  const r=await fetch(u,{headers:{'accept':'text/html,application/xhtml+xml','user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'},redirect:'follow',signal:AbortSignal.timeout(22000)});
  result.httpStatus=r.status;result.finalUrl=r.url;
  if(!r.ok)throw Error('Post HTTP '+r.status);
  if(!String(r.headers.get('content-type')||'').includes('text/html'))throw Error('Source not HTML');
  const html=(await r.text()).slice(0,3000000);
  result.sourceReachable=true;
  result.pageTitle=getMeta(html,'og:title').slice(0,250)||null;
  const imageUrl=getMeta(html,'og:image')||getMeta(html,'twitter:image');
  result.hasSourceImageMeta=Boolean(imageUrl);
  const final=new URL(r.url);
  if(final.hostname!==expected||!final.pathname.includes(t.platform==='instagram'?u.pathname:'/posts/')){
   throw Error('Source redirected away from original post permalink; do not treat as verified');
  }
  if(!allowedImage(imageUrl))throw Error('No approved original CDN image address found');
  const imageResponse=await fetch(imageUrl,{redirect:'follow',signal:AbortSignal.timeout(22000)});
  result.imageHttpStatus=imageResponse.status;
  if(!imageResponse.ok||!String(imageResponse.headers.get('content-type')||'').toLowerCase().startsWith('image/'))throw Error('Source media unavailable');
  const finalImage=new URL(imageResponse.url);
  if(!allowedImage(imageResponse.url))throw Error('Image redirected to untrusted host');
  const bytes=Buffer.from(await imageResponse.arrayBuffer());
  if(bytes.length<1000||bytes.length>12000000)throw Error('Unexpected media byte count');
  const ext=(imageResponse.headers.get('content-type')||'').toLowerCase().includes('png')?'.png':'.jpg';
  const file=path.join(outDir,t.platform+'-'+t.postId.replace(/[^a-zA-Z0-9_-]/g,'-')+ext);
  fs.writeFileSync(file,bytes);
  Object.assign(result,{sourceImageVerified:true,samePublishedPostConfirmed:true,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,mediaSource:urlMasked(imageUrl),artifact:file});
 }catch(e){result.reason=String(e.message||e).slice(0,240)}
 results.push(result);
}
function urlMasked(s){try{const u=new URL(s);return u.origin+u.pathname}catch{return null}}
const report={schema:req.schema,checkedAt:new Date().toISOString(),source:'public permalink metadata, no login and no third-party image substitution',results,
 verified:results.filter(x=>x.sourceImageVerified).length,unverified:results.filter(x=>!x.sourceImageVerified).length,previouslyRecoveredTwoExcluded:true,
 historic15PrivateCacheIdentityUnknown:true,fullCrossPlatformDedupCertified:false,aiApprovals:0,humanApprovals:0,d1Mutations:0,metricoolMutations:0,publications:0};
fs.writeFileSync(path.join(outDir,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log('PUBLIC_MEDIA_RECOVERY',JSON.stringify({verified:report.verified,unverified:report.unverified,results:results.map(x=>({id:x.postId,httpStatus:x.httpStatus,sourceReachable:x.sourceReachable,mediaVerified:x.sourceImageVerified,reason:x.reason,sha256:x.sha256})),noWrites:true}));
