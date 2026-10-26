// Zero-neuron Cloudflare fallback: exact product facts and staff-only drafts.
// Never dispatch social replies or write a customer record from this route.
import {PRODUCTS,PRODUCT_MASTER_META} from './product-master-snapshot.js';
const HEADERS={'cache-control':'no-store','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff'};
const respond=(data,status=200)=>Response.json(data,{status,headers:HEADERS});
const blocked=(code,status=403)=>respond({ok:false,code,sent:false,aiUsed:false,humanReviewRequired:true},status);
const unsafe=/(?:糖尿|高血壓|癌|感冒|西藥|中藥|服藥|用藥|吃藥|合作|經銷|代理|代工|客訴|爭議|訂單|退貨|價錢|多少元|優惠|醫療|醫師|功效|過敏|孕婦|哺乳|手術|治癒|保證|治療|療效|疾病|改善|預防|關節|疲勞|卡卡|膠原蛋白|鈣質|補氣|生津|副作用|懷孕|醫師|藥物|多少錢|售價|報價|價格|成本|批發|折扣|促銷|訂購|運費|付款|退款|帳號|密碼|token|key|忽略|無視|指令|私訊|聯絡方式|電話|地址|手機|電子郵件|email|http|https|信用卡|身分證)/iu;
const pii=/(?:09\d{8}|[A-Z][12]\d{8}|\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b)/iu;
const LINE='如果需要其他資料或合作諮詢，歡迎透過仙加味官方 LINE 聯繫。';
export async function socialFactSuggestion(request,env,{authenticate}={}){
 if(request.method!=='POST')return blocked('method_not_allowed',405);
 if(typeof authenticate!=='function')return blocked('authentication_unavailable',503);
 let actor;
 try{actor=await authenticate(request,env);}catch{return blocked('access_required',401);}
 if(!['owner','admin','content','sales'].includes(actor?.role)||Number(actor?.active)!==1)
  return blocked('staff_role_required',403);
 if(!String(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))
  return blocked('json_required',400);
 const size=Number(request.headers.get('content-length')||0);
 if(size>2048)return blocked('payload_too_large',413);
 let data;
 try{const body=await request.text();if(new TextEncoder().encode(body).byteLength>2048)return blocked('payload_too_large',413);data=JSON.parse(body);}
 catch{return blocked('invalid_json',400);}
 if(!data||Array.isArray(data)||typeof data!=='object'||
    Object.keys(data).some(k=>!['productId','topic','question'].includes(k)))
  return blocked('invalid_request',422);
 const {productId,topic,question}=data;
 const product=PRODUCTS.find(p=>p.id===productId);
 if(!product||!['ingredients','specification'].includes(topic)||
    typeof question!=='string'||question.length<4||question.length>160)
  return blocked('unsupported_fact',422);
 if(unsafe.test(question)||pii.test(question)||/[<>\\]/.test(question))
  return blocked('manual_review_required',422);
 // An explicitly named formal product prevents either 龜鹿飲 size or a
 // second product from silently changing the intended answer.
 if(!question.includes(product.name)||PRODUCTS.some(p=>p.id!==product.id&&question.includes(p.name)))
  return blocked('ambiguous_product',422);
 const mentionsIngredients=/成分|配方|原料/u.test(question);
 const mentionsSpecs=/規格|容量|包裝|幾克|幾公克|幾cc|幾CC/u.test(question);
 if((topic==='ingredients'&&!mentionsIngredients)||
    (topic==='specification'&&!mentionsSpecs)||
    (mentionsIngredients&&mentionsSpecs))return blocked('ambiguous_topic',422);
 const facts=topic==='ingredients'?product.ingredients:product.allowedSpecs;
 if(!Array.isArray(facts)||facts.length<1||facts.some(x=>typeof x!=='string'||!x))
  return blocked('unverified_fact',422);
 const exact=topic==='ingredients'
   ?product.name+'的成分依序為：'+facts.join('、')+'。'
   :product.name+'的規格是'+facts.join('、')+'。';
 return respond({ok:true,mode:'zero_neuron_verified_fact',reply:exact+'\n'+LINE,
  productId:product.id,productMasterVersion:PRODUCT_MASTER_META.version,
  source:PRODUCT_MASTER_META.source,aiUsed:false,neuronsUsed:0,
  sent:false,autoReply:false,approved:false,humanReviewRequired:true,externalPublish:false});
}
