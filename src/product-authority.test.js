import assert from 'node:assert/strict';
import { PRODUCT_AUTHORITY, validateProductRecord, validatePublicProductText } from './product-authority.js';

assert.equal(PRODUCT_AUTHORITY.productCount,6);
assert.equal(PRODUCT_AUTHORITY.soupBlockOnly,'75g／盒');

const validProducts=[
  {name:'龜鹿膏',specification:'100g／罐'},
  {name:'龜鹿飲30cc玻璃罐',specification:'30cc／罐'},
  {name:'龜鹿飲180cc鋁袋',specification:'180cc／包'},
  {name:'龜鹿湯塊',specification:'75g／盒'},
  {name:'龜鹿膠',specification:'600g（1斤）／盒'},
  {name:'鹿茸粉',specification:'75g／罐'}
];
for(const product of validProducts)assert.deepEqual(validateProductRecord(product),[],`應允許：${product.name} ${product.specification}`);

assert.ok(validateProductRecord({name:'龜鹿湯塊',specification:'300g／盒'}).length>0);
assert.ok(validateProductRecord({name:'龜鹿湯塊',specification:'600g／盒'}).length>0);
assert.ok(validateProductRecord({name:'龜鹿飲30cc玻璃罐',specification:'30cc／瓶'}).length>0);
assert.ok(validatePublicProductText('龜鹿湯塊300g／盒').length>0);
assert.ok(validatePublicProductText('龜鹿飲30cc玻璃瓶').length>0);

console.log('PASS ERP六項正式產品規格與龜鹿湯塊75g唯一規格');
