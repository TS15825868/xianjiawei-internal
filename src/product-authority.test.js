import assert from 'node:assert/strict';
import { PRODUCT_AUTHORITY, validateProductRecord, validatePublicProductText, validatePostPayload, validatePostImageMatch } from './product-authority.js';

assert.equal(PRODUCT_AUTHORITY.productCount,6);
assert.equal(PRODUCT_AUTHORITY.soupBlockMain,'75g／盒｜8塊裝');
assert.equal(PRODUCT_AUTHORITY.guiluJiaoMain,'600g （1斤）／盒｜32塊裝');
assert.equal(PRODUCT_AUTHORITY.guiluGaoUsagePrimary,'食用時間可依個人使用習慣與作息時間安排');
assert.equal(PRODUCT_AUTHORITY.guiluDrink30UsagePrimary,'每日 1-2罐；飲用時間可依個人使用習慣與作息時間安排');
assert.equal(PRODUCT_AUTHORITY.guiluDrink180UsagePrimary,'每日一包；飲用時間可依個人使用習慣與作息時間安排');
assert.equal(PRODUCT_AUTHORITY.postImageMatchBlocking,true);
assert.match(String(PRODUCT_AUTHORITY.mediaGuardPolicy||''),/customer-display.*dm-final.*trial.*products-v3/i);

const validProducts=[
  {name:'龜鹿膏',specification:'100g／罐',ingredients:'鹿角萃取物、龜板萃取物、枸杞、紅棗、黃耆、粉光蔘',usage:'食用時間可依個人使用習慣與作息時間安排；初次可先從半匙開始'},
  {name:'龜鹿飲30cc玻璃罐',specification:'30cc／罐（小玻璃罐）',ingredients:'水、龜板萃取物、鹿角萃取物、粉光蔘、枸杞、紅棗、黃耆'},
  {name:'龜鹿飲180cc鋁袋',specification:'180cc／包（鋁袋）',ingredients:'水、龜板萃取物、鹿角萃取物、粉光蔘、枸杞、紅棗、黃耆'},
  {name:'龜鹿湯塊',specification:'75g／盒｜8塊裝',ingredients:'龜板萃取物、鹿角萃取物'},
  {name:'龜鹿膠',specification:'600g （1斤）／盒｜32塊裝',ingredients:'龜板萃取物、鹿角萃取物'},
  {name:'鹿茸粉',specification:'75g／罐',ingredients:'鹿茸'}
];
for(const product of validProducts)assert.deepEqual(validateProductRecord(product),[],`應允許：${product.name} ${product.specification}`);

for(const stale of [
  {name:'龜鹿飲30cc玻璃罐',specification:'30cc／罐'},
  {name:'龜鹿飲180cc鋁袋',specification:'180cc／包'},
  {name:'龜鹿湯塊',specification:'75g／盒'},
  {name:'龜鹿膠',specification:'600g／盒｜32塊裝'},
  {name:'龜鹿湯塊',specification:'75g／盒｜8塊裝'},
  {name:'龜鹿膠',specification:'600g（1斤）／盒｜32塊裝'},
  {name:'龜鹿湯塊',specification:'75g／盒｜8塊裝｜每塊約9.375g'},
  {name:'龜鹿膠',specification:'600g （1斤）／盒｜32塊裝｜每塊約18.75 g'}
]) assert.ok(validateProductRecord(stale).length>0,`非目前正式主規格應拒絕：${stale.name} ${stale.specification}`);

assert.ok(validateProductRecord({name:'龜鹿湯塊',specification:'300g／盒'}).length>0);
assert.ok(validateProductRecord({name:'龜鹿湯塊',specification:'600g／盒'}).length>0);
assert.ok(validateProductRecord({name:'龜鹿飲30cc玻璃罐',specification:'30cc／瓶'}).length>0);
assert.ok(validateProductRecord({name:'龜鹿膏',specification:'100g／罐',ingredients:'龜板萃取物、鹿角萃取物、粉光蔘、枸杞、紅棗、黃耆'}).length>0);
assert.deepEqual(validateProductRecord({name:'龜鹿膏',specification:'100g／罐',usage:'食用時間可依個人使用習慣與作息時間安排'}),[]);
assert.ok(validateProductRecord({name:'龜鹿膏',specification:'100g／罐',usage:'每日早上及下午各一小匙'}).length>0);
assert.ok(validateProductRecord({name:'龜鹿膏',specification:'100g／罐',usage:'一天一次一小匙'}).length>0);

