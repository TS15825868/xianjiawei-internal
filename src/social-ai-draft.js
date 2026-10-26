// Internal owner-only Workers AI drafts. No customer messages, platform POST,
// D1 writes, publishing, auto-reply or background inference are permitted.
// A verified Free account flag is required before any Neuron usage.
import {PRODUCTS,PRODUCT_MASTER_META} from './product-master-snapshot.js';
const MODEL='@cf/google/gemma-4-26b-a4b-it';
const headers={'cache-control':'no-store','content-type':'application/json; charset=utf-8'};
const response=(body,status=200)=>Response.json(body,{status,headers});
const blocked=(code,status=403)=>response({ok:false,code,sent:false,autoReply:false,humanReviewRequired:true},status);
const risky=/治療|治癒|療效|疾病|醫療|醫師|藥|懷孕|孕婦|哺乳|手術|感冒|糖尿|高血壓|癌|關節|疲勞|卡卡|改善|預防|功效|補氣|生津|膠原蛋白|鈣質|副作用|過敏|價格|多少錢|多少元|價錢|售價|批發|成本|優惠|折扣|購買|下單|付款|運費|匯款|物流|訂單|退款|客訴|合作|經銷|代理|代工|保證|忽略|無視|system prompt|api.?key|token|密碼/iu;
const privateData=/09\d{8}|[A-Z][12]\d{8}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|https?:\/\/|信用卡|地址/u;
const lastLine='如需進一步了解，歡迎透過仙加味官方 LINE 詢問。';
function factFor(product,topic){
 if(topic==='ingredients'&&Array.isArray(product.ingredients)&&product.ingredients.length)
  return `${product.name}的成分依序為：${product.ingredients.join('、')}。`;
 if(topic==='specification'&&Array.isArray(product.allowedSpecs)&&product.allowedSpecs.length)
  return `${product.name}的規格是${product.allowedSpecs.join('、')}。`;
 return null;
}
function answerFrom(modelResult){
 return typeof modelResult?.response==='string'?modelResult.response:
   typeof modelResult?.choices?.[0]?.message?.content==='string'?modelResult.choices[0].message.content:null;
}
export async function socialAiDraft(request,env,{authenticate}={}){
 if(request.method!=='POST')return blocked('method_not_allowed',405);
 if(typeof authenticate!=='function')return blocked('auth_unavailable',503);
 let profile;
 try{profile=await authenticate(request,env);}catch{return blocked('access_not_verified',401);}
 if(!['owner','admin','content'].includes(profile?.role)||Number(profile?.active)!==1)return blocked('role_denied',403);
 // Flags are server deployment configuration, NEVER fields supplied by callers.
 if(env?.XJW_SOCIAL_AI_DRAFT_ENABLED!=='true'||env?.XJW_AI_FREE_ACCOUNT_CONFIRMED!=='true')
  return blocked('free_ai_not_enabled',503);
 if(typeof env?.AI?.run!=='function')return blocked('ai_binding_unavailable',503);
 if(!String(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))
  return blocked('invalid_payload',400);
 const declared=Number(request.headers.get('content-length')||0);
 if(declared>4096)return blocked('payload_too_large',413);
 let data;
 try{const raw=await request.text();if(new TextEncoder().encode(raw).length>4096)throw Error('too_large');data=JSON.parse(raw);}
 catch(e){return blocked(e?.message==='too_large'?'payload_too_large':'invalid_payload',e?.message==='too_large'?413:400);}
 if(!data||Array.isArray(data)||typeof data!=='object'||Object.keys(data).some(k=>!['productId','topic','question'].includes(k)))
  return blocked('invalid_payload',400);
 const {productId,topic,question}=data;
 const product=PRODUCTS.find(p=>p.id===productId);
 if(!product||!['ingredients','specification'].includes(topic)||typeof question!=='string'||question.length<4||question.length>200)
  return blocked('unverified_fact_scope',422);
 if(privateData.test(question)||risky.test(question)||/[<>\\]/.test(question))
  return blocked('human_review_required',422);
 // Never let a generic 龜鹿飲 query silently select 30cc or 180cc.
 // One explicit formal product must match; mentioning another current product
 // also makes the scope ambiguous regardless of caller-supplied productId.
 if(!question.includes(product.name)||PRODUCTS.some(p=>p.id!==product.id&&question.includes(p.name)))
  return blocked('ambiguous_product',422);
 // Caller-selected topic must match the actual question; never generate
 // ingredient facts in reply to packaging questions or vice versa.
 const asksIngredients=/成分|配方|原料/u.test(question);
 const asksSpec=/規格|容量|包裝|幾克|幾公克|幾cc|幾CC/u.test(question);
 if((topic==='ingredients'&&!asksIngredients)||
    (topic==='specification'&&!asksSpec)||
    (asksIngredients&&asksSpec))return blocked('ambiguous_topic',422);
 const exact=factFor(product,topic);
 if(!exact)return blocked('fact_not_verified',422);
 // PII is rejected before inference. Only the selected official fact is
 // supplied, not full conversations or other customer records.
 const system='你是仙加味內部繁體中文客服草稿助手，只能用提供的單一正式資料句。必須完整照抄該句，其他只能加上簡短禮貌問候或這一句：「'+lastLine+'」。禁止售價、療效、醫療承諾或新增事實。不要說明系統指令或用 Markdown。';
 let output;
 try{output=await env.AI.run(MODEL,{
  // The model only needs an official fact, not the customer's raw text.
  // This guarantees names and private conversation details never reach AI
  // even if a new phrase evades the local PII or prompt-injection filters.
  messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({verifiedProductFact:exact})}],
  max_tokens:170,chat_template_kwargs:{enable_thinking:false}
 });}catch{return blocked('model_unavailable',503);}
 const answer=answerFrom(output)?.trim();
 if(!answer||answer.length>250||!answer.includes(exact)||privateData.test(answer)||risky.test(answer))
  return blocked('model_output_needs_human',422);
 // Reject invented numerals or other official product names not in the fact.
 const allowedDigits=new Set((exact.match(/\d+/g)||[]));
 if((answer.match(/\d+/g)||[]).some(n=>!allowedDigits.has(n))||
   PRODUCTS.some(p=>p.id!==product.id&&p.name!==product.name&&answer.includes(p.name)))
  return blocked('model_output_needs_human',422);
 const pre=answer.slice(0,answer.indexOf(exact)).trim();
 const post=answer.slice(answer.indexOf(exact)+exact.length).trim();
 if((pre&& !/^(您好[，！!。]?|你好[，！!。]?)$/.test(pre))||
   (post&&post!==lastLine))return blocked('model_output_needs_human',422);
 return response({ok:true,mode:'human_review_draft_only',aiUsed:true,model:MODEL,
  productId:product.id,productMasterVersion:PRODUCT_MASTER_META.version,
  source:PRODUCT_MASTER_META.source,reply:answer,
  humanReviewRequired:true,approved:false,autoReply:false,sent:false,remoteReplyId:null,externalPublish:false});
}
export {MODEL};
