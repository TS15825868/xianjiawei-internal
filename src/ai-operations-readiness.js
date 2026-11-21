import {decideOperations} from './ai-operations-brain.js';
import {assessMissedSocialPost} from './social-missed-post-recovery.js';
// Protected, read-only AI operations status. NEVER calls AI, publishes, or changes D1.
const HEADERS = {'cache-control':'no-store','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff'};
const respond = (value,status=200) => Response.json(value,{status,headers:HEADERS});
const denied = (code,status) => respond({ok:false,code,readOnly:true,customerSend:false},status);
const ROLES = new Set(['owner','admin','content','sales']);
const POST_STATUS = new Set(['draft','pending_review','approved','scheduled','published','manual_required','failed','archived']);

// D1 7500 is a free-tier exhaustion signal, not a missing table or healthy zero.
// A per-isolate, per-binding pause avoids repeated futile scans; this is not a
// persistent quota ledger and cannot prove an account-wide reset.
const d1QuotaPause = new WeakMap();
export function nextD1FreeResetUtc(now=Date.now()) {
  if(!Number.isFinite(now))throw Error('invalid_now');
  const date=new Date(now);
  return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1);
}
export function isD1ReadQuotaExhausted(error) {
  if(Number(error?.code)===7500)return true;
  const message=String(error?.message||error||'');
  return /\\b7500\\b/.test(message)&&/(D1|quota|rows?[_\\s-]*read|limit|exceed)/i.test(message);
}
function quotaDenied(db) {
  const until=d1QuotaPause.get(db)||nextD1FreeResetUtc();
  return Response.json({
    ok:false,code:'d1_free_read_quota_exhausted',readOnly:true,customerSend:false,
    retryAfterUtc:new Date(until).toISOString(),writes:0,modelCalls:0
  },{status:503,headers:{...HEADERS,'retry-after':String(Math.max(1,Math.ceil((until-Date.now())/1000)))}});
}
function holdOnQuotaError(error,db) {
  if(!isD1ReadQuotaExhausted(error))return null;
  d1QuotaPause.set(db,nextD1FreeResetUtc());
  return quotaDenied(db);
}


