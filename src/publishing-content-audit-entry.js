import app from './publishing-only-entry.js';
import { productMatchErrors, duplicatePostErrors } from './publishing-review-gate-entry.js';

const VERSION='2026-08-16-content-image-audit-v6-lifestyle-brand-link';
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-xianjiawei-content-audit':VERSION};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const clean=value=>String(value??'').trim();
const uniq=items=>[...new Set(items.filter(Boolean))];
const RISKY=Object.freeze(['治療','治癒','療效','改善疾病','預防疾病','保證功效','保證改善','藥到病除','關節','卡卡','疲勞','精神不濟','補氣','生津','膠原蛋白','鈣質']);
const BLOCKED_PUBLIC_NAMES=Object.freeze(['台興山產']);
const LIFESTYLE_CONTEXT_TERMS=Object.freeze([
  '在家','居家','外出','通勤','工作空檔','工作','上班','早上','上午','下午','雨天','下雨','換季','早晚溫差','溫差',
  '悶熱','炎熱','夏天','冬天','春天','秋天','溫熱飲用','溫熱','熱水','家常料理','料理','燉湯','餐桌','保存整理','保存','冷藏','收納',
  'LINE 諮詢','LINE諮詢','諮詢','試喝前','試喝後','試喝','生活節奏','日常安排','隨身','出門'
]);
const BRAND_PRODUCT_LINK_TERMS=Object.freeze([
  '仙加味','龜鹿','龜鹿膏','龜鹿飲','30cc','180cc','龜鹿湯塊','湯塊','龜鹿膠','鹿茸粉','柒玄茶','龜鹿調飲粉',
  '試喝','LINE','溫熱飲用','保存方式','料理搭配','產品型態','怎麼選','下單'
]);
const LIFESTYLE_CATEGORY_TERMS=Object.freeze(['生活情境','生活提醒','日常','氣候','天氣','節氣','換季','生活']);

