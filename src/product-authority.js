const PRODUCTS=Object.freeze([
  {id:'guilu-gao',name:'龜鹿膏',allowedSpecs:['100g／罐'],ingredients:['鹿角萃取物','龜板萃取物','枸杞','紅棗','黃耆','粉光蔘'],usagePrimary:'一天一次一小匙'},
  {id:'guilu-drink-30',name:'龜鹿飲30cc玻璃罐',allowedSpecs:['30cc／罐（小玻璃罐）'],ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆']},
  {id:'guilu-drink-180',name:'龜鹿飲180cc鋁袋',allowedSpecs:['180cc／包（鋁袋）'],ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆']},
  {id:'guilu-tangkuai',name:'龜鹿湯塊',allowedSpecs:['75g／盒｜8塊裝'],ingredients:['龜板萃取物','鹿角萃取物']},
  {id:'guilu-jiao',name:'龜鹿膠',allowedSpecs:['600g／盒｜32塊裝'],ingredients:['龜板萃取物','鹿角萃取物']},
  {id:'luerong-fen',name:'鹿茸粉',allowedSpecs:['75g／罐'],ingredients:['鹿茸']}
]);
const BY_NAME=new Map(PRODUCTS.map(item=>[item.name,item]));
const clean=value=>String(value??'').trim();
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

function soupWeightErrors(text=''){
  const source=String(text||''),labels=['龜鹿湯塊','龜鹿膠','龜鹿膏','鹿茸粉'],errors=[];
  const re=/(?<!\d)(\d+(?:\.\d+)?)\s*g/gi;
  let match;
  while((match=re.exec(source))){
    const number=Number(match[1]);
    if(!Number.isFinite(number)||number<50)continue;
    const before=source.slice(Math.max(0,match.index-80),match.index);
    let best=-1,label='';
    for(const candidate of labels){const position=before.lastIndexOf(candidate);if(position>best){best=position;label=candidate;}}
    if(label==='龜鹿湯塊'&&Math.abs(number-75)>0.001)errors.push(`龜鹿湯塊只能使用75g／盒，目前出現${match[0]}`);
  }
  return errors;
}

export function validatePublicProductText(text=''){
  const source=String(text||''),errors=[...soupWeightErrors(source)];
  if(/30\s*cc/i.test(source)&&/(玻璃瓶|小玻璃瓶|30\s*cc\s*／\s*瓶|30\s*cc\s*瓶裝)/i.test(source))errors.push('30cc正式產品必須使用「龜鹿飲30cc玻璃罐／30cc／罐（小玻璃罐）」，不得稱瓶。');
  if(source.includes('龜鹿膏')&&/(每日早上及下午各一小匙|早上及下午各一小匙|早晚各一小匙)/.test(source))errors.push('龜鹿膏目前正式使用資料為「一天一次一小匙」，不得回退舊的早晚各一次版本。');
  if(source.includes('龜鹿湯塊')&&/(每塊約?\s*9\.375\s*g)/i.test(source))errors.push('龜鹿湯塊顧客正式規格目前統一為「75g／盒｜8塊裝」，不要再硬帶舊每塊重量延伸字樣。');
  if(source.includes('龜鹿膠')&&/(1\s*斤|每塊約?\s*18\.75\s*g)/i.test(source))errors.push('龜鹿膠顧客正式規格目前統一為「600g／盒｜32塊裝」，不要再硬帶舊1斤／每塊重量延伸字樣。');
  return [...new Set(errors)];
}

export function validateProductRecord(body={},options={}){
  const name=clean(body?.name),spec=clean(body?.specification||body?.spec);
  if(options.partial&&(!name||!spec))return [];
  const normalized=normalizedName(name,spec),product=BY_NAME.get(normalized);
  if(!product)return [`產品中心只允許六項正式產品，目前名稱「${name||'未填'}」不在正式清單。`];
  const errors=[];
  if(!product.allowedSpecs.includes(spec))errors.push(`${product.name}規格不在目前完整正式規格清單。`);
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
  const imageUrl=clean(body?.image_url);
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
  if(mentioned.length&&/\/images\/products-v3\//i.test(imageUrl)&&imageIds.length&&!imageIds.some(id=>mentioned.includes(id))){
    errors.push('正式產品主圖與貼文提到的產品不一致，請換成對應 products-v3 原圖。');
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
  version:'current-server-product-authority',
  productCount:6,
  soupBlockOnly:'75g／盒｜8塊裝',
  guiluGaoUsagePrimary:'一天一次一小匙',
  postImageMatchBlocking:true,
  mediaGuardPolicy:'current-asset-status-and-product-match; directory names are not rejection criteria',
  products:PRODUCTS
});
