import app from './flexible-publish-entry.js';
import {assessAutopublishCandidate} from './ai-autopublish-policy.js';
import { publishedPlatformReceiptHold } from './external-published-receipt-holds.js';
import {enqueueMetricool,metricoolOwns,metricoolImmediate} from './metricool-sync.js';
import {imageHash,recordAiReview,aiGate} from './ai-quality-review.js';

const VERSION='2026-10-30-original-image-evidence-v10';
const REQUIRED_CHECKS=Object.freeze([
  'brand','product','specification','pricing_activity','season','weather','occasion','location',
  'scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'
]);
const PRODUCT_RULES=Object.freeze([
  {id:"guilu-gao",name:"龜鹿膏",terms:["龜鹿膏"],image:["guilu-gao","龜鹿膏"]},
  {id:"guilu-drink-30",name:"龜鹿飲30cc玻璃罐",terms:["30cc","龜鹿飲30"],image:["guilu-drink-30","30cc","龜鹿飲30"]},
  {id:"guilu-drink-180",name:"龜鹿飲180cc鋁袋",terms:["180cc","龜鹿飲180"],image:["guilu-drink-180","180cc","龜鹿飲180"]},
  {id:"luerong-fen",name:"鹿茸粉",terms:["鹿茸粉"],image:["luerong-fen","鹿茸粉"]},
  {id:"jinan-sisheng-siwuyin",name:"參仲四物飲",terms:["參仲四物飲"],image:["jinan-sisheng-siwuyin","參仲四物飲"]},
  {id:"guilu-vitality",name:"龜鹿活力飲",terms:["龜鹿活力飲"],image:["guilu-vitality","龜鹿活力飲"]},
  {id:"uboss-sizhenbao",name:"四珍寶",terms:["四珍寶"],image:["uboss-sizhenbao","四珍寶"]},
  {id:"royalherb-erzhenbao-64",name:"二珍寶",terms:["二珍寶"],image:["royalherb-erzhenbao-64","二珍寶"]},
  {id:"jianfeng-rose-fruit-tea",name:"臺灣丹參玫瑰果茶",terms:["玫瑰果茶"],image:["danshen-tea-collection","rose-fruit","玫瑰果茶"]},
  {id:"jianfeng-leisure-tea",name:"臺灣丹參懈悠活養生茶",terms:["懈悠活養生茶"],image:["tea-leisure","懈悠活養生茶"]},
  {id:"jianfeng-wudahan-tea",name:"武大漢丹參茶",terms:["武大漢丹參茶"],image:["tea-wudahan","武大漢丹參茶"]},
  {id:"jianfeng-fiber-tea",name:"臺灣丹參纖體茶",terms:["纖體茶"],image:["tea-fiber","纖體茶"]},
  {id:"jianfeng-white-tea",name:"臺灣白茶丹參飲",terms:["白茶丹參飲"],image:["tea-white","白茶丹參飲"]},
  {id:"jianfeng-refresh-tea",name:"臺灣丹參舒活茶",terms:["丹參舒活茶"],image:["tea-refresh","丹參舒活茶"]},
]);
const RETIRED_PUBLIC_PRODUCT_NAMES=Object.freeze(['龜鹿膠','龜鹿湯塊']);
const REGENERATION_ROLES=new Set(['owner','admin','content']);
const CUSTOMER_INTERNAL_TERMS=Object.freeze([
  '待審核','人工審核','16項','核准','不自動排程','不自動發布','貼文中心','發布中心','ERP','products-v3','守門員','母庫','資料庫','D1','Worker','GitHub','Workflow','候選圖','回填','重新生成','ChatGPT','不重畫','圖片呈現時','看圖片時','產品圖片','版面效果','產品本體','誤畫','正式原圖','正式產品原圖','正式比例','正式包裝','目前正式','最新確認','此類貼文需確認','舊的300g','舊版','debug','TODO','placeholder','假資料','Cloudflare','API Token','Secret','Repository','Repo','commit','deploy','部署','快取版本','測試資料','內部檢查','客戶實際會看到的文案','產品原圖','正式資訊','正式說明'
]);
const SCENE_GROUPS=Object.freeze([
  {id:'rain',copy:['下雨','雨天','雨勢','雨具'],image:['下雨','雨天','雨','雨傘','窗外','rain']},
  {id:'hot',copy:['悶熱','炎熱','夏天','補水','防曬'],image:['悶熱','炎熱','夏天','補水','水壺','陽光','防曬','hot','summer']},
  {id:'temperature',copy:['溫差','換季','薄外套','變冷','轉涼'],image:['溫差','換季','外套','轉涼','temperature','coat']},
  {id:'work',copy:['上班','工作空檔','工作中','工作桌','通勤'],image:['工作','上班','桌面','電腦','休息','work','office']},
  {id:'cook',copy:['料理','燉煮','雞湯','排骨湯','湯品','餐桌'],image:['料理','燉煮','湯','鍋','廚房','餐桌','cook','soup','recipe']},
  {id:'storage',copy:['保存','冷藏','陰涼','開封'],image:['保存','冷藏','冰箱','陰涼','收納','storage','fridge']},
  {id:'family',copy:['家人','關心家人','照顧自己'],image:['家人','關心','照顧','family','care']},
  {id:'choose',copy:['怎麼選','選擇','依習慣','依作息','在家、外出','外出、工作'],image:['怎麼選','選擇','作息','習慣','分類','看板','choose','routine']},
  {id:'use',copy:['怎麼使用','直接飲用','溫熱飲用','溫熱後','沖泡'],image:['使用','飲用','溫熱','熱水','沖泡','use','warm']}
]);
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-xianjiawei-publishing-review-gate':VERSION};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const clean=value=>String(value??'').trim();
let schemaPromise=null;

