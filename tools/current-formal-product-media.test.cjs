const test=require('node:test');
const assert=require('node:assert/strict');
const {currentFormalProducts}=require('./current-formal-product-media.cjs');
const product=(id,name)=>({id,name,mediaStatus:'approved-formal-product-image'});
const master={brand:'仙加味',productCount:4,products:[product('guilu-gao','龜鹿膏'),product('guilu-drink-30','龜鹿飲30cc玻璃罐'),product('guilu-drink-180','龜鹿飲180cc鋁袋'),product('luerong-fen','鹿茸粉')]};
const page=[
'<article class="product-card" data-fallback-product="guilu-gao"><img src="images/new/guilu-gao-main.webp?v=2"></article>',
'<article class="product-card" data-fallback-product="guilu-drink-30"><img src="images/new/30-main.webp?v=2"></article>',
'<article class="product-card" data-fallback-product="guilu-drink-180"><img src="images/new/180-main.webp?v=2"></article>',
'<article class="product-card" data-fallback-product="luerong-fen"><img src="images/new/luerong.webp?v=2"></article>'
].join('\n');
test('Reads approved original photos from current website rather than stale paths',()=>{
 const official={...master,brand:{name:'仙加味',positioning:'現代漢方生活品牌'}};
 const a=currentFormalProducts(official,page);
 assert.equal(a.assets['30cc'],'images/new/30-main.webp');
 assert.equal(a.assets['180cc'],'images/new/180-main.webp');
 assert.deepEqual(a.productsFor('30cc跟180cc怎麼選'),['30cc','180cc']);
 assert.deepEqual(a.productsFor('仙加味龜鹿飲日常'),['30cc','180cc']);
 assert.deepEqual(a.productsFor('仙加味龜鹿膏100g'),['龜鹿膏']);
});
test('Future formally approved product does not fail fixed-count guard',()=>{
 const m={...master,productCount:5,products:[...master.products,product('new-tea','新茶飲')]};
 const a=currentFormalProducts(m,page+'<article data-fallback-product="new-tea"><img src="images/approved/new-tea.webp"></article>');
 assert.deepEqual(a.productsFor('介紹新茶飲'),['新茶飲']);
 assert.equal(a.assets['新茶飲'],'images/approved/new-tea.webp');
});
test('Unapproved products or wrong image sources fail closed',()=>{
 assert.throws(()=>currentFormalProducts({...master,productCount:8},page),/筆數不一致/);
 assert.throws(()=>currentFormalProducts(master,page.replace('images/new/30-main.webp','https://example.test/other.jpg')),/受信任本地/);
 const a=currentFormalProducts(master,page);
 assert.throws(()=>a.productsFor('龜鹿膠600g'),/未在官網母資料核准/);
 assert.throws(()=>a.productsFor('龜鹿湯塊75g'),/未在官網母資料核准/);
 assert.throws(()=>a.productsFor('柒玄茶'),/未在官網母資料核准/);
 const lost=currentFormalProducts(master,page.replace('data-fallback-product="guilu-gao"','data-fallback-product="other"'));
 assert.throws(()=>lost.productsFor('龜鹿膏'),/未在商品總覽提供/);
});