function publicText(row){return [row?.title,row?.headline,row?.copy,row?.category].filter(Boolean).join(' ')}
function publicVisibleText(row){return [row?.title,row?.headline,row?.copy,row?.category,row?.image_alt].filter(Boolean).join(' ')}
function imageText(row){return [row?.image_url,row?.image_alt,row?.image_source].filter(Boolean).join(' ')}
function normalizedImageUrl(value=''){return clean(value).split('#')[0].split('?')[0].toLowerCase()}
function hasAny(value,terms){const s=String(value||'').toLowerCase();return terms.some(term=>s.includes(String(term).toLowerCase()))}
function isFixedReusableImage(url=''){
  const value=normalizedImageUrl(url);
  return /\/images\/trial\//.test(value)||/\/images\/customer-display-v20260812\//.test(value)||/\/images\/dm-final\//.test(value)||/\/images\/brand\/approved-v405\/product-/.test(value);
}
function isVisuallyIncompleteSvg(url=''){
  const value=normalizedImageUrl(url);
  return /(?:\/images\/posts\/current-v20260815\/|\/images\/publishing\/generated-v20260815\/)[^/]+\.svg$/.test(value);
}
function isLegacyMascotVisual(row){
  const value=imageText(row).toLowerCase();
  if(/smallboss-v20260815/.test(value))return true;
  if(/\/images\/brand\/approved-v405\//.test(value)&&!/\/images\/brand\/approved-v405\/product-/.test(value))return true;
  return false;
}
function hasApproved2DMascotAuthority(row){
  const value=imageText(row).toLowerCase();
  return /rebuild-v20260816|approved[-_ ]?2d|user-approved-20260816|2026-08-16.*2d|2d.*小老闆/.test(value);
}
function isOverviewImage(row){return hasAny(imageText(row),['products-all','all-products','產品總覽','六項正式產品','六產品','全系列比較','全品項'])}
function isOverviewCopy(row){return hasAny([row?.title,row?.headline,row?.category].join(' '),['產品總覽','系列介紹','六項產品','全系列介紹','一次認識'])}
function productErrors(row){
  const errors=productMatchErrors(row);
  if(isOverviewImage(row)&&isOverviewCopy(row))return errors.filter(error=>!String(error).startsWith('文案提到「'));
  return errors;
}
function repeatedBrandInsideField(row){return [row?.title,row?.headline,row?.copy,row?.image_alt].filter(Boolean).some(value=>/仙加味\s*仙加味/.test(String(value)))}
function isHotWeatherTopic(row){return hasAny([row?.title,row?.headline,row?.category].join(' '),['天氣悶熱','天氣炎熱','炎熱天氣','悶熱天氣','高溫天氣','炎熱外出','悶熱外出'])}
function isRainTopic(row){return hasAny([row?.title,row?.headline,row?.category].join(' '),['下雨天','雨天','下雨','雨勢'])}
function isTemperatureTopic(row){return hasAny([row?.title,row?.headline,row?.category].join(' '),['早晚溫差','溫差提醒','換季','薄外套'])}
function isStorageTopic(row){return hasAny(row?.title,['保存方式','保存提醒','保存要','開封前後','開封後','保存重點','怎麼保存'])||['保存','保存方式','保存提醒'].includes(clean(row?.category))}
function isWarmTopic(row){return hasAny([row?.title,row?.category].join(' '),['溫熱飲用','想喝溫一點','溫熱後飲用','溫熱方式','溫飲'])}
function isLifestylePost(row){
  const category=clean(row?.category),subject=[row?.title,row?.headline,row?.category].filter(Boolean).join(' ');
  return hasAny(category,LIFESTYLE_CATEGORY_TERMS)||hasAny(subject,LIFESTYLE_CONTEXT_TERMS);
}
function lifestyleRuleErrors(row){
  if(!isLifestylePost(row))return[];
  const text=publicText(row),errors=[];
  if(!hasAny(text,LIFESTYLE_CONTEXT_TERMS))errors.push('生活文案缺少明確生活情境；需明確寫出在家、外出、工作空檔、時段、雨天、換季、溫差、溫熱飲用、料理、保存、LINE諮詢或試喝前後等具體場景');
  if(!hasAny(text,BRAND_PRODUCT_LINK_TERMS))errors.push('生活文案只有一般日常感受，缺少仙加味品牌或龜鹿產品／使用方式／試喝／LINE諮詢等實際連結');
  return errors;
}

function semanticErrors(row,liveRows=[]){
  const text=publicText(row),visible=publicVisibleText(row),image=imageText(row),errors=[];
  const imageUrl=normalizedImageUrl(row?.image_url);

  const risky=RISKY.find(term=>text.includes(term));
  if(risky)errors.push(`公開文案含不適合食品廣告的字詞「${risky}」`);
  const blocked=BLOCKED_PUBLIC_NAMES.find(term=>visible.includes(term));
  if(blocked)errors.push(`公開內容不得顯示舊名稱「${blocked}」`);
  if(repeatedBrandInsideField(row))errors.push('顧客可見單一欄位出現重複品牌字樣「仙加味仙加味」');
  errors.push(...lifestyleRuleErrors(row));

  if(isVisuallyIncompleteSvg(imageUrl)){
    errors.push('目前圖片屬於已確認在貼文中心實際顯示不完整的SVG合成圖；可能出現空白產品框、加號、只有文字或情境不足，不能進待審核／核准／排程／發布，需改用完整情境圖或正式產品圖');
  }
  if(isLegacyMascotVisual(row))errors.push('目前圖片仍引用舊版偏3D／拼湊式小老闆素材；新貼文必須改用2026-08-16使用者確認的2D精緻Q版小老闆');
  if(isLifestylePost(row)&&!isFixedReusableImage(imageUrl)&&!hasApproved2DMascotAuthority(row))errors.push('生活情境圖未標記為2026-08-16固定2D小老闆角色系統；需使用核准2D角色完整情境圖後再送審');

  if(imageUrl){
    const duplicated=liveRows.filter(other=>other.id!==row.id&&normalizedImageUrl(other.image_url)===imageUrl);
    if(duplicated.length)errors.push(`目前主圖與 ${duplicated.slice(0,3).map(other=>`「${clean(other.title)||other.id}」`).join('、')} 重複使用；每篇貼文都要改成符合該篇文案的專屬圖片`);
  }

  if(isOverviewImage(row)&&!isOverviewCopy(row))errors.push('目前使用「全系列／產品總覽」圖片，但本篇不是產品總覽主題；不能以同一張全系列圖代替比較、規格、使用方式或生活情境圖');
  if(hasAny(image,['brand-story'])&&!hasAny([row?.title,row?.category].join(' '),['品牌故事','萬華','四代','傳承']))errors.push('目前使用品牌故事圖，但本篇主題不是品牌傳承／萬華故事；需改成對應工序或內容情境圖');
  if(hasAny(image,['guide-how-to-use'])&&!hasAny([row?.title,row?.headline,row?.category].join(' '),['使用方式','怎麼使用','使用','熬製','火候','工序','傳統工藝']))errors.push('目前使用「怎麼使用／工序」情境圖，但本篇主題不是使用方式或工序；需改成對應本篇情境');
  if(hasAny(image,['faq.webp','faq情境'])&&!hasAny([row?.title,row?.headline,row?.category].join(' '),['faq','常見問題','問答']))errors.push('目前使用FAQ情境圖，但本篇不是FAQ主題；需改成對應本篇內容的圖片');
  if(hasAny(image,['recipes.webp','料理情境'])&&!hasAny([row?.title,row?.headline,row?.category].join(' '),['料理','燉湯','雞湯','排骨湯']))errors.push('目前使用料理圖，但本篇不是料理主題');

  if(isRainTopic(row)&&!hasAny(image,['rain','雨天','下雨','雨景','雨']))errors.push('文案主題是下雨／雨天情境，但圖片資訊沒有對應雨天場景');
  if(isHotWeatherTopic(row)&&!hasAny(image,['hot-weather','hydration','悶熱','炎熱','夏天','補水','水壺']))errors.push('文案主題是炎熱／悶熱天氣，但圖片資訊沒有對應炎熱、外出或補水情境');
  if(isTemperatureTopic(row)&&!hasAny(image,['temperature-coat','溫差','換季','外套']))errors.push('文案主題是早晚溫差／換季情境，但圖片資訊沒有對應薄外套或溫差場景');

  const seasons=[['春天',['spring','春天','春季']],['夏天',['summer','夏天','夏季']],['秋天',['autumn','fall','秋天','秋季']],['冬天',['winter','冬天','冬季']]].filter(([label])=>text.includes(label));
  if(seasons.length>1){if(!hasAny(image,['four-seasons','四季','春夏秋冬']))errors.push('文案同時描述多個季節，但圖片不是清楚的四季／多季節情境');}
  else if(seasons.length===1&&!hasAny(image,seasons[0][1]))errors.push(`文案指定「${seasons[0][0]}」，但圖片資訊沒有對應季節`);

  if(isStorageTopic(row)&&!hasAny(image,['storage','保存','冷藏','密封','冰箱','收納']))errors.push('本篇主題是保存方式，但圖片資訊沒有對應保存／冷藏／密封情境');
  if(hasAny([row?.title,row?.category].join(' '),['料理搭配','日常料理','燉湯','家庭料理'])&&!hasAny(image,['recipe','recipes','soup','料理','燉湯','雞湯','排骨湯','廚房','cooking']))errors.push('本篇主題是料理／燉湯，但圖片資訊沒有對應料理場景');
  if(isWarmTopic(row)&&!hasAny(image,['warm','溫熱','熱水','guide-how-to-use','combo','drink']))errors.push('文案主題是溫熱飲用，但圖片資訊沒有對應溫熱／熱水情境');
  if(clean(row?.category)==='生活情境'&&hasAny([row?.title,row?.headline,row?.copy].join(' '),['外出','工作空檔'])&&!hasAny(image,['outside','outdoor','work','外出','工作','通勤','隨身','home']))errors.push('本篇強調外出／工作空檔，但圖片資訊沒有對應外出、工作或居家工作場景');

  return uniq(errors);
}

async function authorize(request,env,ctx){
  const url=new URL('/api/me',request.url);
  return app.fetch(new Request(url,{method:'GET',headers:request.headers}),env,ctx);
}
async function postRow(env,id){return env?.DB?.prepare('SELECT * FROM social_posts WHERE id=? LIMIT 1').bind(id).first()}
async function liveRows(env){
  if(!env?.DB)return[];
  const result=await env.DB.prepare("SELECT id,title,headline,copy,category,image_url,image_alt,image_source,status FROM social_posts WHERE status<>'archived'").all();
  return result.results||[];
}
async function auditOne(env,row,rows){
  if(!row)return{ok:false,errors:['找不到貼文']};
  const errors=[...productErrors(row),...await duplicatePostErrors(env,row,rows),...semanticErrors(row,rows)];
  const unique=uniq(errors);
  return{ok:unique.length===0,errors:unique,recommended_action:unique.length?'修正文案或更換／重新生成符合情境的圖片':'進行16項人工圖文審核'};
}
async function batchAudit(request,env,ctx){
  const authorization=await authorize(request,env,ctx);if(!authorization.ok)return authorization;
  const url=new URL(request.url),all=url.searchParams.get('all')==='1',rows=await liveRows(env);
  const ids=all?rows.map(row=>row.id):(url.searchParams.get('ids')||'').split(',').map(decodeURIComponent).map(clean).filter(Boolean).slice(0,80);
  if(!ids.length)return json({version:VERSION,items:[],total:0,scope:all?'all':'selected'});
  const byId=new Map(rows.map(row=>[row.id,row])),items=[];
  for(const id of ids){const row=byId.get(id)||await postRow(env,id);items.push({id,...await auditOne(env,row,rows)});}
  return json({version:VERSION,total:items.length,problem_count:items.filter(item=>!item.ok).length,scope:all?'all':'selected',items});
}
async function readBody(request){try{return await request.clone().json()}catch{return{}}}
async function enforceBeforeWrite(request,env,ctx,id){
  const authorization=await authorize(request,env,ctx);if(!authorization.ok)return authorization;
  const row=await postRow(env,id);if(!row)return json({error:'找不到貼文'},404);
  const result=await auditOne(env,row,await liveRows(env));
  if(!result.ok)return json({error:'圖文完整檢查未通過，不能送審／核准／排程／發布',details:result.errors,content_audit_version:VERSION},409);
  return null;
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),path=url.pathname;
    if(request.method==='GET'&&path==='/api/posts/content-audit')return batchAudit(request,env,ctx);
    const statusMatch=path.match(/^\/api\/posts\/([^/]+)\/status$/),publishMatch=path.match(/^\/api\/posts\/([^/]+)\/publish-now$/);
    if(statusMatch&&request.method==='POST'){
      const body=await readBody(request);
      if(['pending_review','approved','scheduled','published'].includes(clean(body?.status))){const blocked=await enforceBeforeWrite(request,env,ctx,decodeURIComponent(statusMatch[1]));if(blocked)return blocked;}
    }
    if(publishMatch&&request.method==='POST'){const blocked=await enforceBeforeWrite(request,env,ctx,decodeURIComponent(publishMatch[1]));if(blocked)return blocked;}
    const response=await app.fetch(request,env,ctx);
    if(request.method==='GET'&&['/healthz','/healthz/core'].includes(path)){
      try{const body=await response.clone().json();return json({...body,contentImageAuditVersion:VERSION,duplicateImageHardGate:true,seasonWeatherContextAudit:true,semanticImageMatchHardGate:true,topicIntentAware:true,visualRenderIntegrityHardGate:true,unsafePostingSvgBlocked:true,fullLibraryAudit:true,strictUniqueImagePerPost:true,lifestyleSceneRequired:true,lifestyleBrandOrProductLinkRequired:true,approved2DMascotRequired:true,blockedOldPublicName:true},response.status)}catch{return response}
    }
    return response;
  },
  async scheduled(controller,env,ctx){if(typeof app.scheduled==='function')return app.scheduled(controller,env,ctx)}
};

export {VERSION,normalizedImageUrl,isFixedReusableImage,isVisuallyIncompleteSvg,isLegacyMascotVisual,hasApproved2DMascotAuthority,isLifestylePost,lifestyleRuleErrors,semanticErrors,auditOne,isHotWeatherTopic,isRainTopic,isTemperatureTopic,isStorageTopic,isWarmTopic};
