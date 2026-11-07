// Historical Metricool media provenance only. HEAD/1-byte URL validity, no draft changes, no image re-download.
import fs from 'node:fs';
const req=JSON.parse(fs.readFileSync('ops/request-metricool-planner-url-gap-check-20261108.json','utf8'));
const inventory=JSON.parse(fs.readFileSync('ops/metricool-planner-url-inventory-20261108.json','utf8'));
const baseline=JSON.parse(fs.readFileSync('ops/historical-media-source-link-gaps-20261108.json','utf8'));
if(req.scope!=='check-only-60-planner-historical-media-URLs'||req.noRemoteMutation!==true||req.downloadMedia!==false||req.requireD1Writes!==false)throw Error('Unsafe request');
if(inventory.counts.unique!==72||inventory.counts.drafts!==41||inventory.counts.currentlyUnpublishedScheduled!==0||inventory.counts.historicalErrorRecords!==3)throw Error('Planner inventory metadata changed');
const grouped=new Map();
for(const post of inventory.records){
 for(const url of post.media||[]){
  if(!/^https:\/\/static\.metricool\.com\/planner\//.test(url))continue;
  if(!grouped.has(url))grouped.set(url,{url,recordIds:[],statuses:[],anyDraft:false});
  const item=grouped.get(url);
  if(!item.recordIds.includes(post.id))item.recordIds.push(post.id);
  item.anyDraft||=post.draft===true;
  const role=post.draft?'draft':post.networkStatuses.every(x=>x.status==='PUBLISHED')?'published':'historical_error';
  if(!item.statuses.includes(role))item.statuses.push(role);
 }
}
const sources=[...grouped.values()];
if(sources.length<40||sources.length>80)throw Error('Unexpected count of unique safe planner URLs');
async function inspect(target){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9500);
 let status=null,method='HEAD',ok=false,reason='';
 try{
  const res=await fetch(target.url,{method:'HEAD',redirect:'follow',signal:ctrl.signal});
  status=res.status;
  ok=res.ok&&String(res.headers.get('content-type')||'').startsWith('image/');
  if([403,405,406].includes(status)){
   const c=new AbortController(),t=setTimeout(()=>c.abort(),8500);
   try{
    const b=await fetch(target.url,{method:'GET',headers:{Range:'bytes=0-0'},redirect:'follow',signal:c.signal});
    status=b.status;method='GET_RANGE_0_0';ok=[200,206].includes(status)&&String(b.headers.get('content-type')||'').startsWith('image/');
    await b.body?.cancel?.();
   }catch(error){reason=String(error.message||error).slice(0,140)}finally{clearTimeout(t)}
  }
 }catch(error){reason=String(error.message||error).slice(0,140)}
 finally{clearTimeout(timer)}
 return {...target,status,method,reachable:ok,reason};
}
const rows=new Array(sources.length);let idx=0;
async function worker(){while(idx<sources.length){const i=idx++;rows[i]=await inspect(sources[i]);}}
await Promise.all(Array.from({length:Math.min(5,sources.length)},()=>worker()));
const groups={draft:{reachable:0,unreachable:0},published:{reachable:0,unreachable:0},historical_error:{reachable:0,unreachable:0}};
for(const x of rows)for(const k of x.statuses){const g=groups[k];if(g)g[x.reachable?'reachable':'unreachable']++}
const results={schema:'xjw-metricool-planner-media-60-head-only-gap-audit-v1',sourceScope:'All 72 Metricool planner records 2026-01 to 2027-03, 41 held drafts/28 historical published/3 historical errors',checkedAt:new Date().toISOString(),sourceRecordCount:inventory.records.length,urlsChecked:rows.length,urlsReachable:rows.filter(x=>x.reachable).length,urlsUnreachable:rows.filter(x=>!x.reachable).length,groups,previousPublicSourceCheck:baseline.knownSourceCheck,notIdenticalToOld15:true,missing:rows.filter(x=>!x.reachable),results:rows,limit:'Link reachability does not validate pixel uniqueness. This is a source-provenance crosswalk for unavailable historical media. URLs can expire; historical planner error is not a live schedule.',noRemoteMutation:true,noD1Writes:true,approvals:0,scheduled:0,published:0};
fs.writeFileSync('planner-historical-url-gap-results.json',JSON.stringify(results,null,2)+'\n');
console.log('METRICOOL_MEDIA_URL_GAPS',JSON.stringify({urlsChecked:results.urlsChecked,urlsReachable:results.urlsReachable,urlsUnreachable:results.urlsUnreachable,groups,missing:results.missing.map(x=>({id:x.recordIds[0],status:x.status,type:x.statuses,method:x.method})),sourceScope:results.sourceScope,noWrites:true}));
