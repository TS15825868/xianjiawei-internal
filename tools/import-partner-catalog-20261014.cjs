const fs=require('fs');
const targets=JSON.parse(fs.readFileSync('data/partner-product-import-20261014.json','utf8'));
const existing=JSON.parse(fs.readFileSync('/tmp/erp-products-before.json','utf8')).flatMap(x=>x.results||[]);
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
const sql=[];
for(const product of targets){
 const matches=existing.filter(r=>{let p=JSON.parse(r.data_json);return r.id===product.id||p.name===product.name;});
 if(matches.length>1)throw new Error('Ambiguous existing product: '+product.name);
 const row=matches[0];
 if(row){
  const old=JSON.parse(row.data_json); const merged={...old,...product,id:row.id};
  // Unknown source fields and all existing private cost/inventory fields remain intact.
  for(const key of ['notes','listing_status'])if(old[key])merged[key]=key==='notes'?[old[key],product[key]].filter(Boolean).join('\n'):old[key];
  sql.push(`UPDATE app_records SET data_json=${q(JSON.stringify(merged))},updated_at=CURRENT_TIMESTAMP WHERE module='products' AND id=${q(row.id)} AND archived=0 AND data_json=${q(row.data_json)};`);
 }else sql.push(`INSERT INTO app_records(module,id,data_json,archived,created_at,updated_at) VALUES('products',${q(product.id)},${q(JSON.stringify(product))},0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);`);
}
fs.writeFileSync('/tmp/partner-import.sql',sql.join('\n'));console.log('Prepared',targets.length,'product merges; private pricing fields preserved');
