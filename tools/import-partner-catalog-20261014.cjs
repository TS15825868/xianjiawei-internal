'use strict';
/* Maintain ERP multi-brand identity; never merge solely on display name. */
const fs = require('fs');
const PRIVATE_FIELDS = new Set([
  'cost_price', 'retail_price', 'wholesale_price', 'promotional_price',
  'purchase_price', 'supplier_cost', 'inventory_cost', 'cost', 'price'
]);
const UNKNOWN_BRANDS = new Set(['待核對', '未確認', 'unknown', '待確認']);
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const normalize = value => String(value || '').trim().replace(/\s+/g, '').toLowerCase();
const brandOf = product => normalize(product.brand_name || product.brand || product.manufacturer_brand);
const unknownBrand = value => !value || UNKNOWN_BRANDS.has(value);

function mergeProduct(previous, incoming, canonicalId) {
  const next = { ...previous, ...incoming, id: canonicalId };
  for (const key of PRIVATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(previous, key)) next[key] = previous[key];
    else delete next[key];
  }
  for (const key of ['quantity', 'stock', 'inventory', 'stock_quantity']) {
    if (Object.prototype.hasOwnProperty.call(previous, key)) next[key] = previous[key];
  }
  if (previous.listing_status) next.listing_status = previous.listing_status;
  if (previous.brand_name && unknownBrand(brandOf(incoming))) {
    next.brand_name = previous.brand_name;
  }
  const existingNotes = String(previous.notes || '').trim();
  const newNotes = String(incoming.notes || '').trim();
  next.notes = [existingNotes, ...(!newNotes || existingNotes.split('\n').includes(newNotes) ? [] : [newNotes])]
    .filter(Boolean).join('\n');
  if (!existingNotes && !newNotes) delete next.notes;
  return next;
}

function prepare(targets, rows) {
  if (!Array.isArray(targets) || !Array.isArray(rows)) throw Error('Import records must be arrays');
  const existing = rows.map(row => ({ ...row, parsed: JSON.parse(row.data_json) }));
  const seenIds = new Set();
  const statements = [];
  let inserted = 0, updated = 0, unchanged = 0;
  for (const product of targets) {
    if (!product || !product.id || !product.name) throw Error('Product missing id or name');
    if (seenIds.has(product.id)) throw Error('Duplicate import ID: ' + product.id);
    seenIds.add(product.id);
    for (const key of PRIVATE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(product, key)) {
        throw Error('Private pricing key must not be stored in public GitHub: ' + product.id + '/' + key);
      }
    }
    const name = normalize(product.name);
    const srcBrand = brandOf(product);
    const idMatches = existing.filter(row => row.id === product.id);
    if (idMatches.length > 1) throw Error('Duplicate ERP record ID: ' + product.id);
    let matches = idMatches;
    if (!matches.length && !unknownBrand(srcBrand)) {
      matches = existing.filter(row =>
        normalize(row.parsed.name) === name && brandOf(row.parsed) === srcBrand);
    } else if (!matches.length && unknownBrand(srcBrand)) {
      // Never infer the manufacturer from an unverified name.
      matches = existing.filter(row =>
        normalize(row.parsed.name) === name && !brandOf(row.parsed));
    }
    if (matches.length > 1) throw Error('Ambiguous product identity: ' + product.name + ' / ' + srcBrand);
    const row = matches[0];
    if (row) {
      const oldBrand = brandOf(row.parsed);
      if (!unknownBrand(oldBrand) && !unknownBrand(srcBrand) && oldBrand !== srcBrand) {
        throw Error('Brand conflict for same product ID: ' + product.id);
      }
      const merged = mergeProduct(row.parsed, product, row.id);
      const result = JSON.stringify(merged);
      if (result === row.data_json) { unchanged++; continue; }
      statements.push('UPDATE app_records SET data_json=' + q(result)
        + ',updated_at=CURRENT_TIMESTAMP WHERE module=' + q('products')
        + ' AND id=' + q(row.id) + ' AND archived=0 AND data_json=' + q(row.data_json) + ';');
      updated++;
    } else {
      statements.push('INSERT INTO app_records(module,id,data_json,archived,created_by,created_at,updated_at) VALUES('
        + q('products') + ',' + q(product.id) + ',' + q(JSON.stringify(product))
        + ",0,(SELECT email FROM profiles WHERE role='owner' AND active=1 AND (SELECT COUNT(*) FROM profiles WHERE role='owner' AND active=1)=1),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);");
      inserted++;
    }
  }
  return { sql: statements.length ? statements.join('\n') : 'SELECT 1;\n',
    inserted, updated, unchanged, count: targets.length };
}

if (require.main === module) {
  const source = process.env.XJW_IMPORT_SOURCE || 'data/partner-product-import-20261014.json';
  const before = process.env.XJW_IMPORT_BEFORE || '/tmp/erp-products-before.json';
  const output = process.env.XJW_IMPORT_SQL || '/tmp/partner-import.sql';
  const targets = JSON.parse(fs.readFileSync(source, 'utf8'));
  const existing = JSON.parse(fs.readFileSync(before, 'utf8')).flatMap(x => x.results || []);
  const result = prepare(targets, existing);
  fs.writeFileSync(output, result.sql);
  console.log('Prepared', result.count, 'brand-safe ERP product merges; inserted',
    result.inserted, 'updated', result.updated, 'unchanged', result.unchanged,
    '; original private pricing, inventory and listing status preserved');
}
module.exports = { prepare, mergeProduct, brandOf };
