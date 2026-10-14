'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepare, mergeProduct } = require('./import-partner-catalog-20261014.cjs');
const row = (id, data) => ({ id, data_json: JSON.stringify(data) });
const src = (id, name, brand_name) => ({ id, name, brand_name, category: '其他品牌商品' });

test('same product name across different manufacturers must insert distinct SKU', () => {
  const existing = [row('LIAN-GUILU', { id: 'LIAN-GUILU', name: '龜鹿二仙膠', brand_name: '立安' })];
  const result = prepare([src('JINAN-GUILU', '龜鹿二仙膠', '晉安')], existing);
  assert.equal(result.inserted, 1);
  assert.equal(result.updated, 0);
  assert.match(result.sql, /INSERT INTO app_records/);
  assert.doesNotMatch(result.sql, /UPDATE app_records/);
});
test('same product name and manufacturer can merge legacy record by brand', () => {
  const existing = [row('LEGACY', { id:'LEGACY', name:'參仲四物飲', brand_name:'晉安', stock: 9 })];
  const result = prepare([src('NEW', '參仲四物飲', '晉安')], existing);
  assert.equal(result.updated, 1);
  assert.match(result.sql, /UPDATE app_records/);
});
test('incoming unverified manufacturer must not hijack branded product', () => {
  const existing = [row('JINAN', { name: '龜鹿活力飲', brand_name: '晉安' })];
  const result = prepare([src('UNKNOWN', '龜鹿活力飲', '待核對')], existing);
  assert.equal(result.inserted, 1);
});
test('a conflicting brand under a previously registered ID is rejected', () => {
  assert.throws(() => prepare([src('ID', '產品', '晉安')], [row('ID', {
    id: 'ID', name:'產品', brand_name:'立安'
  })]), /Brand conflict/);
});
test('cost, stock and prior listing status survive repeated merges', () => {
  const previous = { id:'X', name:'商品', brand_name:'立安', cost_price:700,
    retail_price:1600, stock:12, listing_status:'已核准公開', notes:'原始備註' };
  const incoming = { id:'X', name:'商品', brand_name:'立安', notes:'新照片已核對',
    specification:'30g' };
  const next = mergeProduct(previous, incoming, 'X');
  assert.equal(next.cost_price, 700);
  assert.equal(next.retail_price, 1600);
  assert.equal(next.stock, 12);
  assert.equal(next.listing_status, '已核准公開');
  assert.equal(next.notes, '原始備註\n新照片已核對');
  assert.equal(mergeProduct(next, incoming, 'X').notes, next.notes);
});
test('private price information may not enter tracked product import source', () => {
  assert.throws(() => prepare([{ ...src('X', '產品', '仙加味'), cost_price:500 }], []),
    /Private pricing key/);
});
test('duplicate source identity is rejected before any SQL runs', () => {
  assert.throws(() => prepare([src('X','甲','立安'),src('X','甲','立安')], []),
    /Duplicate import ID/);
});
