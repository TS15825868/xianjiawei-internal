const PRODUCTS=Object.freeze([
  {id:'guilu-gao',name:'龜鹿膏',allowedSpecs:['100g／罐'],ingredients:['鹿角萃取物','龜板萃取物','枸杞','紅棗','黃耆','粉光蔘'],usagePrimary:'食用時間可依個人使用習慣與作息時間安排'},
  {id:'guilu-drink-30',name:'龜鹿飲30cc玻璃罐',allowedSpecs:['30cc／罐（小玻璃罐）'],ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆']},
  {id:'guilu-drink-180',name:'龜鹿飲180cc鋁袋',allowedSpecs:['180cc／包（鋁袋）'],ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆']},
  {id:'guilu-tangkuai',name:'龜鹿湯塊',allowedSpecs:['75g （2兩）／盒｜8塊裝'],ingredients:['龜板萃取物','鹿角萃取物'],detailUnitApprox:'每塊約9.375g'},
  {id:'guilu-jiao',name:'龜鹿膠',allowedSpecs:['600g （1斤）／盒｜32塊裝'],ingredients:['龜板萃取物','鹿角萃取物'],detailUnitApprox:'每塊約18.75 g'},
  {id:'luerong-fen',name:'鹿茸粉',allowedSpecs:['75g／罐'],ingredients:['鹿茸']}
]);
const BY_NAME=new Map(PRODUCTS.map(item=>[item.name,item]));
const clean=value=>String(value??'').trim();
const PRODUCT_NAMES=PRODUCTS.map(item=>item.name);
const POST_IMAGE_RULES=Object.freeze([
  {id:'guilu-gao',copy:[/龜鹿膏/i],image:[/guilu-gao/i,/龜鹿膏/i]},
  {id:'guilu-drink-30',copy:[/龜鹿飲\s*30\s*cc/i,/30\s*cc/i],image:[/guilu-drink-30/i,/龜鹿飲\s*30\s*cc/i,/30\s*cc/i]},
  {id:'guilu-drink-180',copy:[/龜鹿飲\s*180\s*cc/i,/180\s*cc/i],image:[/guilu-drink-180/i,/龜鹿飲\s*180\s*cc/i,/180\s*cc/i]},
  {id:'guilu-tangkuai',copy:[/龜鹿湯塊/i,/湯塊/i],image:[/guilu-tangkuai/i,/龜鹿湯塊/i,/湯塊/i]},
  {id:'guilu-jiao',copy:[/龜鹿膠/i],image:[/guilu-jiao/i,/龜鹿膠/i]},
  {id:'luerong-fen',copy:[/鹿茸粉/i],image:[/luerong-fen/i,/鹿茸粉/i]}
]);
const RETIRED_MEDIA_MARKERS=Object.freeze([
  'legacy-reference-only','deprecated-reference-only','preflight-rejected-reference-only','superseded-reference-only'
]);

function normalizedName(name,spec=''){
  const value=clean(name),size=clean(spec);
  if(value==='龜鹿飲'&&size.startsWith('30cc'))return '龜鹿飲30cc玻璃罐';
  if(value==='龜鹿飲'&&size.startsWith('180cc'))return '龜鹿飲180cc鋁袋';
  return value;
}
function ingredientList(value=''){
  if(Array.isArray(value))return value.map(clean).filter(Boolean);
  return clean(value).split(/[、,，;；\n\r]+/).map(clean).filter(Boolean);
}
function sameList(left,right){return JSON.stringify(left)===JSON.stringify(right);}

function productSegments(text='',target=''){
  const source=String(text||''),segments=[];
  let start=0;
  while(target){
    const pos=source.indexOf(target,start);
    if(pos<0)break;
    let end=source.length;
    const after=pos+target.length;
    for(const name of PRODUCT_NAMES){
      const next=source.indexOf(name,after);
      if(next>=0)end=Math.min(end,next);
    }
    segments.push(source.slice(pos,end));
    start=after;
  }
  return segments;
}

function publicProductContextErrors(text=''){
  const source=String(text||''),errors=[];
  if(/30\s*cc/i.test(source)&&/(玻璃瓶|小玻璃瓶|30\s*cc\s*／\s*瓶|30\s*cc\s*瓶裝)/i.test(source)){
    errors.push('30cc正式產品必須使用「龜鹿飲30cc玻璃罐／30cc／罐（小玻璃罐）」，不得稱瓶。');
  }
  if(/建議白天飲用/.test(source))errors.push('龜鹿飲不設定固定白天時段；飲用時間請依個人使用習慣與作息安排。');
  for(const segment of productSegments(source,'龜鹿膏')){
    if(/(一天一次一小匙|每日一次一小匙|早晚各一小匙|每日早上及下午各一小匙)/.test(segment))errors.push('龜鹿膏不設定固定早上／下午時段；食用時間可依個人使用習慣與作息時間安排。');
  }
  for(const segment of productSegments(source,'龜鹿飲30cc玻璃罐')){
    if(/(每日一罐|每日\s*1\s*罐)/.test(segment))errors.push('龜鹿飲30cc目前使用方式為「每日 1-2罐」；飲用時間依個人使用習慣與作息安排。');
  }
  for(const segment of productSegments(source,'龜鹿湯塊')){
    if(/(300\s*g|600\s*g)/i.test(segment))errors.push('龜鹿湯塊正式主規格只有「75g （2兩）／盒｜8塊裝」。');
  }
  for(const segment of productSegments(source,'龜鹿膠')){
  }
  return [...new Set(errors)];
}

export function validatePublicProductText(text=''){
  return publicProductContextErrors(text);
}

export function validateProductRecord(body={},options={}){
  const name=clean(body?.name),spec=clean(body?.specification||body?.spec);
  if(options.partial&&(!name||!spec))return [];
  const normalized=normalizedName(name,spec),product=BY_NAME.get(normalized);
  if(!product)return [`產品中心只允許六項正式產品，目前名稱「${name||'未填'}」不在正式清單。`];
  const errors=[];
  if(!product.allowedSpecs.includes(spec))errors.push(`${product.name}規格不在目前完整正式主規格清單。`);
  const ingredients=ingredientList(body?.ingredients);
  if(ingredients.length&&!sameList(ingredients,product.ingredients))errors.push(`${product.name}正式成分或順序不同步；請使用目前確認的正式成分。`);
  const usage=clean(body?.usage);
  if(product.usagePrimary&&usage&&!usage.includes(product.usagePrimary))errors.push(`${product.name}使用方式必須包含「${product.usagePrimary}」。`);
  errors.push(...validatePublicProductText(`${normalized} ${spec}\n${usage}`));
  return [...new Set(errors)];
}

function detectedIds(value='',field='copy'){
  const source=String(value||'');
  return POST_IMAGE_RULES.filter(rule=>(rule[field]||[]).some(re=>re.test(source))).map(rule=>rule.id);
}
export function validatePostImageMatch(body={}){
  const copyText=[body?.title,body?.headline,body?.copy,body?.category].filter(Boolean).join('\n');
  const imageText=[body?.image_url,body?.image_alt,body?.image_source].filter(Boolean).join('\n');
  const errors=[];
  if(/\/images\/products-v2\//i.test(imageText))errors.push('圖片仍引用舊 products-v2，不能作為正式貼文產品圖。');
  if(RETIRED_MEDIA_MARKERS.some(marker=>imageText.toLowerCase().includes(marker)))errors.push('圖片來源已由目前資產權威標記為退役／只供參考，不能作為正式貼文媒體。');
  if(/generated-v20260808-(?:priority1|preflight)/i.test(imageText)&&/\.svg(?:[?#]|$)/i.test(imageText))errors.push('圖片仍是已退回的舊候選SVG，請重新生成或換正式候選圖。');
  const mentioned=[...new Set(detectedIds(copyText,'copy'))];
  const imageIds=[...new Set(detectedIds(imageText,'image'))];
  if(mentioned.length===1&&imageIds.length&&!imageIds.includes(mentioned[0])){
    const expected=PRODUCTS.find(p=>p.id===mentioned[0])?.name||mentioned[0];
    const actual=imageIds.map(id=>PRODUCTS.find(p=>p.id===id)?.name||id).join('、');
    errors.push(`圖文產品不匹配：文案主產品是「${expected}」，圖片資訊卻指向「${actual}」。`);
  }
  return [...new Set(errors)];
}

export function validatePostPayload(body={}){
  const textErrors=validatePublicProductText([
    body?.title,body?.headline,body?.copy,body?.category,body?.image_alt,body?.image_source
  ].filter(Boolean).join('\n'));
  return [...new Set([...textErrors,...validatePostImageMatch(body)])];
}

export const PRODUCT_AUTHORITY=Object.freeze({
  version:'current-server-product-authority-v4-20260815-2li-1jin',
  productCount:6,
  soupBlockMain:'75g （2兩）／盒｜8塊裝',
  soupBlockDetail:'每塊約9.375g（顧客文字可顯示）',
  guiluJiaoMain:'600g （1斤）／盒｜32塊裝',
  guiluJiaoDetail:'每塊約18.75 g（顧客文字可顯示）',
  guiluGaoUsagePrimary:'食用時間可依個人使用習慣與作息時間安排',
  guiluDrink30UsagePrimary:'每日 1-2罐；飲用時間可依個人使用習慣與作息時間安排',
  guiluDrink180UsagePrimary:'每日一包；飲用時間可依個人使用習慣與作息時間安排',
  postImageMatchBlocking:true,
  mediaGuardPolicy:'current-media-role-and-product-match; customer-display main / dm-final detailed DM / 8-14 trial / products-v3 identity-reference; no historical-version pin',
  products:PRODUCTS
});
