// Protected, read-only AI operations status. NEVER calls AI, publishes, or changes D1.
const HEADERS = {'cache-control':'no-store','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff'};
const respond = (value,status=200) => Response.json(value,{status,headers:HEADERS});
const denied = (code,status) => respond({ok:false,code,readOnly:true,customerSend:false},status);
const ROLES = new Set(['owner','admin','content']);
const POST_STATUS = new Set(['draft','pending_review','approved','scheduled','published','manual_required','failed','archived']);

export async function aiOperationsReadiness(request,env,{authenticate}={}) {
  if(request?.method!=='GET')return denied('method_not_allowed',405);
  if(typeof authenticate!=='function')return denied('authentication_unavailable',503);
  let person;
  try { person=await authenticate(request,env); }
  catch { return denied('access_required',401); }
  if(!ROLES.has(person?.role)||person?.active===0)return denied('role_denied',403);
  if(typeof env?.DB?.prepare!=='function')return denied('d1_unavailable',503);
  let rows;
  try {
    const data=await env.DB.prepare('SELECT status,COUNT(*) AS total FROM social_posts GROUP BY status').all();
    if(!Array.isArray(data?.results))throw Error('invalid_result');
    rows=data.results;
  }catch { return denied('d1_status_unavailable',503); }
  const posts=Object.fromEntries([...POST_STATUS].map(status=>[status,0]));
  for(const row of rows){
    if(POST_STATUS.has(row?.status)&&Number.isSafeInteger(Number(row.total))&&Number(row.total)>=0)
      posts[row.status]=Number(row.total);
  }
  const configured=env?.XJW_SOCIAL_AI_DRAFT_ENABLED==='true' &&
    env?.XJW_AI_FREE_ACCOUNT_CONFIRMED==='true' && typeof env?.AI?.run==='function';
  return respond({
    ok:true,readOnly:true,customerSend:false,writes:0,modelCalls:0,
    checkedAt:new Date().toISOString(),
    mode:'human_supervised_ai',allAutonomous:false,
    data:{d1:'query_succeeded',postStatusCounts:posts},
    capabilities:{
      verifiedProductFacts:'staff_only_zero_neuron',
      generativeDraft:configured?'configured_not_live_inference_verified':'disabled_or_free_account_unconfirmed',
      postReview:'human_approval_required',pendingPostAutoApproval:false,
      metaCommentAutoReply:'external_e2e_and_platform_control_unverified',
      lineOa:'external_service_requires_live_verification',
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
    note:'D1 status read succeeded. Model/Meta/LINE/Metricool connectivity and free AI balance are NOT tested here.'
  });
}
