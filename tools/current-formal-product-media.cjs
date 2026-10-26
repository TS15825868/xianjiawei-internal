'use strict';
function currentFormalProducts(master,siteHtml){
  const products=master?.products;
  if(!Array.isArray(products)||!products.length||Number(master.productCount)!==products.length)
    throw Error('網站最新商品母資料缺失或筆數不一致');
  if(String(typeof master.brand==='object'?master.brand?.name:master.brand)!=='仙加味')throw Error('官網正式品牌異常');
  const mediaById=new Map(),seen=new Set();
  for(const m of String(siteHtml||'').matchAll(/<article\b[^>]*\bdata-fallback-product="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)){
    if(seen.has(m[1]))throw Error('網站主圖商品ID重複 '+m[1]);
    seen.add(m[1]);
    const img=m[2].match(/<img\b[^>]*\bsrc="([^"]+)"/);
    if(!img)continue;
    const path=img[1].split('?')[0].split('#')[0].replace(/^\/+/,'');
    if(!/^images\/[a-zA-Z0-9_./-]+\.(?:webp|png|jpe?g)$/i.test(path)||path.includes('/../'))
      throw Error('網站商品卡片主圖不是受信任本地實物路徑 '+m[1]);
    mediaById.set(m[1],path);
  }
  if(!seen.size)throw Error('商品總覽沒有正式實物主圖證據');
  const ids=new Set(),approved=[],assets={},aliases={};
  for(const p of products){
    if(!p?.id||!p?.name||ids.has(p.id))throw Error('正式產品ID重複或缺失 '+p?.id);
    ids.add(p.id);
    if(p.mediaStatus!=='approved-formal-product-image')continue;
    const name=String(p.name).trim();
    const key=/龜鹿飲.*30\s*cc/i.test(name)?'30cc':/龜鹿飲.*180\s*cc/i.test(name)?'180cc':name;
    if(aliases[key]&&aliases[key]!==p.id)throw Error('商品別名衝突 '+key);
    aliases[key]=p.id;
    const path=mediaById.get(p.id);
    if(path)assets[key]=path;
    approved.push({id:p.id,name,key,mainImage:path||null});
  }
  function productsFor(text){
    const body=String(text||''),chosen=[];
    const add=k=>{if(!chosen.includes(k))chosen.push(k)};
    if(/30\s*cc/i.test(body)&&aliases['30cc'])add('30cc');
    if(/180\s*cc/i.test(body)&&aliases['180cc'])add('180cc');
    if(body.includes('龜鹿飲')&&!/30\s*cc|180\s*cc/i.test(body)){
      for(const key of ['30cc','180cc'])if(aliases[key])add(key);
    }
    for(const p of approved)if(!['30cc','180cc'].includes(p.key)&&body.includes(p.name))add(p.key);
    for(const name of ['龜鹿膠','龜鹿湯塊','柒玄茶']){
      if(body.includes(name)&&!approved.some(p=>p.name.includes(name)))
        throw Error('貼文涉及尚未在官網母資料核准的產品 '+name);
    }
    for(const key of chosen)if(!assets[key])throw Error('正式產品未在商品總覽提供已核准實物主圖 '+key);
    return chosen;
  }
  return {approved,assets,aliases,productsFor};
}
module.exports={currentFormalProducts};
