// Add truly new human-visible (AI-screened) scene-layout observations as immutable
// per-post AI-DEFER evidence; never change a post, prior 16 checks or publishing status.
import fs from "node:fs";import crypto from "node:crypto";
import {createRequire} from "node:module";
const {fingerprint}=createRequire(import.meta.url)("../tools/metricool-free-evidence.cjs");
const req=JSON.parse(fs.readFileSync("ops/request-49-contact-scene-evidence-20261110.json","utf8"));
const mf=fs.readFileSync(req.manifestPath),manifest=JSON.parse(mf);
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
const blobSha=crypto.createHash("sha1").update(Buffer.concat([Buffer.from("blob "+mf.length+"\0"),mf])).digest("hex");
if(req.schema!=="xjw-stage49-source-bound-contact-scene-ai-evidence-v1"||
 req.noSocialPostChanges!==true||req.noApproval!==true||req.noSchedule!==true||
 req.noPublishing!==true||req.noReplaceImage!==true||req.historicalFullDedupNotVerified!==true||
 req.fineTextNotVerified!==true||req.manifestGitBlob!==blobSha||
 req.sourceSnapshotAt!==manifest.snapshotAt||manifest.records?.length!==49||
 manifest.pages?.length!==5||manifest.D1Writes!==0)throw Error("Safety/manifest contract changed");
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const db=fs.readFileSync("wrangler.jsonc","utf8").match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!account||!token||!db)throw Error("Missing Cloudflare D1 credentials");
const q=x=>x==null?"NULL":typeof x==="number"?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...v){let i=0;const t=s.replace(/\?/g,()=>q(v[i++]));if(i!==v.length)throw Error("Bind count");return t}
async function query(s){const r=await fetch("https://api.cloudflare.com/client/v4/accounts/"+account+"/d1/database/"+db+"/query",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(40000)});const j=await r.json();if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))throw Error("D1 rejected "+JSON.stringify(j.errors||[]).slice(0,120));return j.result}
async function one(s,...a){return(await query(sql(s,...a)))[0]?.results?.[0]||null}
const preCounts=(await query("SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status"))[0]?.results||[];
if(Number(preCounts.find(x=>x.status==="pending_review")?.count||0)!==49)throw Error("D1 queue changed");
const all=[];
for(const item of manifest.records){
 const result={id:item.postId,n:item.index,added:false,readback:false,approval:false,publish:false};
 try{
  if(!/^XJW-[a-zA-Z0-9-]+$/.test(item.postId)||!item.sha256||item.sha256.length!==64||item.imagePath.includes(".."))throw Error("Bad manifest image");
  const p=await one("SELECT * FROM social_posts WHERE id=?",item.postId);
  if(!p||p.status!=="pending_review"||p.title!==item.title||p.copy!==item.caption||
    p.image_url!=="https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/"+item.imagePath||
    p.image_alt!==item.alt||p.updated_at!==item.contentVersion||p.image_quality_status!=="clear"||
    p.approved_by||p.approved_at||p.scheduled_at||p.published_at||Number(p.image_approved||0)!==0)throw Error("Post source/status changed");
  const latest=await one("SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1",item.postId);
  if(!latest||latest.decision!=="NEEDS_HUMAN_REVIEW"||
    latest.content_fingerprint!==fingerprint(p)||latest.image_sha256!==item.sha256||latest.image_url!==p.image_url)throw Error("Original image or current AI source proof changed");
  const e=JSON.parse(latest.evidence_json||"{}");
  if(e.content_fingerprint!==latest.content_fingerprint||e.image_sha256!==item.sha256||
   e.checks?.duplicate?.result!=="DEFER")throw Error("Unresolved historical duplicate evidence must remain DEFER");
  if(e.contact_scene_first_pass?.manifestGitBlob===req.manifestGitBlob){result.already=true;result.readback=true;all.push(result);continue}
  const proof={...e,contact_scene_first_pass:{
     manifestGitBlob:req.manifestGitBlob,performedBy:req.performedBy,page:item.page,cell:item.cell,
     imagePath:item.imagePath,imageSHA256:item.sha256,canvas:item.imageSize,
     source:"Original 49-contact sheets viewed by ChatGPT AI on 2026-11-10; original image pixels unchanged.",
     scene:"At thumbnail resolution, visibly consistent overall setting/action with current caption; recognizable fixed shopkeeper, deer and turtle. This does not prove all tiny texts or historical visual uniqueness.",
     screening:"FIRST_PASS_VISUAL_SCENE_ONLY",finePrint:"NOT_VERIFIED",historicalVisual:"DEFER",
     approved:false,full16:false,published:false
   }};
  const rid="AI-VIS-"+hash(req.manifestGitBlob+":"+p.id+":"+latest.content_fingerprint);
  const now=new Date().toISOString();
  const insert=sql("INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT ?,?,'AI','NEEDS_HUMAN_REVIEW',?,?,?,?,?,?,?,?,'pending_review','pending_review' WHERE EXISTS(SELECT 1 FROM social_posts WHERE id=? AND status='pending_review' AND updated_at=? AND copy=? AND image_url=? AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND COALESCE(image_approved,0)=0) AND (SELECT id FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1)=? AND NOT EXISTS(SELECT 1 FROM social_post_quality_reviews WHERE id=?)",
     rid,p.id,latest.content_fingerprint,p.image_url,item.sha256,JSON.stringify(proof),
     "ChatGPT AI visual scene screen; not human approval",latest.policy_version||"2026-11-10",latest.authorized_by,now,
     p.id,p.updated_at,p.copy,p.image_url,p.id,latest.id,rid);
  const audit=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','49篇現版原圖逐張縮圖場景覆核增補證據，歷史去重繼續DEFER，不核准不發布','貼文',?,?,?,'' WHERE changes()=1",
    "AUD-"+crypto.randomUUID(),p.id,JSON.stringify({prior:latest.id,image:item.sha256,duplicate:"DEFER"}),JSON.stringify({review:rid,manifest:req.manifestGitBlob,page:item.page,cell:item.cell,full16:false,published:false}));
  const change=await query(insert+";\n"+audit);
  if(change.length!==2||change.some(z=>z.meta?.changes!==1))throw Error("Review/audit changed row mismatch");
  const [after,review]=await Promise.all([one("SELECT status,image_url,copy,updated_at,image_approved,approved_by,published_at FROM social_posts WHERE id=?",p.id),
    one("SELECT decision,content_fingerprint,image_sha256,evidence_json FROM social_post_quality_reviews WHERE id=?",rid)]);
  const val=JSON.parse(review?.evidence_json||"{}");
  if(after?.status!=="pending_review"||after.image_url!==p.image_url||after.copy!==p.copy||
    after.updated_at!==p.updated_at||Number(after.image_approved||0)!==0||after.approved_by||after.published_at||
    review?.decision!=="NEEDS_HUMAN_REVIEW"||review.content_fingerprint!==latest.content_fingerprint||
    review.image_sha256!==item.sha256||val.checks?.duplicate?.result!=="DEFER"||
    val.contact_scene_first_pass?.manifestGitBlob!==req.manifestGitBlob)throw Error("D1 review/post readback mismatch");
  Object.assign(result,{added:true,readback:true,reviewId:rid});
 }catch(err){result.error=String(err?.message||err).slice(0,300)}
 all.push(result);
}
const afterCounts=(await query("SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status"))[0]?.results||[];
const report={schema:req.schema,checked:all.length,added:all.filter(x=>x.added).length,readback:all.filter(x=>x.readback).length,blocked:all.filter(x=>x.error).length,counts:afterCounts,full16Pass:0,duplicate:"DEFER",approvals:0,scheduled:0,published:0,postMutations:0,details:all};
fs.writeFileSync("visual-contact-scene-49-result.json",JSON.stringify(report,null,2)+"\n");
console.log("D1_49_VISUAL_SCENE_EVIDENCE "+JSON.stringify({...report,details:all.filter(x=>x.error).slice(0,8)}));
if(report.readback!==49||report.blocked)process.exitCode=1;
