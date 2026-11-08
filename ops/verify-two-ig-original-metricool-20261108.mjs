import fs from 'node:fs';import crypto from 'node:crypto';import path from 'node:path';
const cfg=JSON.parse(fs.readFileSync('ops/request-two-ig-original-metricool-20261108.json','utf8'));const historical=JSON.parse(fs.readFileSync('ops/metricool-instagram-threads-published-history-20261105.json','utf8')).records.instagram;
if(cfg.scope!=='xjw-two-ig-metricool-original-20261108'||cfg.items?.length!==2||cfg.allowD1Writes!==false||cfg.allowPublish!==false||cfg.allowApprovals!==false)throw Error('unsafe request');
const dir='two-ig-historical-originals';fs.mkdirSync(dir,{recursive:true});const results=[];
for(const x of cfg.items){const res={id:x.postId,verified:false};try{
const old=historical.find(o=>o.postId===x.postId);
if(!old||old.dateRaw!==x.originalTimestamp||old.permalink!==x.permalink||x.mediaType!=='FEED_IMAGE')throw Error('source identity mismatch');
if(!/^https:\/\/scontent-[a-z0-9-]+\.cdninstagram\.com\/v\//i.test(x.imageUrl))throw Error('unexpected media host');
const r=await fetch(x.imageUrl,{redirect:'follow',signal:AbortSignal.timeout(35000)});res.http=r.status;
if(!r.ok||!String(r.headers.get('content-type')).toLowerCase().startsWith('image/')||!/^https:\/\/scontent-[a-z0-9-]+\.cdninstagram\.com\/v\//i.test(r.url))throw Error('official image not accessible');
const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length<1000||bytes.length>12000000||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw Error('invalid JPEG bytes');
const file=path.join(dir,x.postId+'.jpg');fs.writeFileSync(file,bytes);
Object.assign(res,{verified:true,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,file});
}catch(e){res.reason=String(e.message||e).slice(0,150)}results.push(res)}
const report={scope:cfg.scope,at:new Date().toISOString(),results,verified:results.filter(x=>x.verified).length,unverified:results.filter(x=>!x.verified).length,notProvenFullHistory:true,unmapped15CacheUnchanged:true,approvals:0,publishes:0,d1Writes:0};fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log('METRICOOL_IG_SOURCE',JSON.stringify({verified:report.verified,unverified:report.unverified,results:results.map(x=>({id:x.id,http:x.http,sha256:x.sha256,bytes:x.bytes,reason:x.reason}))}));
