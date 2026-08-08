const PRODUCTS=Object.freeze([
  {id:'guilu-gao',name:'龜鹿膏',allowedSpecs:['100g／罐'],ingredients:['鹿角萃取物','龜板萃取物','枸杞','紅棗','黃耆','粉光蔘'],usagePrimary:'每日早上及下午各一小匙'},
  {id:'guilu-drink-30',name:'龜鹿飲30cc玻璃罐',allowedSpecs:['30cc／罐','30cc／罐（小玻璃罐）'],ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆']},
  {id:'guilu-drink-180',name:'龜鹿飲180cc鋁袋',allowedSpecs:['180cc／包','180cc／包（鋁袋）'],ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆']},
  {id:'guilu-tangkuai',name:'龜鹿湯塊',allowedSpecs:['75g／盒','75g／盒｜8塊裝｜每塊約9.375g'],ingredients:['龜板萃取物','鹿角萃取物']},
  {id:'guilu-jiao',name:'龜鹿膠',allowedSpecs:['600g（1斤）／盒','600g（1斤）／盒｜32塊裝｜每塊約18.75g'],ingredients:['龜板萃取物','鹿角萃取物']},
  {id:'luerong-fen',name:'鹿茸粉',allowedSpecs:['75g／罐'],ingredients:['鹿茸']}
]);
const BY_NAME=new Map(PRODUCTS.map(item=>[item.name,item]));
const clean=value=>String(value??'').trim();

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
  if(/30\s*cc/i.test(source)&&/(玻璃瓶|小玻璃瓶|30\s*cc\s*／\s*瓶)/i.test(source))errors.push('30cc正式產品必須使用「龜鹿飲30cc玻璃罐／30cc／罐」，不得稱瓶。');
  if(source.includes('龜鹿膏')&&source.includes('每天一次，每次一小匙'))errors.push('龜鹿膏正式使用資料已更新為「每日早上及下午各一小匙」，不得使用舊的一日一次版本。');
  return [...new Set(errors)];
}

export function validateProductRecord(body={},options={}){
  const name=clean(body?.name),spec=clean(body?.specification||body?.spec);
  if(options.partial&&(!name||!spec))return [];
  const normalized=normalizedName(name,spec),product=BY_NAME.get(normalized);
  if(!product)return [`產品中心只允許六項正式產品，目前名稱「${name||'未填'}」不在正式清單。`];
  const errors=[];
  if(!product.allowedSpecs.includes(spec))errors.push(`${product.name}規格不在目前正式規格清單。`);
  const ingredients=ingredientList(body?.ingredients);
  if(ingredients.length&&!sameList(ingredients,product.ingredients))errors.push(`${product.name}正式成分或順序不同步；請使用目前確認的正式成分。`);
  const usage=clean(body?.usage);
  if(product.usagePrimary&&usage&&!usage.includes(product.usagePrimary))errors.push(`${product.name}使用方式必須包含「${product.usagePrimary}」。`);
  errors.push(...validatePublicProductText(`${normalized} ${spec}\n${usage}`));
  return [...new Set(errors)];
}

export function validatePostPayload(body={}){
  return validatePublicProductText([
    body?.title,body?.headline,body?.copy,body?.category,body?.image_alt,body?.image_source
  ].filter(Boolean).join('\n'));
}

export const PRODUCT_AUTHORITY=Object.freeze({
  version:'2026-08-08-server-v2-canonical-facts',
  productCount:6,
  soupBlockOnly:'75g／盒',
  guiluGaoUsagePrimary:'每日早上及下午各一小匙',
  products:PRODUCTS
});