assert.ok(validatePublicProductText('龜鹿湯塊300g／盒').length>0);
assert.deepEqual(validatePublicProductText('龜鹿湯塊75g／盒｜8塊裝，每塊約9.375g'),[]);
assert.deepEqual(validatePublicProductText('龜鹿膠600g （1斤）／盒｜32塊裝，每塊約18.75 g'),[]);
assert.ok(validatePublicProductText('龜鹿飲30cc玻璃瓶').length>0);
assert.deepEqual(validatePublicProductText('龜鹿膏食用時間可依個人使用習慣與作息時間安排'),[]);
assert.ok(validatePublicProductText('龜鹿膏每日早上及下午各一小匙').length>0);
assert.ok(validatePublicProductText('龜鹿膏一天一次一小匙').length>0);
assert.ok(validatePublicProductText('龜鹿膏早晚各一小匙').length>0);
assert.deepEqual(validatePublicProductText('龜鹿飲30cc玻璃罐每日 1-2罐；飲用時間可依個人使用習慣與作息時間安排'),[]);
assert.ok(validatePublicProductText('龜鹿飲30cc玻璃罐每日一罐').length>0);
assert.ok(validatePublicProductText('龜鹿飲30cc玻璃罐建議白天飲用').length>0);
assert.deepEqual(validatePublicProductText('龜鹿飲180cc鋁袋每日一包；飲用時間可依個人使用習慣與作息時間安排'),[]);
assert.deepEqual(validatePublicProductText('龜鹿湯塊75g／盒｜8塊裝，龜鹿膠600g （1斤）／盒｜32塊裝'),[],'不同產品規格不得互相誤判');

assert.deepEqual(validatePostImageMatch({title:'龜鹿膏日常',image_url:'https://example.com/images/customer-display-v20260812/guilu-gao.avif',image_alt:'龜鹿膏'}),[]);
assert.deepEqual(validatePostImageMatch({title:'龜鹿膏詳細DM',image_url:'https://ts15825868.github.io/xianjiawei/images/dm-final/01_guilu-gao-100g-dm.jpg?v=current',image_alt:'龜鹿膏100g詳細DM',image_source:'current-approved-formal-media'}),[], '目前核准DM不得只因位於dm-final目錄就被誤擋');
assert.ok(validatePostPayload({title:'龜鹿飲30cc日常',image_url:'https://example.com/images/customer-display-v20260812/guilu-drink-180cc-product.jpg',image_alt:'龜鹿飲180cc鋁袋'}).some(x=>x.includes('圖文產品不匹配')));
assert.ok(validatePostPayload({title:'龜鹿膏日常',image_url:'https://example.com/images/products-v2/guilu-gao.jpg',image_alt:'龜鹿膏'}).some(x=>x.includes('products-v2')));
assert.ok(validatePostPayload({title:'龜鹿飲30cc玻璃瓶',image_url:'https://example.com/images/customer-display-v20260812/guilu-drink-30cc.avif',image_alt:'龜鹿飲30cc玻璃罐'}).some(x=>x.includes('不得稱瓶')));
assert.ok(validatePostPayload({title:'龜鹿膏日常',image_url:'https://example.com/media/guilu-gao.jpg',image_alt:'龜鹿膏',image_source:'deprecated-reference-only'}).some(x=>x.includes('退役')));
assert.deepEqual(validatePostPayload({title:'雨天的日常節奏',copy:'下雨天慢一點也很好',image_url:'https://example.com/media/IMG-123',image_alt:'窗邊雨天情境'}),[]);

console.log('PASS 目前六項正式主規格、正式成分與個人作息使用原則一致：龜鹿膏不鎖固定早晚；龜鹿飲30cc每日 1-2罐；龜鹿飲移除固定白天時段；龜鹿膠1斤規格與圖文產品匹配維持。');
