// Read-only full pending evidence snapshot. Never touches customer tables or writes D1.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createD1Transport} from './d1-http-transport.mjs';
const require=createRequire(import.meta.url),{fingerprint}=require('./metricool-free-evidence.cjs');
const requestFile=process.env.PENDING_AUDIT_REQUEST;
if(!/^ops\/pending-audit-requests\/[A-Za-z0-9_-]+\.json$/.test(requestFile||''))
  throw Error('Requires one explicit read-only pending audit request');
const req=JSON.parse(fs.readFileSync(requestFile,'utf8'));
if(req.mode!=='read_only'||req.allowApproval!==false||req.allowD1Write!==false||req.allowPublication!==false)
  throw Error('Unsafe audit request');
const dbid=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
const sql=createD1Transport({token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID,databaseId:dbid});
async function rows(statement){
 const result=await sql(statement);
 if(!Array.isArray(result[0]?.results))throw Error('Incomplete D1 response');
 return result[0].results;
}
const [counts,posts,reviews,links,deliveries]=await Promise.all([
 rows('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status'),
 rows("SELECT * FROM social_posts WHERE status='pending_review' ORDER BY id"),
 rows("SELECT * FROM (SELECT post_id,id,decision,reviewed_at,content_fingerprint,image_url,image_sha256,evidence_json,ROW_NUMBER() OVER(PARTITION BY post_id ORDER BY reviewed_at DESC,id DESC) AS rank FROM social_post_quality_reviews) WHERE rank=1 ORDER BY post_id"),
 rows("SELECT post_id,COUNT(*) AS count FROM social_metricool_sync GROUP BY post_id"),
 rows("SELECT post_id,COUNT(*) AS count FROM social_publish_deliveries GROUP BY post_id")
]);
const counted=Number(counts.find(x=>x.status==='pending_review')?.count||0);
if(posts.length!==counted||new Set(posts.map(x=>x.id)).size!==counted||!Number.isSafeInteger(counted))
  throw Error('Incomplete or duplicated D1 pending inventory');
const reviewMap=new Map(reviews.map(x=>[x.post_id,x])),linkMap=new Map(links.map(x=>[x.post_id,Number(x.count)||0])),deliveryMap=new Map(deliveries.map(x=>[x.post_id,Number(x.count)||0]));
const checkNames=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
function state(v){const p=v&&typeof v==='object'?(v.result??v.status??v.decision):v;return p===true?'PASS':p===false?'FAIL':typeof p==='string'?p.toUpperCase():'MISSING'}
const entries=posts.map(p=>{
 const r=reviewMap.get(p.id);let e={};try{e=JSON.parse(r?.evidence_json||'{}')}catch{}
 const fp=fingerprint(p),bound=!!r&&r.content_fingerprint===fp&&r.image_url===p.image_url&&e.content_fingerprint===fp;
 const media=!!r&&/^[a-f0-9]{64}$/i.test(r.image_sha256||'')&&r.image_sha256===e.image_sha256;
 const checks=Object.fromEntries(checkNames.map(k=>[k,state(e.checks?.[k])]));
 const blockers=[];
 if(!r)blockers.push('missing_ai_review');
 if(r&&!bound)blockers.push('review_not_current_bound');
 if(!media)blockers.push('media_sha_evidence_missing');
 for(const [k,v] of Object.entries(checks))if(v!=='PASS')blockers.push(k+':'+v);
 if(!p.image_url||!p.image_alt)blockers.push('active_media_missing');
 if(linkMap.get(p.id))blockers.push('external_metricool_mapping_review');
 if(deliveryMap.get(p.id))blockers.push('external_delivery_receipt_review');
 if(p.approved_by||p.approved_at||p.scheduled_at||p.published_at)blockers.push('unexpected_release_metadata');
 if(String(p.copy||'').includes('正式包裝'))blockers.push('internal_public_wording');
 const pass16=checkNames.every(k=>checks[k]==='PASS')&&bound&&media;
 return {id:p.id,title:p.title,updatedAt:p.updated_at,decision:r?.decision||'NOT_REVIEWED',
  versionBound:bound,imageHashBound:media,checks,pass16,blockers,linked:!!linkMap.get(p.id),
  hasExternalDelivery:!!deliveryMap.get(p.id)};
});
const sum=(fn)=>entries.filter(fn).length;
const report={schema:'xjw-live-pending-evidence-readonly-v1',capturedAt:new Date().toISOString(),
 source:'Direct Cloudflare D1 current query, not a GitHub history cache',readOnly:true,
 counts:Object.fromEntries(counts.map(x=>[x.status,Number(x.count)])),
 pending:entries.length,fully16Passed:sum(x=>x.pass16),missingReview:sum(x=>x.decision==='NOT_REVIEWED'),
 latestReviewVersionMismatch:sum(x=>!x.versionBound),duplicateDeferred:sum(x=>x.checks.duplicate==='DEFER'),
 complianceDeferred:sum(x=>x.checks.compliance_final==='DEFER'),
 internalPublicWording:sum(x=>x.blockers.includes('internal_public_wording')),
 remoteMapped:sum(x=>x.linked),deliveryMapped:sum(x=>x.hasExternalDelivery),
 approvals:0,scheduled:0,published:0,records:entries};
fs.writeFileSync('/tmp/pending-live-audit.json',JSON.stringify(report,null,2)+'\n');
console.log('PENDING_LIVE_AUDIT',JSON.stringify({counts:report.counts,pending:report.pending,
  fully16Passed:report.fully16Passed,duplicateDeferred:report.duplicateDeferred,
  complianceDeferred:report.complianceDeferred,internalPublicWording:report.internalPublicWording}));
