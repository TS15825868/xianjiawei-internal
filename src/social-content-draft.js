// Owner-only Workers AI social caption drafts. Never creates approval, media or publish calls.
// Separate from customer service product-fact drafts; requires explicit verified free-plan flags.
import {PRODUCTS, PRODUCT_MASTER_META} from './product-master-snapshot.js';
const MODEL='@cf/google/gemma-4-26b-a4b-it';
const HEADERS={'cache-control':'no-store','content-type':'application/json; charset=utf-8'};
const CATEGORIES=new Set(['生活','產品','料理','食材','閒聊','關心','節慶','品牌','互動','氣候','季節']);
const BLOCKED=/台興山產|龜鹿膠|龜鹿湯塊|柒玄茶|治療|治癒|改善疾病|預防疾病|降血壓|降血糖|關節|卡卡|疲勞|精神不濟|補氣|生津|膠原蛋白|鈣質|保證功效|優惠價|特價|下單送|批發價/iu;
const PRIVATE=/09\d{8}|[A-Z][12]\d{8}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|密碼|api.?key|access.?token|system prompt|ignore previous|無視指令|https?:\/\//iu;
const send=(data,status=200)=>Response.json(data,{status,headers:HEADERS});
const deny=(code,status=403)=>send({ok:false,code,published:false,scheduled:false,approved:false,humanApprovalRequired:true},status);
function safeString(v,max){return typeof v==='string'&&v.trim().length>0&&v.trim().length<=max&&!/[<>\\]/.test(v)&&!PRIVATE.test(v);}
function modelText(v){return typeof v?.response==='string'?v.response:typeof v?.choices?.[0]?.message?.content==='string'?v.choices[0].message.content:null;}
function parseResult(raw){
 if(typeof raw!=='string'||raw.length>3000)return null;
 try{
  const clean=raw.trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
  const v=JSON.parse(clean);
  if(!v||Array.isArray(v)||typeof v!=='object')return null;
  return {copy:v.copy,sceneBrief:v.sceneBrief,imageAlt:v.imageAlt};
 }catch{return null;}
}
function validateOutput(result,product){
 if(!result||!safeString(result.copy,480)||result.copy.length<45||
    !safeString(result.sceneBrief,220)||result.sceneBrief.length<20||
    !safeString(result.imageAlt,160)||result.imageAlt.length<12)return false;
 const all=[result.copy,result.sceneBrief,result.imageAlt].join(' ');
 if(BLOCKED.test(all)||PRIVATE.test(all)||!result.copy.includes('仙加味'))return false;
 if(product&&!result.copy.includes(product.name))return false;
 if(PRODUCTS.some(p=>p.id!==product?.id&&result.copy.includes(p.name)))return false;
 if(/(?:今天|明天)(?:必定|一定)?(?:會下雨|有寒流|高溫|豪雨)/u.test(result.copy))return false;
 return true;
}
export async function socialContentDraft(request,env,{authenticate}={}){
 if(request.method!=='POST')return deny('method_not_allowed',405);
 if(typeof authenticate!=='function')return deny('access_unavailable',503);
 let profile;
 try{profile=await authenticate(request,env);}catch{return deny('access_not_verified',401);}
 if(!profile||Number(profile.active)!==1||!['owner','admin','content'].includes(profile.role))return deny('role_denied');
 if(env?.XJW_SOCIAL_CONTENT_DRAFT_ENABLED!=='true'||env?.XJW_AI_FREE_ACCOUNT_CONFIRMED!=='true')
  return deny('verified_free_ai_not_enabled',503);
 if(typeof env?.AI?.run!=='function')return deny('ai_binding_unavailable',503);
 if(!String(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return deny('invalid_payload',400);
 const length=Number(request.headers.get('content-length')||0);
 if(length>6000)return deny('payload_too_large',413);
 let body;
 try{const raw=await request.text();if(new TextEncoder().encode(raw).length>6000)return deny('payload_too_large',413);body=JSON.parse(raw);}catch{return deny('invalid_payload',400);}
 if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['topic','category','sceneBrief','candidateDate','productId','persist'].includes(k)))
  return deny('invalid_payload',400);
 const {topic,category,sceneBrief,candidateDate,productId,persist=false}=body;
 if(!safeString(topic,100)||!safeString(sceneBrief,220)||!CATEGORIES.has(category)||PRIVATE.test(topic+' '+sceneBrief)||BLOCKED.test(topic+' '+sceneBrief)||
    (candidateDate!=null&&(!/^20\d{2}-\d{2}-\d{2}$/.test(candidateDate)||Number.isNaN(Date.parse(candidateDate+'T00:00:00Z'))))||
    (persist!==true&&persist!==false))return deny('unverified_content_scope',422);
 const product=productId==null?null:PRODUCTS.find(p=>p.id===productId);
 if(productId!=null&&!product)return deny('unverified_or_retired_product',422);
 if(persist&&!candidateDate)return deny('candidate_date_required',422);
 const facts=product?{name:product.name,allowedSpecs:product.allowedSpecs,usage:'只可說明產品形式，不臆測用量、功效、價格或成分'}:null;
 const system='你是「仙加味」內部社群文案產稿器。只輸出嚴格JSON物件，鍵為copy、sceneBrief、imageAlt，使用繁體中文。copy 80~200字，描述具體生活場景、自然提及仙加味、最後可加入一個互動問題。不得醫療療效宣稱、價格、虛構優惠、即時天氣、杜撰節日。情境需可繪製為正式Q版小老闆（短黑髮、米白中式上衣、深橄欖綠圍裙、紅色仙加味印章），小鹿與小烏龜分開。產品只能引用官方真實原圖，絕不要求生成新包裝。JSON外不得有文字或Markdown。產品資訊僅能使用提供的正式事實。';
 let raw;
 try{raw=await env.AI.run(MODEL,{messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({topic,category,sceneBrief,date:candidateDate||null,verifiedProductFacts:facts})}],max_tokens:550,chat_template_kwargs:{enable_thinking:false}});}catch{return deny('model_unavailable',503);}
 const result=parseResult(modelText(raw));
 if(!validateOutput(result,product))return deny('model_output_needs_human',422);
 const now=new Date().toISOString();
 const record={id:crypto.randomUUID(),topic,category,copy:result.copy,sceneBrief:result.sceneBrief,imageAlt:result.imageAlt,
  candidateDate:candidateDate||null,productId:product?.id||null,productMasterVersion:PRODUCT_MASTER_META.version,
  model:MODEL,aiUsed:true,status:'draft',imageUrl:'',imageStatus:'pending_formal_scene_asset',
  ai16Review:'not_run',humanApprovalRequired:true,humanApproved:false,
  scheduled:false,published:false,autoPublish:false};
 if(!persist)return send({ok:true,mode:'preview_only',persisted:false,draft:record});
 if(!env?.DB?.prepare)return deny('d1_unavailable',503);
 // No image is present: D1 can only receive an unscheduled, unapproved draft.
 try{
  const existing=await env.DB.prepare("SELECT id FROM social_posts WHERE title=? OR copy=? LIMIT 1").bind(topic,result.copy).first();
  if(existing)return send({ok:false,code:'duplicate_draft',existingId:existing.id,humanApprovalRequired:true},409);
  const proposedAt=candidateDate+'T10:00:00+08:00',id='XJW-AI-DRAFT-'+crypto.randomUUID();
  const sql="INSERT INTO social_posts(id,title,headline,copy,category,platforms_json,status,scheduled_at,proposed_scheduled_at,image_url,image_alt,image_source,image_approved,image_width,image_height,image_bytes,image_quality_status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,'draft',NULL,?,'',?,'ai_scene_brief_pending_asset',0,0,0,0,'pending',?,?,?)";
  const applied=await env.DB.prepare(sql).bind(id,topic,'',result.copy,category,JSON.stringify(['Facebook','Instagram','Threads']),proposedAt,result.imageAlt,profile.email,now,now).run();
  if(applied?.success!==true)return deny('d1_write_unconfirmed',503);
  const readBack=await env.DB.prepare('SELECT id,status,image_url,approved_at,scheduled_at,copy FROM social_posts WHERE id=? LIMIT 1').bind(id).first();
  if(readBack?.id!==id||readBack?.status!=='draft'||readBack?.image_url||readBack?.approved_at||readBack?.scheduled_at||readBack?.copy!==result.copy)
   return deny('d1_readback_mismatch',503);
  return send({ok:true,mode:'persisted_draft_only',persisted:true,draft:{...record,id},d1ReadbackVerified:true});
 }catch{return deny('d1_unavailable_or_write_failed',503);}
}
export {validateOutput};
