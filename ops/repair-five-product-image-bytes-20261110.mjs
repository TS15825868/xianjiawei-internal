// Correct only stale image_bytes metadata after five reviewed, source-bound real-product photo replacements.
// Protect review fingerprint, image URL, all statuses, publication and historical audit.
import fs from "node:fs";import crypto from "node:crypto";import {createRequire} from "node:module";
const {fingerprint}=createRequire(import.meta.url)("../tools/metricool-free-evidence.cjs");
const req=JSON.parse(fs.readFileSync("ops/repair-five-product-image-bytes-request-20261110.json","utf8"));
const expectedIds=["XJW-CONV-chat-luerong-intro","XJW-CONV-chat-photo-size","XJW-CONV-cny-gift-choice","XJW-CONV-chat-picture-or-text","XJW-CONV-chat-glass-vs-pouch-storage"];
if(req.scope!=="xjw-correct-five-product-image-bytes-metadata-v1"||req.items?.length!==5||
 req.items.some((x,i)=>x.id!==expectedIds[i])||req.allowPublish!==false||req.allowApprove!==false||
 req.allowDelete!==false||req.allowImageURLChange!==false||req.allowStatusChange!==false)
 throw Error("Unsafe source-bound metadata operation");
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const db=fs.readFileSync("wrangler.jsonc","utf8").match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!account||!token||!db)throw Error("Missing Cloudflare D1 credentials");
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");
const quote=x=>x==null?"NULL":typeof x==="number"?String(x):"'"+String(x).replaceAll("'","''")+"'";
function bind(s,...a){let i=0;const out=s.replace(/\?/g,()=>quote(a[i++]));if(i!==a.length)throw Error("bind count mismatch");return out}
async function query(sql){const r=await fetch("https://api.cloudflare.com/client/v4/accounts/"+account+"/d1/database/"+db+"/query",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify({sql}),signal:AbortSignal.timeout(45000)});const j=await r.json();if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))throw Error("D1 rejected query "+JSON.stringify(j.errors||[]).slice(0,170));return j.result}
async function one(s,...args){return(await query(bind(s,...args)))[0]?.results?.[0]||null}
const initialCounts=(await query("SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status"))[0]?.results||[];
if(Number(initialCounts.find(x=>x.status==="pending_review")?.count||0)!==req.expectedPendingCount)throw Error("Pending queue size changed; require live re-evaluation");
const results=[];
for(const it of req.items){const result={id:it.id,fixed:false,readback:false,statusChanged:false};
 try{
  if(it.filePath!==("assets/post-images/2026-11-10/formal-production/"+it.id+"-real-product-v1.jpg")||it.imageURL!=="https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/"+it.filePath)throw Error("File path/source mismatch");
  const b=fs.readFileSync(it.filePath),len=b.length,digest=sha(b);
  if(digest!==it.imageSHA256)throw Error("Official composed image source hash changed");
  const p=await one("SELECT * FROM social_posts WHERE id=?",it.id);
  if(!p||p.status!=="pending_review"||p.image_url!==it.imageURL||p.updated_at!==it.expectedUpdatedAt||
   p.image_quality_status!=="clear"||p.published_at||p.scheduled_at||p.approved_by||p.approved_at||
   Number(p.image_approved||0)!==0)throw Error("D1 post version/status changed");
  const review=await one("SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1",it.id);
  if(!review||review.decision!=="NEEDS_HUMAN_REVIEW"||review.content_fingerprint!==fingerprint(p)||
   review.image_sha256!==digest||review.image_url!==p.image_url)throw Error("Current version-bound image review mismatch");
  const evidence=JSON.parse(review.evidence_json||"{}");
  if(evidence.checks?.duplicate?.result!=="DEFER"||evidence.image_sha256!==digest)throw Error("Duplicate/historical or image evidence invalid");
  const before=p.image_bytes==null?null:Number(p.image_bytes);
  if(before===len){result.alreadyCorrect=true;result.readback=true;results.push(result);continue}
  const now=new Date().toISOString(),aid="AUD-"+crypto.randomUUID();
  const update=bind("UPDATE social_posts SET image_bytes=? WHERE id=? AND status='pending_review' AND updated_at=? AND image_url=? AND image_quality_status='clear' AND COALESCE(image_bytes,-1)=? AND approved_by IS NULL AND approved_at IS NULL AND published_at IS NULL AND scheduled_at IS NULL AND COALESCE(image_approved,0)=0",
   len,it.id,p.updated_at,p.image_url,before??-1);
  const audit=bind("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','五篇正式原圖合成完成後修正圖片實際位元組資料（不改圖文/審核/發布）','貼文',?,?,?,'' WHERE changes()=1",
   aid,it.id,JSON.stringify({image_bytes:before,image_url:p.image_url,image_sha256:digest,decision:review.decision}),JSON.stringify({image_bytes:len,image_url:p.image_url,image_sha256:digest,decision:review.decision,dedup:"DEFER",approved:false,published:false}));
  const res=await query(update+";\n"+audit);
  if(res.length!==2||res[0]?.meta?.changes!==1||res[1]?.meta?.changes!==1)throw Error("Metadata CAS/audit update not exactly one record");
  const [after,quality]=await Promise.all([one("SELECT status,image_url,image_bytes,image_quality_status,updated_at,approved_at,approved_by,published_at,scheduled_at,image_approved FROM social_posts WHERE id=?",it.id),
    one("SELECT id,decision,content_fingerprint,image_sha256 FROM social_post_quality_reviews WHERE id=?",review.id)]);
  if(after?.status!=="pending_review"||after.image_url!==it.imageURL||Number(after.image_bytes)!==len||after.updated_at!==p.updated_at||after.image_quality_status!=="clear"||after.approved_at||after.approved_by||after.published_at||after.scheduled_at||Number(after.image_approved||0)!==0||quality?.decision!=="NEEDS_HUMAN_REVIEW"||quality.content_fingerprint!==review.content_fingerprint||quality.image_sha256!==digest)throw Error("Metadata or review readback mismatch");
  Object.assign(result,{fixed:true,readback:true,actualBytes:len,previousBytes:before,auditId:aid});
 }catch(e){result.blocker=String(e?.message||e).slice(0,350)}
 results.push(result);}
const endCounts=(await query("SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status"))[0]?.results||[];
const report={schema:req.scope,checked:results.length,updated:results.filter(x=>x.fixed).length,readback:results.filter(x=>x.readback).length,results,counts:endCounts,approved:0,scheduled:0,published:0};
fs.writeFileSync("five-product-image-bytes-repair-result.json",JSON.stringify(report,null,2)+"\n");
console.log("FIVE_PRODUCT_IMAGE_METADATA_REPAIR "+JSON.stringify(report));
if(report.readback!==5)process.exitCode=1;