export async function aiOperationsReadiness(request,env,{authenticate}={}) {
  if(request?.method!=='GET')return denied('method_not_allowed',405);
  if(typeof authenticate!=='function')return denied('authentication_unavailable',503);
  let person;
  try { person=await authenticate(request,env); }
  catch { return denied('access_required',401); }
  if(!ROLES.has(person?.role)||Number(person?.active)!==1)return denied('role_denied',403);
  if(typeof env?.DB?.prepare!=='function')return denied('d1_unavailable',503);
  if((d1QuotaPause.get(env.DB)||0)>Date.now())return quotaDenied(env.DB);
  let rows;
  try {
    const data=await env.DB.prepare('SELECT status,COUNT(*) AS total FROM social_posts GROUP BY status').all();
    if(!Array.isArray(data?.results))throw Error('invalid_result');
    rows=data.results;
  }catch(error) { return holdOnQuotaError(error,env.DB)||denied('d1_status_unavailable',503); }
  const posts=Object.fromEntries([...POST_STATUS].map(status=>[status,0]));
  for(const row of rows){
    if(POST_STATUS.has(row?.status)&&Number.isSafeInteger(Number(row.total))&&Number(row.total)>=0)
      posts[row.status]=Number(row.total);
  }
  // The LINE standby inbox is not an active LINE webhook. Query aggregate
  // counts only; never read event_json, replyToken, userId or message bodies.
  let lineInbox={schema:'unavailable',receiptOnly:true,liveWebhookVerified:false,
    canReply:false,total:0,unhandled:0};
  try{
    const query=await env.DB.prepare(
      'SELECT handling_status,COUNT(*) AS total FROM xjw_line_receipt_inbox GROUP BY handling_status').all();
    if(!Array.isArray(query?.results))throw Error('invalid_line_inbox_status');
    let total=0,unhandled=0;
    for(const row of query.results){
      const n=Number(row?.total);
      if(!Number.isSafeInteger(n)||n<0)throw Error('invalid_inbox_count');
      total+=n;
      if(!Number.isSafeInteger(total))throw Error('overflow_inbox_count');
      if(row?.handling_status==='unhandled')unhandled+=n;
    }
    lineInbox={schema:'available',receiptOnly:true,liveWebhookVerified:false,
      canReply:false,total,unhandled};
  }catch(error){
    const blocked=holdOnQuotaError(error,env.DB);if(blocked)return blocked;
    // A missing table or read failure is not proof that LINE is operating.
  }
  // Staff-claim metadata is separate from LINE message payloads. Active
  // claims are not customer replies, and the inbox still needs manual work.
  let handoff={schema:'unavailable',activeClaims:null,unassigned:null};
  if(lineInbox.schema==='available'){
    try{
      const row=await env.DB.prepare(
        "SELECT COUNT(*) AS total FROM xjw_line_handoff_claims c JOIN xjw_line_receipt_inbox r ON c.event_id=r.event_id WHERE c.status='claimed' AND r.handling_status='unhandled'"
      ).first();
      const active=Number(row?.total);
      if(!Number.isSafeInteger(active)||active<0||active>lineInbox.unhandled)
        throw Error('invalid handoff count');
      handoff={schema:'available',activeClaims:active,unassigned:lineInbox.unhandled-active};
    }catch(error){
      const blocked=holdOnQuotaError(error,env.DB);if(blocked)return blocked;
      // Missing or inconsistent claim history is never silently represented
      // as zero outstanding customer conversations.
    }
  }
  // Facebook/Instagram/Threads: aggregate only, never expose signed
  // event payloads or private message text outside the encrypted D1 store.
  let metaInbox={schema:'unavailable',receiptOnly:true,liveWebhookVerified:false,
    canReply:false,total:0,platformCounts:{facebook:0,instagram:0,threads:0}};
  try{
    const query=await env.DB.prepare(
      'SELECT platform,COUNT(*) AS total FROM xjw_webhook_receipts GROUP BY platform').all();
    if(!Array.isArray(query?.results))throw Error('invalid_meta_status');
    const platforms={facebook:0,instagram:0,threads:0};
    let total=0;
    for(const row of query.results){
      const n=Number(row?.total);
      if(!Object.hasOwn(platforms,row?.platform)||!Number.isSafeInteger(n)||n<0)
        throw Error('invalid_meta_count');
      platforms[row.platform]+=n;
      total+=n;
      if(!Number.isSafeInteger(total))throw Error('invalid_meta_total');
    }
    metaInbox={schema:'available',receiptOnly:true,liveWebhookVerified:false,
      canReply:false,total,platformCounts:platforms};
  }catch(error){
    const blocked=holdOnQuotaError(error,env.DB);if(blocked)return blocked;
    // Existing production services remain independent; never infer a live callback.
  }
  // Staff-only aggregated delivery backlog. No post copy, customer data
  // or reply tokens are read. Authentication and roles already validated.
  let publicationQueue={schema:'unavailable',total:null,waitingRetry:null,
    manualReview:null,staleSending:null,publishedMissingRemoteId:null};
  try{
    const row=await env.DB.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status='retry' THEN 1 ELSE 0 END),0) AS waiting_retry, COALESCE(SUM(CASE WHEN status='manual_required' THEN 1 ELSE 0 END),0) AS manual_review, COALESCE(SUM(CASE WHEN status='sending' AND (updated_at IS NULL OR datetime(updated_at)<=datetime('now','-15 minutes')) THEN 1 ELSE 0 END),0) AS stale_sending, COALESCE(SUM(CASE WHEN status='published' AND TRIM(COALESCE(remote_id,''))='' THEN 1 ELSE 0 END),0) AS published_no_remote_id FROM social_publish_deliveries").first();
    if(!row||typeof row!=='object')throw Error('invalid_publish_queue');
    const counts=['total','waiting_retry','manual_review','stale_sending','published_no_remote_id']
      .map(key=>Number(row[key]));
    if(counts.some(value=>!Number.isSafeInteger(value)||value<0))throw Error('invalid_publish_counts');
    const [total,waitingRetry,manualReview,staleSending,publishedMissingRemoteId]=counts;
    if(waitingRetry+manualReview+staleSending+publishedMissingRemoteId>total)
      throw Error('inconsistent_publish_counts');
    publicationQueue={schema:'available',total,waitingRetry,manualReview,staleSending,publishedMissingRemoteId};
  }catch(error){
    const blocked=holdOnQuotaError(error,env.DB);if(blocked)return blocked;
    // D1 query failure is unknown, never a healthy zero queue.
  }
  const checkedAt=new Date().toISOString();
  const requestedPost=new URL(request.url).searchParams.get('recoveryPost');
  let recovery=null;
  if(requestedPost!==null){
    if(!/^[A-Za-z0-9_-]{1,120}$/.test(requestedPost))return denied('invalid_post_id',400);
    try{
      const post=await env.DB.prepare(
        "SELECT scheduled_at,platforms_json FROM social_posts WHERE id=? AND status IN ('scheduled','failed','manual_required','published')"
      ).bind(requestedPost).first();
      if(!post)return denied('recovery_post_not_found',404);
      const receipts=await env.DB.prepare(
        'SELECT platform,status FROM social_publish_deliveries WHERE post_id=?'
      ).bind(requestedPost).all();
      recovery=assessMissedSocialPost({
        scheduled_at:post.scheduled_at,platforms:JSON.parse(post.platforms_json)
      },receipts.results,checkedAt);
    }catch(error){return holdOnQuotaError(error,env.DB)||denied('recovery_evidence_unavailable',503);}
  }
  const tasks=[];
  if(publicationQueue.staleSending>0||publicationQueue.publishedMissingRemoteId>0)
    tasks.push({id:'social-receipts',system:'publishing',risk:'high',action:'investigate',
      evidence_verified:true,reason:'核對平台正式回執與卡住的投遞紀錄'});
  if(handoff.unassigned>0)
    tasks.push({id:'line-unassigned',system:'line',risk:'medium',action:'investigate',
      evidence_verified:true,reason:'核對尚未分派的 LINE 收件紀錄'});
  const decisions=decideOperations(tasks,{now:checkedAt});
  const configured=env?.XJW_SOCIAL_AI_DRAFT_ENABLED==='true' &&
    env?.XJW_AI_FREE_ACCOUNT_CONFIRMED==='true' && typeof env?.AI?.run==='function';
  return respond({
    ok:true,readOnly:true,customerSend:false,writes:0,modelCalls:0,
    checkedAt,
    mode:'human_supervised_ai',allAutonomous:false,
    data:{d1:'query_succeeded',postStatusCounts:posts,publicationQueue,lineReceiptInbox:lineInbox,lineHandoff:handoff,metaReceiptInbox:metaInbox},
    operations:{decisions,recovery},
    capabilities:{
      verifiedProductFacts:'staff_only_zero_neuron',
      generativeDraft:configured?'configured_not_live_inference_verified':'disabled_or_free_account_unconfirmed',
      postReview:'human_or_verified_low_risk_ai_approval',
      lowRiskAiApproval:{supported:true,activeRuntimeEvidenceNotChecked:true,
        required:'current policy, 16 verified checks, approved official image hash, matching authorized networks and full audit',
        highRiskNeedsHuman:true},
      pendingPostAutoApproval:false,
      metaCommentAutoReply:'external_e2e_and_platform_control_unverified',
      metaReceiptStandby:'d1_schema_not_official_callback_verified',
      lineOa:'external_service_requires_live_verification',
      lineReceiptStandby:'table_schema_only_not_live_webhook_verified',
      metricool:'external_queue_requires_live_review',
      n8n:'not_required_for_public_health_fallback'
    },
    safeguards:{
      aiDraftRequiresFreePlanConfirmation:true,
      sourceOfTruth:'current_approved_product_authority',
      medicalAndCommercialQuestions:'human_takeover',
      publishedPostsImmutable:true,actualCustomerSendNotVerified:true
    },
    limits:{modelBudgetEnforcedByThisEndpoint:false,freePlanVerifiedByThisEndpoint:false},
    note:'D1 post counts, publish-delivery aggregates and LINE/Meta inbox metadata only. No live platform API, customer sends, models or free AI balance tested.'
  });
}
