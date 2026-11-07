import fs from 'node:fs';import crypto from 'node:crypto';import path from 'node:path';
const req=JSON.parse(fs.readFileSync('ops/request-recover-two-instagram-planner-mirrors-20261108.json','utf8'));
const historical=JSON.parse(fs.readFileSync('ops/metricool-instagram-threads-published-history-20261105.json','utf8')).records.instagram;
const planner=JSON.parse(fs.readFileSync('ops/metricool-planner-url-inventory-20261108.json','utf8')).records;
if(req.schema!=='xjw-two-ig-unreachable-media-planner-mirror-recovery-v1'||req.noPublication!==true||req.records?.length!==2||req.noStatusMutations!==true)throw Error('Unexpected source mirror request');
fs.mkdirSync('verified-two-historical-instagram-mirrors',{recursive:true});
const results=[];
for(const rec of req.records){
 let result={igPost:rec.originalIGPostId,metricoolId:rec.metricoolPlannerId,downloaded:false,verified:false};
 try{
  const ig=historical.find(x=>x.postId===rec.originalIGPostId),post=planner.find(x=>x.id===rec.metricoolPlannerId);
  if(!ig||ig.permalink!==rec.originalIGUrl||ig.content!==rec.originalIGCaption||ig.dateRaw!==rec.originalIGUtcTimestamp)throw Error('Current historical IG source caption/date changed');
  if(!post||post.draft!==false||!post.networkStatuses?.some(x=>x.network==='instagram'&&x.status==='PUBLISHED')||!post.media?.includes(rec.verifiedPublishedPlannerImage))throw Error('Published Metricool mirror not verified');
  const raw=rec.originalIGUtcTimestamp;
  if(!/^\d{14}$/.test(raw))throw Error('Invalid IG UTC timestamp');
  const actualUtc=raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8)+'T'+raw.slice(8,10)+':'+raw.slice(10,12)+':'+raw.slice(12,14)+'Z';
  const planned=post.date+'+08:00';
  const drift=Math.abs(Date.parse(actualUtc)-Date.parse(planned))/60000;
  if(!(drift<=4))throw Error('IG publish time too far from Metricool planned time, ambiguous mirror '+drift);
  if(!rec.verifiedPublishedPlannerImage.startsWith('https://static.metricool.com/planner/'))throw Error('Unexpected media domain/path');
  const resp=await fetch(rec.verifiedPublishedPlannerImage,{redirect:'follow',signal:AbortSignal.timeout(30000)});
  if(!resp.ok||!String(resp.headers.get('content-type')||'').toLowerCase().startsWith('image/'))throw Error('Mirror image not reachable');
  const rawImage=Buffer.from(await resp.arrayBuffer());
  if(rawImage.length<1000||rawImage.length>10000000)throw Error('Suspicious media byte size');
  const digest=crypto.createHash('sha256').update(rawImage).digest('hex');
  const file=rec.originalIGPostId+'.image';
  fs.writeFileSync(path.join('verified-two-historical-instagram-mirrors',file),rawImage);
  result={...result,downloaded:true,verified:true,captionExact:true,timeDriftMinutes:drift,sha256:digest,bytes:rawImage.length,sourceMediaUrl:rec.verifiedPublishedPlannerImage,publishedIGUrl:rec.originalIGUrl,artifact:file};
 }catch(e){result.error=String(e.message||e)}
 results.push(result);
}
const output={schema:req.schema,checkedAt:new Date().toISOString(),verificationScope:'Two previously inaccessible Instagram CDN image URLs mapped by exact published caption, timing and the same published Metricool planner record',results,verified:results.filter(x=>x.verified).length,blocked:results.filter(x=>!x.verified).length,oldHistorical15NotIdentified:true,noD1Writes:true,noNewApprovals:true,noMetricoolWrites:true,noPublications:true};
fs.writeFileSync('verified-two-historical-instagram-mirrors/verification-report.json',JSON.stringify(output,null,2)+'\n');
console.log('TWO_INSTAGRAM_MEDIA_MIRROR_VERIFICATION',JSON.stringify({verified:output.verified,blocked:output.blocked,items:results.map(x=>({igPost:x.igPost,metricoolId:x.metricoolId,sha256:x.sha256,bytes:x.bytes,timeDriftMinutes:x.timeDriftMinutes,error:x.error})),noWrites:true}));
