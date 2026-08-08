const PRODUCTS=Object.freeze([
  {id:'guilu-gao',name:'龜鹿膏',allowedSpecs:['100g／罐']},
  {id:'guilu-drink-30',name:'龜鹿飲30cc玻璃罐',allowedSpecs:['30cc／罐','30cc／罐（小玻璃罐）']},
  {id:'guilu-drink-180',name:'龜鹿飲180cc鋁袋',allowedSpecs:['180cc／包','180cc／包（鋁袋）']},
  {id:'guilu-tangkuai',name:'龜鹿湯塊',allowedSpecs:['75g／盒','75g／盒｜8塊裝｜每塊約9.375g']},
  {id:'guilu-jiao',name:'龜鹿膠',allowedSpecs:['600g（1斤）／盒','600g（1斤）／盒｜32塊裝｜每塊約18.75g']},
  {id:'luerong-fen',name:'鹿茸粉',allowedSpecs:['75g／罐']}
]);
const BY_NAME=new Map(PRODUCTS.map(item=>[item.name,item]));
const clean=value=>String(value??'').trim();

function normalizedName(name,spec=''){
  const value=clean(name),size=clean(spec);
  if(value==='龜鹿飲'&&size.startsWith('30cc'))return '龜鹿飲30cc玻璃罐';
  if(value==='龜鹿飲'&&size.startsWith('180cc'))return '龜鹿飲180cc鋁袋';
  return value;
}

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
  return [...new Set(errors)];
}

export function validateProductRecord(body={},options={}){
  const name=clean(body?.name),spec=clean(body?.specification||body?.spec);
  if(options.partial&&(!name||!spec))return [];
  const normalized=normalizedName(name,spec),product=BY_NAME.get(normalized);
  if(!product)return [`產品中心只允許六項正式產品，目前名稱「${name||'未填'}」不在正式清單。`];
  if(!product.allowedSpecs.includes(spec))return [`${product.name}規格不在目前正式規格清單。`];
  return validatePublicProductText(`${normalized} ${spec}`);
}

export function validatePostPayload(body={}){
  return validatePublicProductText([
    body?.title,body?.headline,body?.copy,body?.category,body?.image_alt,body?.image_source
  ].filter(Boolean).join('\n'));
}

export const PRODUCT_AUTHORITY=Object.freeze({
  version:'2026-08-08-server-v1',
  productCount:6,
  soupBlockOnly:'75g／盒',
  products:PRODUCTS
});
