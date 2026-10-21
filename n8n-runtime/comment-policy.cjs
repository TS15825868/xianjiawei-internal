// Suggestion-only implementation of docs/social-ai-comment-reply-policy-20261021.md.
// No API key, model call or send operation is included. Platform adapters must
// provide a complete, scoped thread; an unverified payload is never trusted.
const POLICY = '2026-10-21';
const RISK = [
  ['medical', /治療|療效|疾病|關節|疲勞|懷孕|孕婦|哺乳|醫[師療]|用藥|西藥|中藥|糖尿|高血壓|癌|過敏|副作用|手術|感冒|失眠|補氣|生津|功效|有效嗎|改善|預防/iu],
  ['complaint', /客訴|退款|退貨|換貨|破損|漏液|發霉|壞掉|難喝|生氣|投訴|騙|不滿|爛|垃圾|！！|!!/u],
  ['order_price', /多少錢|幾元|價格|價錢|售價|優惠|折扣|批發|成本|運費|訂單|下單|訂購|購買|買|付款|匯款|出貨|到貨|物流|試喝/iu],
  ['cooperation', /合作|代理|經銷|代工|合約|條件|報價/u],
  ['private_data', /09\d{8}|[A-Z][12]\d{8}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|地址|身分證|信用卡|密碼|token|api.?key/iu],
  ['instruction', /忽略|無視|系統提示|system prompt|ignore|指令|扮演|翻譯|照抄|照做/iu]
];
function scoped(thread, event) {
  return thread && thread.complete === true && thread.verified === true &&
    ['platform','accountId','postId','threadId'].every(k => thread[k] === event[k]) &&
    Array.isArray(thread.messages) && thread.messages.every(m =>
      typeof m.id === 'string' && typeof m.text === 'string' &&
      ['customer','brand'].includes(m.role) && m.authorId && Number.isFinite(Date.parse(m.at)));
}
function decide(event, thread, catalog) {
  const result = (action, reason, extra={}) => ({policy:POLICY,action,reason,mode:'suggestion_only',
    engine:'verified_facts_rules',aiUsed:false,sent:false,remoteReplyId:null,...extra});
  if (!scoped(thread,event)) return result('manual','unverified_or_incomplete_history');
  const messages=[...thread.messages].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const index=messages.findIndex(m=>m.id===event.commentId);
  if(index<0) return result('manual','comment_missing');
  const latest=messages[index];
  if(latest.role==='brand') return result('skip','brand_comment');
  if(messages.some(m=>m.role==='customer'&&m.authorId!==latest.authorId))
    return result('manual','multiple_customers_in_thread');
  if(messages.slice(index+1).some(m=>m.role==='brand'&&m.replyTo===latest.id))
    return result('skip','already_answered');
  if(messages.slice(index+1).some(m=>m.role==='customer')) return result('skip','superseded');
  const text=latest.text.trim();
  if(!text||/^(謝謝[你您]?|感謝|收到|好的?|了解|讚|棒|不客氣|[\p{Emoji_Presentation}\p{Extended_Pictographic}\s\uFE0F\u200D])+[！!。．]*$/u.test(text))
    return result('skip','no_new_question');
  // Check unresolved context as well as the latest turn. A benign follow-up
  // must not reopen a medical/order/complaint conversation automatically.
  const customerContext=messages.filter(m=>m.role==='customer').map(m=>m.text).join('\n');
  for(const [category,pattern] of RISK) if(pattern.test(customerContext))
    return result('manual',category,{category});
  if(!catalog || catalog.verified!==true || !Array.isArray(catalog.products) ||
     !catalog.version || !Number.isFinite(Date.parse(catalog.fetchedAt)) ||
     Math.abs(Date.now()-Date.parse(catalog.fetchedAt))>3600000)
    return result('manual','product_authority_unavailable');
  // Resolve only an explicit, unambiguous product name from this customer's
  // scoped thread. Never borrow another conversation or infer a product.
  const mentioned=catalog.products.filter(p=>p.name&&customerContext.includes(p.name));
  if(mentioned.length!==1) return result('manual','ambiguous_product');
  const p=mentioned[0];
  let reply='',field='';
  if(/^(?:請問|想問|那|那麼|這款|它|的|是|有|嗎|呢|？|\?|\s|幾克|幾公克|幾cc|幾CC|容量|重量|規格|包裝|多少|一罐|一包|[0-9]|g|G|c|C|玻璃罐|鋁袋|龜鹿膏|龜鹿飲|鹿茸粉)+$/u.test(text)&&/幾克|幾公克|幾cc|幾CC|容量|重量|規格|包裝/.test(text)) {
    field='allowedSpecs'; reply=`${p.name}的規格是${(p.allowedSpecs||[]).join('、')}。`;
    if(!p.allowedSpecs?.length) reply='';
  } else if(text.replace(p.name,'').match(/^(?:請問|想問|那|那麼|這款|它|的|是|有|嗎|呢|？|\?|\s|成分|哪些|什麼|內容物)+$/u)&&/成分|內容物/u.test(text)) {
    field='ingredients';reply=`${p.name}的成分依序為：${(p.ingredients||[]).join('、')}。`;
    if(!p.ingredients?.length)reply='';
  }
  if(!reply) return result('manual','needs_contextual_review');
  if(messages.some(m=>m.role==='brand'&&m.text.trim()===reply)) return result('skip','answer_already_in_thread');
  return result('suggest','verified_product_fact',{category:'product_information',reply,
    evidence:{productId:p.id,field,version:catalog.version,source:catalog.source}});
}
function apiFailure(error) {
  const status=Number(error?.status||0),code=Number(error?.code||0);
  return {action:'manual',mode:'suggestion_only',sent:false,remoteReplyId:null,
    reason:status===401||status===403||code===190?'permission_expired':status===429?'rate_limited':'api_unavailable',
    retryAutomatically:false};
}
async function digest(value) {
  const {createHash}=require('node:crypto');
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
async function processComment(event,{adapter,store,catalog,allowedAccounts}) {
  if(!['facebook','instagram','threads','line'].includes(event.platform)||
     !allowedAccounts?.[event.platform]?.includes(event.accountId)||
     !['accountId','postId','threadId','commentId'].every(k=>typeof event[k]==='string'&&event[k]))
    return {action:'manual',reason:'unverified_account',sent:false};
  let thread;
  try {thread=await adapter.loadThread(event)} catch(e) {const r=apiFailure(e);await store.recordError(event,r);return r;}
  if(!scoped(thread,event))return decide(event,thread,catalog);
  const version=await digest(thread.messages);
  const key=await digest([event.platform,event.accountId,event.postId,event.threadId,event.commentId,version]);
  // store.claim MUST atomically persist the unique key in durable storage.
  // No in-memory or n8n workflow-static-data lock is suitable for production.
  if(!await store.claim(key,event,version))return {action:'skip',reason:'duplicate_event',sent:false};
  let decision;
  try {
    const fresh=await adapter.loadThread(event);
    decision=await digest(fresh.messages)!==version
      ? {action:'manual',reason:'conversation_changed',sent:false}
      : decide(event,fresh,catalog);
  } catch(e) {decision=apiFailure(e);}
  // This module deliberately has no adapter.send call or auto-mode switch.
  await store.finish(key,decision);
  return {...decision,idempotencyKey:key,conversationVersion:version};
}
module.exports={POLICY,decide,scoped,apiFailure,processComment};
