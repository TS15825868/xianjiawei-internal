// Read-only calendar runway audit. Candidate time != authorization != actual publication.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createD1Transport} from '../tools/d1-http-transport.mjs';
export const REQUIRED_CHANNELS=['facebook','instagram','threads'];
const HOUR=3600000, DAY=24*HOUR, TAIPEI=8*HOUR;
const clean=v=>String(v??'').trim();
const sha=v=>createHash('sha256').update(v).digest('hex');
export function postFingerprint(p){
 return sha(JSON.stringify({title:clean(p.title),headline:clean(p.headline),copy:clean(p.copy),category:clean(p.category),image_url:clean(p.image_url),image_alt:clean(p.image_alt),image_source:clean(p.image_source),image_width:Number(p.image_width||0),image_height:Number(p.image_height||0),image_quality_status:clean(p.image_quality_status)}));
}
export function requiredSlots(now=Date.now()){
 if(!Number.isFinite(now))throw Error('Invalid audit time');
 const localMidnight=Math.floor((now+TAIPEI)/DAY)*DAY-TAIPEI;
 const slots=[];
 for(let i=-3;i<=14;i++){
  const day=localMidnight+i*DAY,weekday=new Date(day+TAIPEI).getUTCDay(),at=day+10*HOUR;
  if([2,5].includes(weekday)&&at>=now-72*HOUR&&at<=now+14*DAY)slots.push(at);
 }
 return slots;
}
const checks=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
export function inspectSlot(at,posts,now=Date.now()){
 const candidates=posts.filter(p=>[p.proposed_scheduled_at,p.scheduled_at].some(t=>Date.parse(t)===at));
 const timing=at<now?'missed':at<=now+72*HOUR?'urgent':'future';
 if(candidates.length!==1)return {at:new Date(at+TAIPEI).toISOString().replace('Z','+08:00'),timing,state:candidates.length?'SLOT_COLLISION':'NO_CANDIDATE',candidateIds:candidates.map(p=>p.id),blockers:[candidates.length?'MULTIPLE_CANDIDATES':'NO_CURRENT_D1_CANDIDATE']};
 const p=candidates[0],fp=postFingerprint(p),proof=p.review_fingerprint===fp&&/^[a-f0-9]{64}$/.test(p.image_sha||'');
 let evidence={};try{evidence=JSON.parse(p.evidence_json||'{}')}catch{}
 const passes=checks.filter(k=>evidence.checks?.[k]?.result==='PASS').length;
 const receipts=new Set((p.deliveries||[]).filter(d=>d.status==='published'&&d.remote_id&&d.published_at).map(d=>String(d.platform).toLowerCase()));
 const allReceipts=REQUIRED_CHANNELS.every(x=>receipts.has(x));
 const blockers=[];
 if(p.status==='published'&&allReceipts&&p.published_at)return {at:new Date(at+TAIPEI).toISOString().replace('Z','+08:00'),timing,state:'D1_THREE_PLATFORM_RECEIPTS_RECORDED',id:p.id,title:p.title,receiptCount:3,blockers};
 if(receipts.size||p.status==='published'||p.published_at)blockers.push('RECONCILE_EXISTING_PUBLICATION_DO_NOT_RESEND');
 if(!proof)blockers.push('REVIEW_VERSION_OR_IMAGE_SHA_UNVERIFIED');
 if(p.review_decision!=='AI_APPROVED'||passes!==16)blockers.push('COMPLETE_AI_EVIDENCE_MISSING');
 if(evidence.checks?.duplicate?.result!=='PASS')blockers.push('HISTORICAL_DEDUP_NOT_COMPLETE');
 if(!p.grant_id||p.grant_revoked_at||Date.parse(p.grant_expires_at)<at||p.grant_fingerprint!==fp||p.grant_review_id!==p.review_id||Date.parse(p.grant_publication_at)!==at)blockers.push('CURRENT_DELEGATION_NOT_VERIFIED');
 if(p.status!=='scheduled'||Date.parse(p.scheduled_at)!==at)blockers.push('NO_FORMAL_LOCAL_SCHEDULE');
 if(p.metricool_id||p.metricool_uuid)blockers.push('EXISTING_REMOTE_MAPPING_REQUIRES_LIVE_READBACK');
 else blockers.push('NO_REMOTE_SCHEDULE_RECEIPT');
 if(p.exact_copy_or_url_count||p.exact_image_sha_count)blockers.push('EXACT_DUPLICATE_FOUND');
 return {at:new Date(at+TAIPEI).toISOString().replace('Z','+08:00'),timing,state:timing==='missed'?'MISSED_OR_UNVERIFIED':timing==='urgent'?'URGENT_NOT_VERIFIED':'FUTURE_NOT_VERIFIED',id:p.id,title:p.title,status:p.status,reviewId:p.review_id,reviewDecision:p.review_decision,passes,duplicate:evidence.checks?.duplicate?.result||'MISSING',currentVersion:proof,imageSha:p.image_sha||null,liveImageVerified:p.liveImageVerified===true,receiptCount:receipts.size,blockers};
}
export async function runAudit({execute,now=Date.now(),transport=fetch}){
 const read=async sql=>(await execute(sql)).flatMap(x=>x.results||[]);
 const rows=await read(`SELECT p.id,p.title,p.headline,p.copy,p.category,p.status,p.proposed_scheduled_at,p.scheduled_at,p.published_at,p.image_url,p.image_alt,p.image_source,p.image_width,p.image_height,p.image_quality_status,
 r.id AS review_id,r.decision AS review_decision,r.content_fingerprint AS review_fingerprint,r.image_sha256 AS image_sha,r.evidence_json,
 g.id AS grant_id,g.revoked_at AS grant_revoked_at,g.expires_at AS grant_expires_at,g.fingerprint AS grant_fingerprint,g.review_id AS grant_review_id,g.publication_at AS grant_publication_at,
 m.metricool_id,m.uuid AS metricool_uuid,
 (SELECT COUNT(*) FROM social_posts x WHERE x.id<>p.id AND (x.copy=p.copy OR x.image_url=p.image_url)) AS exact_copy_or_url_count,
 (SELECT COUNT(DISTINCT x.post_id) FROM social_post_quality_reviews x WHERE x.post_id<>p.id AND x.image_sha256=r.image_sha256) AS exact_image_sha_count
 FROM social_posts p LEFT JOIN social_post_quality_reviews r ON r.id=(SELECT id FROM social_post_quality_reviews WHERE post_id=p.id ORDER BY reviewed_at DESC,created_at DESC,id DESC LIMIT 1)
 LEFT JOIN social_post_delegated_publication g ON g.post_id=p.id LEFT JOIN social_metricool_sync m ON m.post_id=p.id
 WHERE p.status<>'archived' AND (julianday(p.proposed_scheduled_at) BETWEEN julianday('${new Date(now-72*HOUR).toISOString()}') AND julianday('${new Date(now+14*DAY).toISOString()}') OR julianday(p.scheduled_at) BETWEEN julianday('${new Date(now-72*HOUR).toISOString()}') AND julianday('${new Date(now+14*DAY).toISOString()}'))`);
 const deliveries=await read("SELECT post_id,platform,status,published_at,remote_id FROM social_publish_deliveries WHERE published_at IS NOT NULL");
 for(const row of rows){
  row.deliveries=deliveries.filter(d=>d.post_id===row.id);
  if(row.status==='published')continue;
  if(!/^https:\/\/raw\.githubusercontent\.com\/TS15825868\/xianjiawei-internal\/main\/[A-Za-z0-9_./-]+$/.test(row.image_url||'')||!row.image_sha)continue;
  try{const response=await transport(row.image_url,{redirect:'error',signal:AbortSignal.timeout(20000)});if(response.ok)row.liveImageVerified=sha(Buffer.from(await response.arrayBuffer()))===row.image_sha}catch{}
 }
 const slots=requiredSlots(now).map(at=>inspectSlot(at,rows,now));
 return {schema:'xjw-social-runway-readonly-v1',checkedAt:new Date(now).toISOString(),readOnly:true,remoteScheduleVerified:false,liveMetricoolRequired:true,slots,missed:slots.filter(x=>x.timing==='missed'&&x.state!=='D1_THREE_PLATFORM_RECEIPTS_RECORDED').length,urgent:slots.filter(x=>x.timing==='urgent'&&x.state!=='D1_THREE_PLATFORM_RECEIPTS_RECORDED').length,publicationWrites:0,approvals:0};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const databaseId=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
 const execute=createD1Transport({token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID,databaseId});
 const report=await runAudit({execute});
 fs.writeFileSync('/tmp/xjw-social-runway.json',JSON.stringify(report,null,2)+'\n');
 console.log('SOCIAL_RUNWAY '+JSON.stringify(report));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## 社群固定排程缺口（唯讀）\n'+report.slots.map(s=>'- '+s.at+' '+(s.title||'無候選')+'：'+s.state+'；'+s.blockers.join(' / ')).join('\n')+'\nD1 不等同 Metricool 即時排程。禁止自動重送或以草稿當發布。\n');
 if(report.missed||report.urgent)console.log('::warning title=仙加味固定排程缺口::存在逾期或未來72小時尚未核實的固定發布時段；先處理此異常。');
}