async function authorize(request,env,ctx){const url=new URL('/api/me',request.url);return app.fetch(new Request(url,{method:'GET',headers:request.headers}),env,ctx)}
async function ensureSchema(env){if(!env?.DB)throw new Error('D1 資料庫尚未綁定');if(schemaPromise)return schemaPromise;schemaPromise=env.DB.exec(`CREATE TABLE IF NOT EXISTS social_post_review_gates(post_id TEXT PRIMARY KEY,content_fingerprint TEXT NOT NULL,checklist_json TEXT NOT NULL DEFAULT '{}',copy_image_match INTEGER NOT NULL DEFAULT 0,reviewed_by TEXT NOT NULL DEFAULT '',reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`).catch(error=>{schemaPromise=null;throw error});return schemaPromise}
async function postRow(env,id){return env.DB.prepare('SELECT * FROM social_posts WHERE id=? LIMIT 1').bind(id).first()}
function postMaterial(row){return{title:clean(row?.title),headline:clean(row?.headline),copy:clean(row?.copy),category:clean(row?.category),image_url:clean(row?.image_url),image_alt:clean(row?.image_alt),image_source:clean(row?.image_source),image_width:Number(row?.image_width||0),image_height:Number(row?.image_height||0),image_quality_status:clean(row?.image_quality_status)}}
async function fingerprint(row){const bytes=new TextEncoder().encode(JSON.stringify(postMaterial(row)));const digest=await crypto.subtle.digest('SHA-256',bytes);return[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
const REVIEW_PRODUCT_NAMES=['龜鹿膏','龜鹿飲30cc','龜鹿飲180cc','鹿茸粉','參仲四物飲','龜鹿活力飲','四珍寶','二珍寶','玫瑰果茶','懈悠活養生茶','武大漢丹參茶','纖體茶','白茶丹參飲','丹參舒活茶'];
function reviewProductSegments(value,target){const source=String(value||''),segments=[];let start=0;while(target){const pos=source.indexOf(target,start);if(pos<0)break;let end=source.length,after=pos+target.length;for(const name of REVIEW_PRODUCT_NAMES){const next=source.indexOf(name,after);if(next>=0)end=Math.min(end,next)}segments.push(source.slice(pos,end));start=after}return segments}
function publicNorm(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/仙加味[｜|]?補養，是一種節奏。?/g,'').replace(/[^\p{L}\p{N}]+/gu,'')}
function imageNorm(value){try{const u=new URL(String(value||''),'https://xjw.invalid');u.search='';u.hash='';return `${u.origin}${u.pathname}`.toLowerCase()}catch{return String(value||'').split(/[?#]/)[0].trim().toLowerCase()}}
function diceSimilarity(a,b){if(!a||!b)return 0;if(a===b)return 1;const grams=s=>{const m=new Map();for(let i=0;i<s.length-1;i++){const k=s.slice(i,i+2);m.set(k,(m.get(k)||0)+1)}return m},A=grams(a),B=grams(b);let ai=0,bi=0,hit=0;for(const n of A.values())ai+=n;for(const n of B.values())bi+=n;for(const [k,n] of A)hit+=Math.min(n,B.get(k)||0);return ai+bi?2*hit/(ai+bi):0}
function customerCopyErrors(row){const text=[row?.title,row?.headline,row?.copy,row?.image_alt].filter(Boolean).join(' ');const hits=CUSTOMER_INTERNAL_TERMS.filter(term=>text.toLowerCase().includes(term.toLowerCase()));return hits.map(term=>`顧客文案含內部作業用語「${term}」`)}
function officialProductMedia(row){const image=`${row?.image_url||''} ${row?.image_source||''}`.toLowerCase();return /catalog-owner-final-v20261017|catalog-user-original-v20261017|products-v3|customer-display-v20260812|official[-_ ]?(?:product|v3)|正式產品/.test(image)}
function mentionedProducts(row){const text=[row?.title,row?.headline,row?.copy,row?.category].filter(Boolean).join(' ').toLowerCase();return PRODUCT_RULES.filter(rule=>rule.terms.some(term=>text.includes(term.toLowerCase())))}
function visualProducts(row){const image=[row?.image_url,row?.image_alt,row?.image_source].filter(Boolean).join(' ').toLowerCase();return PRODUCT_RULES.filter(rule=>rule.image.some(term=>image.includes(term.toLowerCase())))}
function semanticSceneErrors(row){
  if(officialProductMedia(row))return[];
  const text=[row?.title,row?.headline,row?.copy,row?.category].filter(Boolean).join(' ').toLowerCase();
  const image=[row?.image_alt,row?.image_source,row?.image_url].filter(Boolean).join(' ').toLowerCase();
  const topic=[row?.title,row?.headline,row?.category].filter(Boolean).join(' ');
  const receiptContext=/(收到|拆開|拆箱|包裹)/.test(text)&&/(先看|先確認|第一個|資訊)/.test(text);
  const explicitStorage=/(怎麼保存|保存方式教學|保存提醒|開封前後|開封後|保存重點)/.test(topic)||['保存','保存方式','保存提醒'].includes(clean(row?.category))||/(開封後|需冷藏|請冷藏|陰涼處|常溫保存|保存期限)/.test(row?.copy||'');
  const productComparison=/(龜鹿膏)/.test(text)&&/(龜鹿飲)/.test(text)&&/(差在哪|差別|比較|怎麼選|選擇|習慣)/.test(text);
  const comparisonVisual=/(龜鹿膏)/.test(image)&&/(龜鹿飲)/.test(image)&&/(介紹|比較|桌|小匙)/.test(image);
  const explicitBoard=/(分類看板|選擇看板|指著看板|對照表)/.test(text);
  const names={rain:'雨天',hot:'炎熱',temperature:'溫差',work:'工作',cook:'料理',storage:'保存',family:'家人',choose:'產品選擇',use:'使用方式'};
  const errors=[];
  for(const group of SCENE_GROUPS){
    if(!group.copy.some(term=>text.includes(term.toLowerCase())))continue;
    // Reading product information during unboxing is not a storage tutorial.
    if(group.id==='storage'&&receiptContext&&!explicitStorage)continue;
    // A two-product introduction can illustrate a comparison without a board.
    // This only checks the scene; physical product authenticity still needs review.
    if(group.id==='choose'&&productComparison&&comparisonVisual&&!explicitBoard)continue;
    if(!group.image.some(term=>image.includes(term.toLowerCase())))errors.push(`文案屬「${names[group.id]||group.id}」情境，但圖片說明／來源沒有對應情境線索`);
  }
  return errors;
}
function isWeatherPost(row){const text=[row?.title,row?.headline,row?.copy,row?.category,row?.image_alt].filter(Boolean).join(' ');return /(天氣|悶熱|炎熱|下雨|雨天|溫差|換季|寒冷|轉涼|颱風|豪雨)/.test(text)}
async function duplicatePostErrors(env,row,liveRows=null){
  const title=publicNorm(row?.title),copy=publicNorm(row?.copy),image=imageNorm(row?.image_url);
  let others=Array.isArray(liveRows)?liveRows.filter(other=>other.id!==row.id):null;
  // Archived posts may have already been published externally. Keep their
  // substantive copy in the historical dedup check without treating an
  // archived title or reusable product photo as a fresh-post collision.
  if(!others){const result=await env.DB.prepare("SELECT id,title,copy,status,image_url,image_source FROM social_posts WHERE id<>?").bind(row.id).all();others=result.results||[];}
  const errors=[];
  for(const other of others){
    const otherTitle=publicNorm(other.title),otherCopy=publicNorm(other.copy);
    const archived=clean(other.status)==='archived';
    if(!archived&&title&&title===otherTitle)errors.push(`貼文標題與「${other.title}」重複`);
    if(copy.length>=20&&otherCopy.length>=20&&(copy===otherCopy||(copy.length>=40&&otherCopy.length>=40&&diceSimilarity(copy,otherCopy)>=0.90)))errors.push(`貼文內容與「${other.title}」過度相似`);
    const otherImage=imageNorm(other.image_url);
    if(!archived&&image&&otherImage&&image===otherImage)errors.push(`主圖與「${other.title}」重複；每篇貼文需使用符合各自文案的不同圖片`);
  }
  return[...new Set(errors)]
}
function productMatchErrors(row){
  const text=[row?.title,row?.headline,row?.copy,row?.category].filter(Boolean).join(' '),image=[row?.image_url,row?.image_alt,row?.image_source].filter(Boolean).join(' '),combined=`${text} ${image}`,errors=[];
  const mentioned=mentionedProducts(row),visual=visualProducts(row),productVisual=officialProductMedia(row);
  if(productVisual){
    if(mentioned.length===1&&!visual.some(rule=>rule.id===mentioned[0].id))errors.push(`此篇為「${mentioned[0].name}」產品主題，但正式產品圖不是對應產品`);
    if(mentioned.length>1){for(const rule of mentioned){if(!visual.some(v=>v.id===rule.id))errors.push(`多產品文案提到「${rule.name}」，但產品型圖片資訊沒有對應該產品；若不呈現全部產品，請改用完整生活／分類情境圖`)}}
    for(const rule of visual){if(mentioned.length&&!mentioned.some(m=>m.id===rule.id))errors.push(`圖片呈現「${rule.name}」，但文案沒有對應該產品`) }
  }
  if(/30\s*cc/i.test(combined)&&/(玻璃瓶|小玻璃瓶|30\s*cc\s*／\s*瓶|30\s*cc\s*瓶裝)/i.test(combined))errors.push('30cc正式名稱必須是小玻璃罐／30cc／罐，不得稱瓶');
  if(RETIRED_PUBLIC_PRODUCT_NAMES.some(name=>text.includes(name)||image.includes(name)))errors.push('龜鹿膠與龜鹿湯塊已退出公開產品清單，禁止新貼文與新圖片；僅保留歷史資料');
  for(const segment of reviewProductSegments(combined,'龜鹿膏'))if(/(一天一次一小匙|每日一次一小匙|早晚各一小匙|每日早上及下午各一小匙)/.test(segment))errors.push('龜鹿膏不設定固定早上／下午時段；食用時間可依個人使用習慣與作息時間安排');
  if(!clean(row?.image_url))errors.push('缺少圖片');
  if(!clean(row?.image_alt))errors.push('缺少圖片說明，無法完成圖文一致審核');
  if(['needs_review','needs_rework','needs_regeneration','rejected','low','missing']
    .includes(clean(row?.image_quality_status).toLowerCase()))
    errors.push(clean(row?.image_quality_status)==='needs_review'?'圖片證據不足，待人工確認；不代表圖片確定不合格，不得核准或發布':'圖片仍標記為待重製／不合格，需更換後重新完成16項審核');
  errors.push(...semanticSceneErrors(row));
  errors.push(...customerCopyErrors(row));
  return[...new Set(errors)]
}
function checklistFrom(body){const value=body?.review_checklist&&typeof body.review_checklist==='object'&&!Array.isArray(body.review_checklist)?body.review_checklist:{};return{value,missing:REQUIRED_CHECKS.filter(key=>value[key]!==true)}}
async function gateState(env,row){
  if(!row)return{ok:false,reason:'找不到貼文'};if(row.published_at||['published','archived'].includes(clean(row.status)))return{ok:false,reason:'已有發布歷史，不能再次審核或發布'};
  const priorPublic=publishedPlatformReceiptHold(row);if(priorPublic)return{ok:false,reason:priorPublic.reason};
  if(['needs_review','needs_rework','needs_regeneration','rejected','low','missing']
    .includes(clean(row.image_quality_status).toLowerCase()))
    return{ok:false,reason:clean(row.image_quality_status)==='needs_review'?'圖片證據不足，待人工確認；不能排程或發布':'圖片仍需重製或未通過品質檢查；不能排程或發布'};
  // Owner-authorized AI approvals use versioned, content-bound evidence;
  // unapproved AI drafts never enter the publication path.
  if(clean(row.approved_by).startsWith('ai:')||clean(row.review_note).startsWith('AI審核：AI_APPROVED；')){
    const current=await fingerprint(row);
    const verified=await aiGate(env,row,current);
    if(!verified.ok)return verified;
    // Always re-run the complete copy/image/season/mascot audit at dispatch,
    // not just the lightweight product guard used when evidence was saved.
    // This catches newly prohibited visuals and policy changes without
    // weakening the existing human-review branch.
    const {auditOne}=await import('./publishing-content-audit-entry.js');
    const fullAudit=await auditOne(env,row);
    if(!fullAudit.ok)return{ok:false,reason:fullAudit.errors.join('；')};
    return{ok:true,reviewed_at:verified.reviewed_at,reviewed_by:verified.reviewed_by,fingerprint:current,reviewer_type:'AI'};
  }
  if(clean(row.review_note).startsWith('AI審核：AI_APPROVED；')&&clean(row.status)!=='approved')
    return{ok:false,reason:'AI審核完成但尚未有效核准，禁止排程'};
  await ensureSchema(env);
  const gate=await env.DB.prepare('SELECT * FROM social_post_review_gates WHERE post_id=? LIMIT 1').bind(row.id).first();
  if(!gate)return{ok:false,reason:'尚未完成16項正式圖文審核'};
  const identity=clean(gate.reviewed_by);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity)||/^(?:chatgpt|ai|bot|assistant)[:\-]/i.test(identity))return{ok:false,reason:'審核紀錄不是可驗證的人工帳號；AI檢查不能代替人工核准'};
  if(clean(row.approved_by)!==identity)return{ok:false,reason:'貼文核准者與人工圖文審核者不一致'};
  let reviewedChecks;try{reviewedChecks=JSON.parse(gate.checklist_json||'{}')}catch{return{ok:false,reason:'人工審核檢查表格式錯誤'}};
  if(REQUIRED_CHECKS.some(key=>reviewedChecks[key]!==true))return{ok:false,reason:'人工16項圖文檢查尚未全部完成'};
  const current=await fingerprint(row);
  if(gate.content_fingerprint!==current)return{ok:false,reason:'文案或圖片已變更，先前圖文審核已自動失效'};
  if(Number(gate.copy_image_match||0)!==1)return{ok:false,reason:'文案與圖片尚未確認一致'};
  if(isWeatherPost(row)){
    const reviewed=Date.parse(gate.reviewed_at||'');
    if(!Number.isFinite(reviewed)||Date.now()-reviewed>12*60*60*1000)return{ok:false,reason:'天氣／溫差型貼文需在發布前重新確認當日實際天氣；上次審核已超過12小時'};
  }
  return{ok:true,reviewed_at:gate.reviewed_at||'',reviewed_by:gate.reviewed_by||'',fingerprint:current}
}
async function saveGate(env,row,body,profile){const priorPublic=publishedPlatformReceiptHold(row);if(priorPublic)throw new Error(priorPublic.reason);const checklist=checklistFrom(body);if(checklist.missing.length)throw new Error(`16項圖文審核尚未完成：${checklist.missing.join('、')}`);if(body?.copy_image_match!==true)throw new Error('必須確認「文案與圖片一致」才能核准');const errors=productMatchErrors(row);errors.push(...await duplicatePostErrors(env,row));if(errors.length)throw new Error([...new Set(errors)].join('；'));const fp=await fingerprint(row),now=new Date().toISOString();await ensureSchema(env);await env.DB.prepare(`INSERT INTO social_post_review_gates(post_id,content_fingerprint,checklist_json,copy_image_match,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET content_fingerprint=excluded.content_fingerprint,checklist_json=excluded.checklist_json,copy_image_match=excluded.copy_image_match,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at`).bind(row.id,fp,JSON.stringify(checklist.value),1,clean(profile?.email),now).run()}
async function clearGate(env,id){try{await ensureSchema(env);await env.DB.prepare('DELETE FROM social_post_review_gates WHERE post_id=?').bind(id).run()}catch{}}
async function invalidateEditedPost(env,id,before){
  // The underlying worker already resets approval in an atomic, history-guarded
  // edit. Never issue another status UPDATE after the edit: a newer approval or
  // publication may have happened while the response was in flight.
  if(!before||before.published_at||['published','archived','manual_required'].includes(clean(before.status)))return;
  const oldFingerprint=await fingerprint(before);
  try{
    await ensureSchema(env);
    await env.DB.prepare("DELETE FROM social_post_review_gates WHERE post_id=? AND content_fingerprint=? AND EXISTS (SELECT 1 FROM social_posts WHERE id=? AND status='draft' AND approved_by IS NULL AND published_at IS NULL)")
      .bind(id,oldFingerprint,id).run();
  }catch(error){console.warn('Old review-gate invalidation deferred',clean(error?.message||error))}
}
async function readBody(request){try{return await request.clone().json()}catch{return{}}}
async function activeExternalSchedule(env,id){if(!await metricoolOwns(env,id))return false;const link=await env.DB.prepare('SELECT metricool_id,state FROM social_metricool_sync WHERE post_id=?').bind(id).first();return Boolean(link?.metricool_id&&['scheduled','awaiting_work','queued','blocked_config','awaiting_verification','cancel_required','unknown','published'].includes(link.state))}
function canRegenerate(profile){return REGENERATION_ROLES.has(clean(profile?.role))}
async function regenerationAudit(env,request,profile,action,id,before,after,mode=''){try{const ip=request.headers.get('cf-connecting-ip')||'';const beforeJson=before?JSON.stringify({status:before.status||'',title:before.title||'',image_url:before.image_url||''}):null;const afterJson=after?JSON.stringify({status:after.status||'',title:after.title||'',image_url:after.image_url||'',regeneration_mode:clean(mode)}):null;await env.DB.prepare('INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) VALUES(?,?,?,?,?,?,?,?)').bind(`AUD-${crypto.randomUUID()}`,clean(profile?.email),action,'貼文',id,beforeJson,afterJson,ip).run()}catch{}}
async function submitForReview(request,env,profile,id,before){if(!canRegenerate(profile))return json({error:'沒有送待審核的權限'},403);if(!before)return json({error:'找不到貼文'},404);if(clean(before.status)!=='draft'||before.published_at)return json({error:'只有未發布草稿可以送待審核'},409);if(await activeExternalSchedule(env,id))return json({error:'此貼文已有外部排程，請先核對取消原UUID'},409);if(!clean(before.copy)&&!clean(before.headline))return json({error:'貼文沒有文案，請先完成文案再送待審核'},409);if(!clean(before.image_url))return json({error:'貼文沒有圖片，請先補上圖片再送待審核'},409);const now=new Date().toISOString();const changed=await env.DB.prepare("UPDATE social_posts SET status='pending_review',scheduled_at=NULL,approved_by=NULL,approved_at=NULL,image_approved=0,updated_at=? WHERE id=? AND status='draft' AND published_at IS NULL").bind(now,id).run();if(Number(changed?.meta?.changes)!==1)return json({error:'貼文已被其他操作變更，請重新整理'},409);await clearGate(env,id);const after=await postRow(env,id);await regenerationAudit(env,request,profile,'草稿送待審核',id,before,after,'');return json({ok:true,id,status:'pending_review',review_required:true,required_checks:REQUIRED_CHECKS,message:'已送待審核；必須完成人工16項圖文審核後才能核准。'})}
async function regenerationStart(request,env,ctx,id){const authorization=await authorize(request,env,ctx);if(!authorization.ok)return authorization;const profile=await authorization.json();if(!canRegenerate(profile))return json({error:'沒有重新生成貼文的權限'},403);const before=await postRow(env,id);if(!before)return json({error:'找不到貼文'},404);const externalHold=publishedPlatformReceiptHold(before);if(externalHold)return json({error:externalHold.reason,requires_platform_reconciliation:true},409);if(before.published_at||!['draft','pending_review','approved','scheduled'].includes(clean(before.status)))return json({error:'已發布或不可變更的貼文不能重新生成'},409);if(await activeExternalSchedule(env,id))return json({error:'此篇仍有Metricool外部排程或發布紀錄，須先完成外部UUID核對與取消'},409);const body=await readBody(request),mode=['image','copy','all'].includes(clean(body?.mode))?clean(body.mode):'image';const now=new Date().toISOString();const changed=await env.DB.prepare("UPDATE social_posts SET status='draft',scheduled_at=NULL,approved_by=NULL,approved_at=NULL,image_approved=0,updated_at=? WHERE id=? AND status=? AND published_at IS NULL").bind(now,id,before.status).run();if(Number(changed?.meta?.changes)!==1)return json({error:'貼文已被其他操作變更，請重新整理'},409);await clearGate(env,id);const after=await postRow(env,id);await regenerationAudit(env,request,profile,'開始重新生成並撤銷舊核准',id,before,after,mode);return json({ok:true,id,status:'draft',mode,review_invalidated:true,scheduled_at:null,message:'已撤銷舊核准與排程；生成完成並回填後會進入待審核。'})}
async function regenerationReady(request,env,ctx,id){const authorization=await authorize(request,env,ctx);if(!authorization.ok)return authorization;const profile=await authorization.json();if(!canRegenerate(profile))return json({error:'沒有送回待審核的權限'},403);const before=await postRow(env,id);if(!before)return json({error:'找不到貼文'},404);const externalHold=publishedPlatformReceiptHold(before);if(externalHold)return json({error:externalHold.reason,requires_platform_reconciliation:true},409);if(before.published_at||!['draft','pending_review'].includes(clean(before.status)))return json({error:'只有未發布的草稿或待審核貼文可重新送審'},409);if(await activeExternalSchedule(env,id))return json({error:'仍有Metricool外部排程或發布紀錄，禁止直接重新審核'},409);if(!clean(before.copy)&&!clean(before.headline))return json({error:'重新生成後仍沒有文案，請先回填文案'},409);if(!clean(before.image_url))return json({error:'重新生成後仍沒有圖片，請先上傳或填入圖片'},409);const body=await readBody(request),mode=['image','copy','all'].includes(clean(body?.mode))?clean(body.mode):'';
  // A URL left over from a rejected image is NOT evidence that a regenerated
  // image was uploaded. Leave the row in draft until the replacement has
  // cleared its rejected-quality marker. This does not auto-approve images:
  // every replacement returns to the human 16-check review.
  // Regeneration mode comes from the client and is not proof that rejected
  // media was replaced. Never let "copy", omitted mode, or an invalid mode
  // bypass the quality hold. Text-only rework can be drafted, but completion
  // requires a new qualifying image before returning to human review.
  if(['needs_review','needs_rework','needs_regeneration','rejected','low','missing']
      .includes(clean(before.image_quality_status).toLowerCase()))
    return json({error:'圖片仍標記為待重製／不合格，請先更換圖片並儲存，再送回待審核'},409);
  const now=new Date().toISOString();const changed=await env.DB.prepare("UPDATE social_posts SET status='pending_review',scheduled_at=NULL,approved_by=NULL,approved_at=NULL,image_approved=0,updated_at=? WHERE id=? AND status=? AND published_at IS NULL").bind(now,id,before.status).run();if(Number(changed?.meta?.changes)!==1)return json({error:'貼文已被其他操作變更，請重新整理'},409);await clearGate(env,id);const after=await postRow(env,id);await regenerationAudit(env,request,profile,'重新生成完成送回待審核',id,before,after,mode);return json({ok:true,id,status:'pending_review',mode,review_required:true,required_checks:REQUIRED_CHECKS,message:'新文案／圖片已送回待審核；必須重新完成16項圖文審核。'})}


const IMAGE_REVIEW_REJECTED=new Set(['needs_review','needs_rework','needs_regeneration','rejected','low','missing']);
async function imageDeliveryHold(env,id){
  return Boolean(await env.DB.prepare("SELECT platform FROM social_publish_deliveries WHERE post_id=? AND (COALESCE(attempt_count,0)>0 OR last_attempt_at IS NOT NULL OR published_at IS NOT NULL OR TRIM(COALESCE(remote_id,''))<>'' OR status IN ('sending','retry','published','manual_required','permanent_failed')) LIMIT 1").bind(id).first());
}
async function imageReviewContext(request,env,ctx,id){
  const auth=await authorize(request,env,ctx);if(!auth.ok)return auth;
  const profile=await auth.json();
  if(!REGENERATION_ROLES.has(clean(profile?.role))||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(profile?.email)))return json({error:'沒有圖片覆核權限'},403);
  const row=await postRow(env,id);if(!row)return json({error:'找不到貼文'},404);
  const held=row.published_at||!['draft','pending_review','approved'].includes(clean(row.status))||publishedPlatformReceiptHold(row)||await activeExternalSchedule(env,id)||await imageDeliveryHold(env,id);
  if(held)return json({error:'已有發布回執、外部排程或不可變更狀態，禁止覆核'},409);
  return json({id,image_url:row.image_url,image_alt:row.image_alt,title:row.title,copy:row.copy,expected_fingerprint:await fingerprint(row),expected_updated_at:row.updated_at,required_checks:REQUIRED_CHECKS,auto_publish:false});
}
// Only authenticated, version-bound audit evidence can retire historical path holds.
async function validOriginalImageReview(env,row,records=null){
  if(clean(row?.image_quality_status)!=='passed')return false;
  const logs=records||((await env.DB.prepare("SELECT actor_email,after_json FROM audit_logs WHERE entity_id=? AND action='圖片原網址重新視覺覆核' ORDER BY rowid DESC LIMIT 1").bind(row.id).all()).results||[]);
  const current=await fingerprint(row);
  return logs.some(log=>{try{const proof=JSON.parse(log.after_json);return proof.decision==='pass'&&proof.fingerprint===current&&proof.image_url===row.image_url&&proof.reviewed_by===log.actor_email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(log.actor_email)&&clean(proof.visual_evidence).length>=40&&proof.copy_image_match===true&&REQUIRED_CHECKS.every(key=>proof.review_checklist?.[key]===true)}catch{return false}});
}
async function reviewExistingImage(request,env,ctx,id){
  const authorization=await authorize(request,env,ctx);if(!authorization.ok)return authorization;
  const profile=await authorization.json();
  if(!REGENERATION_ROLES.has(clean(profile?.role))||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(profile?.email)))
    return json({error:'僅限可驗證的內容審核人員操作'},403);
  const before=await postRow(env,id);if(!before)return json({error:'找不到貼文'},404);
  if(before.published_at||['published','archived','manual_required','scheduled'].includes(clean(before.status)))
    return json({error:'已有發布歷史、排程或人工接手，不可重新覆核'},409);
  const receipt=publishedPlatformReceiptHold(before);if(receipt)return json({error:receipt.reason},409);
  if(await activeExternalSchedule(env,id)||await imageDeliveryHold(env,id))return json({error:'存在外部排程、發送嘗試或回執，禁止變更圖片審核'},409);
  if(!clean(before.image_url))return json({error:'缺少圖片，無法覆核'},409);
  const body=await readBody(request);
  const decision=clean(body.decision);
  if(!['pass','reject','defer'].includes(decision))return json({error:'覆核結果必須是 pass、reject 或 defer'},400);
  const expected=clean(body.expected_fingerprint);
  const current=await fingerprint(before);
  if(!expected||expected!==current||clean(body.expected_updated_at)!==clean(before.updated_at))return json({error:'圖片或貼文版本已變更，請重新載入後覆核'},409);
  const evidence=clean(body.visual_evidence);
  if(evidence.length<40||evidence.length>4000)return json({error:'須提供40至4000字的實際看圖證據，包括角色、產品、比例、場景及圖文一致性'},400);
  const checklist=checklistFrom(body);
  if(decision==='pass'&&(checklist.missing.length||body.copy_image_match!==true))
    return json({error:'圖片通過須具備16項完整覆核與圖文一致證據',missing:checklist.missing},409);
  const now=new Date().toISOString(),next=decision==='pass'?'passed':decision==='defer'?'needs_review':'needs_rework';
  // D1 batch executes as one transaction: update, evidence log and gate
  // invalidation must commit together. A stale compare-and-swap logs nothing.
  await ensureSchema(env);
  const auditId=`AUD-${crypto.randomUUID()}`;
  const auditBefore=JSON.stringify({image_url:before.image_url,image_quality_status:before.image_quality_status,fingerprint:current});
  const reviewedFingerprint=await fingerprint({...before,image_quality_status:next});
  const auditAfter=JSON.stringify({image_url:before.image_url,image_quality_status:next,decision,human_review_required:decision==='defer',visual_evidence:evidence,review_checklist:checklist.value,copy_image_match:body.copy_image_match===true,reviewed_at:now,reviewed_by:clean(profile.email),fingerprint:reviewedFingerprint,previous_fingerprint:current,image_width:before.image_width,image_height:before.image_height});
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE social_posts SET image_quality_status=?,image_approved=0,approved_by=NULL,approved_at=NULL,scheduled_at=NULL,status='pending_review',updated_at=? WHERE id=? AND status IN ('draft','pending_review','approved') AND published_at IS NULL AND image_url=? AND COALESCE(image_quality_status,'')=? AND updated_at=? AND title=? AND headline=? AND copy=? AND category=? AND image_alt=? AND image_source=? AND image_width=? AND image_height=? AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id AND metricool_id IS NOT NULL AND state IN ('scheduled','awaiting_work','queued','blocked_config','awaiting_verification','cancel_required','unknown','published')) AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id AND (COALESCE(attempt_count,0)>0 OR last_attempt_at IS NOT NULL OR published_at IS NOT NULL OR TRIM(COALESCE(remote_id,''))<>'' OR status IN ('sending','retry','published','manual_required','permanent_failed')))`)
      .bind(next,now,id,before.image_url,before.image_quality_status||'',before.updated_at,before.title,before.headline,before.copy,before.category,before.image_alt,before.image_source,before.image_width,before.image_height),
    env.DB.prepare('INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1')
      .bind(auditId,clean(profile.email),'圖片原網址重新視覺覆核','貼文',id,auditBefore,auditAfter,request.headers.get('cf-connecting-ip')||''),
    env.DB.prepare('DELETE FROM social_post_review_gates WHERE post_id=? AND EXISTS(SELECT 1 FROM audit_logs WHERE id=?)')
      .bind(id,auditId)
  ]);
  if(Number(results?.[0]?.meta?.changes||0)!==1)return json({error:'覆核時貼文已被修改，請重新載入'},409);
  if(Number(results?.[1]?.meta?.changes||0)!==1)throw new Error('圖片覆核稽核日誌未寫入，禁止視為成功');
  return json({ok:true,id,status:'pending_review',image_quality_status:next,reviewed_at:now,reviewed_by:clean(profile.email),image_preserved:true,review_gate_passed:false,auto_publish:false,message:'圖片覆核證據已記錄；仍須重新完成正式貼文核准'});
}

export default{async fetch(request,env,ctx){
  const url=new URL(request.url),path=url.pathname;
  if(request.method==='GET'&&path==='/healthz'){
    const response=await app.fetch(request,env,ctx),text=await response.text();let body={};try{body=text?JSON.parse(text):{}}catch{return response}
    return json({...body,publishingReviewGateVersion:VERSION,publishingReviewChecklistCount:REQUIRED_CHECKS.length,copyImageMatchHardGate:true,semanticSceneMatch:true,duplicateLifestyleImageGate:true,weatherReviewFreshnessHours:12,editImmediatelyInvalidatesApproval:true,freeRegenerationRoundTrip:true,draftToPendingReviewRequired:true,directDraftApprovalBlocked:true,regenerationStartEndpoint:'/api/posts/:id/regeneration-start',regenerationReadyEndpoint:'/api/posts/:id/regeneration-ready',regenerationReturnsToPendingReview:true},response.status)
  }
  const returnAiReviewMatch=path.match(/^\/api\/posts\/([^/]+)\/prepare-human-review$/),statusMatch=path.match(/^\/api\/posts\/([^/]+)\/status$/),publishMatch=path.match(/^\/api\/posts\/([^/]+)\/publish-now$/),postMatch=path.match(/^\/api\/posts\/([^/]+)$/),gateMatch=path.match(/^\/api\/posts\/([^/]+)\/review-gate$/),regenStartMatch=path.match(/^\/api\/posts\/([^/]+)\/regeneration-start$/),regenReadyMatch=path.match(/^\/api\/posts\/([^/]+)\/regeneration-ready$/);
  const aiMatch=path.match(/^\/api\/posts\/([^/]+)\/ai-quality-review$/);
  if(request.method==='GET'&&/^\/api\/posts\/[^/]+\/autopublish-readiness$/.test(path)){
    const auth=await authorize(request,env,ctx);if(!auth.ok)return auth;
    const id=decodeURIComponent(path.split('/')[3]||'');
    const row=await postRow(env,id);if(!row)return json({error:'找不到貼文'},404);
    let platforms=[];try{platforms=JSON.parse(row.platforms_json||'[]')}catch{}
    // Report the ACTUAL verified gate, rather than always passing an empty
    // evidence object. No guesswork about paid quotas, external UUIDs, or
    // platform permission can authorize a customer-visible publication.
    let gate;
    try{gate=await gateState(env,row);}
    catch{gate={ok:false,reason:'正式圖文審核查詢失敗，禁止排程'};}
    const aiEvidenceValid=gate.ok===true&&gate.reviewer_type==='AI';
    const checks={
      aiEvidenceValid,
      imageAuthentic:aiEvidenceValid,
      sceneMatches:aiEvidenceValid,
      productAuthorityValid:aiEvidenceValid,
      uniqueCopy:aiEvidenceValid,
      uniqueImage:aiEvidenceValid,
      rightsVerified:aiEvidenceValid,
      // A local post and AI review cannot prove a scheduled delivery, quota,
      // deduplication of external UUIDs, or live FB/IG/Threads publish rights.
      scheduledTimeValid:false,
      platformReady:false,
      quotaVerified:false,
      deliveryDedupReady:false,
      reviewedAt:aiEvidenceValid?gate.reviewed_at:null
    };
    const assessment=assessAutopublishCandidate({...row,platforms},checks);
    return json({...assessment,post_id:id,review_gate_passed:gate.ok===true,
      reviewer_type:gate.ok?gate.reviewer_type||'HUMAN':null,
      review_blocker:gate.ok?null:gate.reason||'缺少有效圖文審核',
      external_quota_verified:false,external_platform_verified:false,
      external_delivery_dedup_verified:false,
      auto_schedule_enabled:false,auto_publish_enabled:false,
      external_scheduled:false,external_published:false});
  }
  if(aiMatch&&request.method==='GET'){
    const authorization=await authorize(request,env,ctx);if(!authorization.ok)return authorization;
    const profile=await authorization.json();
    if(!['owner','admin'].includes(clean(profile?.role)))return json({error:'只有正式管理者能讀取完整AI審核證據'},403);
    const id=decodeURIComponent(aiMatch[1]),row=await postRow(env,id);if(!row)return json({error:'找不到貼文'},404);
    const history=await env.DB.prepare('SELECT id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,reviewed_at,old_status,new_status FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC,created_at DESC').bind(id).all();
    const current=await fingerprint(row);
    return json({post_id:id,current:{...postMaterial(row),status:row.status,updated_at:row.updated_at,content_fingerprint:current},required_checks:REQUIRED_CHECKS,reviews:(history.results||[]).map(review=>{
      let evidence=null;try{evidence=JSON.parse(review.evidence_json)}catch{}
      const {evidence_json,...summary}=review;
      return {...summary,matches_current_content:review.content_fingerprint===current&&review.image_url===row.image_url,evidence,evidence_parse_error:evidence===null};
    }),read_only:true,auto_schedule:false,auto_publish:false});
  }
  if(aiMatch&&request.method==='POST'){
    const authorization=await authorize(request,env,ctx);if(!authorization.ok)return authorization;
    const profile=await authorization.json(),id=decodeURIComponent(aiMatch[1]),row=await postRow(env,id);if(!row)return json({error:'找不到貼文'},404);
    try{
      // AI approval must pass the SAME full image/scene/season/brand audit as
      // manually submitted posts. Previously the AI route bypassed this wrapper.
      const {auditOne}=await import('./publishing-content-audit-entry.js');
      const auditedRows=await env.DB.prepare("SELECT id,title,headline,copy,category,image_url,image_alt,image_source,image_quality_status,status FROM social_posts WHERE status<>'archived'").all();
      const fullAudit=await auditOne(env,row,auditedRows.results||[]);
      if(!fullAudit.ok)return json({error:'AI核准前完整圖文稽核未通過，禁止核准或發布',details:fullAudit.errors},409);
      const result=await recordAiReview(env,row,await readBody(request),profile,{fingerprint,productMatchErrors,duplicatePostErrors,isWeatherPost});const latest=await postRow(env,id);if(latest.status!==result.status)return json({error:'內容已被其他操作更新；未送出排程'},409);result.human_review_required=result.decision!=='AI_APPROVED';
      if(result.decision==='AI_APPROVED'){
        const current=await postRow(env,id),gate=await gateState(env,current);
        if(!gate.ok)return json({...result,auto_schedule:false,queue_error:gate.reason});
        // Existing external UUIDs and the owner's previous schedules must
        // be reconciled before any unattended scheduling request is queued.
        let initialized=false;
        try{initialized=(await env.DB.prepare("SELECT setting_value FROM social_metricool_control WHERE setting_key='initialized'").first())?.setting_value==='20261013-eight-recovery'}catch{}
        if(!initialized)return json({...result,auto_schedule:false,queue_error:'Metricool 既有UUID尚未對帳；AI已核准但不自動建立外部排程'});
        try{const queued=await enqueueMetricool(env,current,{gateState,fingerprint});
          return json({...result,auto_schedule:false,queued_for_work:Boolean(queued.ok&&queued.queued),metricool:queued,external_scheduled:false,external_published:false,message:queued.ok?'AI審核已通過，僅加入免費Work待排程佇列；尚未在Metricool建立正式排程':'AI審核已通過，但未建立排程；請核對阻擋原因'});
        }catch(error){return json({...result,auto_schedule:false,queue_error:clean(error?.message||error)})}
      }
      return json(result)}catch(e){return json({error:clean(e.message||e)},409)}
  }
  const imageReviewMatch=path.match(/^\/api\/posts\/([^/]+)\/image-visual-review$/);
  if(imageReviewMatch&&request.method==='GET')return imageReviewContext(request,env,ctx,decodeURIComponent(imageReviewMatch[1]));
  if(imageReviewMatch&&request.method==='POST')return reviewExistingImage(request,env,ctx,decodeURIComponent(imageReviewMatch[1]));
  if(regenStartMatch&&request.method==='POST')return regenerationStart(request,env,ctx,decodeURIComponent(regenStartMatch[1]));
  if(regenReadyMatch&&request.method==='POST')return regenerationReady(request,env,ctx,decodeURIComponent(regenReadyMatch[1]));
  if(gateMatch&&request.method==='GET'){const authorization=await authorize(request,env,ctx);if(!authorization.ok)return authorization;await ensureSchema(env);const id=decodeURIComponent(gateMatch[1]),row=await postRow(env,id);if(!row)return json({error:'找不到貼文'},404);const duplicates=await duplicatePostErrors(env,row);return json({id,...await gateState(env,row),errors:[...new Set([...productMatchErrors(row),...duplicates])],required_checks:REQUIRED_CHECKS})}
  if(returnAiReviewMatch&&request.method==='POST'){
    const auth=await authorize(request,env,ctx);
    if(!auth.ok)return auth;
    const profile=await auth.json();
    if(!REGENERATION_ROLES.has(clean(profile?.role)))return json({error:'沒有操作人工審核的權限'},403);
    const id=decodeURIComponent(returnAiReviewMatch[1]);
    const row=await postRow(env,id);
    if(!row)return json({error:'找不到貼文'},404);
    if(clean(row.status)!=='approved'||clean(row.approved_by)||row.scheduled_at||row.published_at)
      return json({error:'此篇不符合 AI 預審待人工確認條件，未修改資料'},409);
    if(await activeExternalSchedule(env,id))
      return json({error:'已存在外部排程，須先核對平台狀態'},409);
    await ensureSchema(env);
    const gate=await env.DB.prepare('SELECT reviewed_by FROM social_post_review_gates WHERE post_id=? LIMIT 1').bind(id).first();
    if(clean(gate?.reviewed_by)!=='chatgpt:owner-delegated-reviewed')
      return json({error:'原審核來源不是已確認的 AI 預審批次；無法自動轉換'},409);
    const now=new Date().toISOString();
    const changed=await env.DB.prepare("UPDATE social_posts SET status='pending_review',approved_by=NULL,approved_at=NULL,image_approved=0,scheduled_at=NULL,updated_at=? WHERE id=? AND status='approved' AND approved_by IS NULL AND scheduled_at IS NULL AND published_at IS NULL")
      .bind(now,id).run();
    if(Number(changed.meta?.changes||0)!==1)return json({error:'貼文已被其他操作變更，請重新整理'},409);
    const after=await postRow(env,id);
    await regenerationAudit(env,request,profile,'AI預審轉待人工圖文審核',id,row,after,'');
    return json({ok:true,id,status:'pending_review',image_preserved:true,ai_review_evidence_preserved:true,message:'原文案及圖片已保留，請完成16項人工圖文審核'});
  }
  if(statusMatch&&request.method==='POST'){
    const authorization=await authorize(request,env,ctx);if(!authorization.ok)return authorization;const profile=await authorization.json(),id=decodeURIComponent(statusMatch[1]),body=await readBody(request),row=await postRow(env,id);if(!row)return json({error:'找不到貼文'},404);
    if((row.published_at||['published','archived'].includes(clean(row.status)))&&body?.status)return json({error:'已發布或封存貼文不可改變狀態；需保留發布紀錄'},409);if(body?.status==='pending_review')return submitForReview(request,env,profile,id,row);
    if(['draft','published','scheduled'].includes(body?.status)&&await activeExternalSchedule(env,id))return json({error:'此篇由Metricool管理；需Work先查證並更新／取消原UUID，再同步D1。不能只改本地狀態或冒充發布成功。'},409);
    if(body?.status==='approved'){if(clean(row.status)!=='pending_review'||row.scheduled_at||row.published_at)return json({error:'請先將未發布草稿送待審核，再進行16項人工圖文審核。'},409);if(await activeExternalSchedule(env,id))return json({error:'已有Metricool外部排程，不可重新核准'},409);try{await saveGate(env,row,body,profile)}catch(error){return json({error:clean(error?.message||error)},409)}const response=await app.fetch(request,env,ctx);if(!response.ok){await clearGate(env,id);return response}let metricool;try{metricool=await enqueueMetricool(env,await postRow(env,id),{gateState,fingerprint})}catch(error){metricool={ok:false,error:clean(error?.message||error)}}const result=await response.json();return json({...result,metricool},response.status)}
    if(body?.status==='published')return json({error:'正式已發布狀態只能經由可追溯的發布回執核對，不接受單純按鈕補登。'},409);
    if(body?.status==='scheduled'){const gate=await gateState(env,row);if(!gate.ok)return json({error:`正式發布守門：${gate.reason}`},409)}
    const response=await app.fetch(request,env,ctx);if(response.ok&&body?.status==='draft')await clearGate(env,id);return response
  }
  if(publishMatch&&request.method==='POST'){const authorization=await authorize(request,env,ctx);if(!authorization.ok)return authorization;const id=decodeURIComponent(publishMatch[1]),row=await postRow(env,id);if(!row)return json({error:'找不到貼文'},404);const gate=await gateState(env,row);if(!gate.ok)return json({error:`正式發布守門：${gate.reason}`},409);const errors=productMatchErrors(row);errors.push(...await duplicatePostErrors(env,row));if(errors.length)return json({error:'正式發布守門：圖文檢查未通過',details:[...new Set(errors)]},409);if(await metricoolOwns(env,id)){const result=await metricoolImmediate(env,row,{gateState,fingerprint});return json(result,result.ok?200:503)}return app.fetch(request,env,ctx)}
  if(postMatch&&['PUT','PATCH'].includes(request.method)){const authorization=await authorize(request,env,ctx);if(!authorization.ok)return authorization;const id=decodeURIComponent(postMatch[1]);const before=await postRow(env,id);if(!before)return json({error:'找不到貼文'},404);if(before.published_at||['published','archived','manual_required'].includes(clean(before.status)))return json({error:'已發布、封存或人工發布接手中的貼文不能直接編輯；請保留原發布紀錄'},409);if(await activeExternalSchedule(env,id))return json({error:'此篇已有Metricool外部排程；請先透過Work將原UUID退為草稿並同步，再修改圖文。'},409);const response=await app.fetch(request,env,ctx);if(response.ok)await invalidateEditedPost(env,id,before);return response}
  return app.fetch(request,env,ctx)
},async scheduled(controller,env,ctx){if(typeof app.scheduled==='function')return app.scheduled(controller,env,ctx)}};

export { reviewExistingImage, imageReviewContext, validOriginalImageReview, VERSION, REQUIRED_CHECKS, PRODUCT_RULES, REGENERATION_ROLES, CUSTOMER_INTERNAL_TERMS, SCENE_GROUPS, customerCopyErrors, duplicatePostErrors, productMatchErrors, semanticSceneErrors, isWeatherPost, checklistFrom, fingerprint, gateState, invalidateEditedPost, submitForReview, regenerationStart, regenerationReady };

