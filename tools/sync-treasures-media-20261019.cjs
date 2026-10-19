'use strict';
const fs=require('fs'),assert=require('assert/strict');
const targets=require('../data/treasures-media-targets-20261019.json');
const read=p=>JSON.parse(fs.readFileSync(p)).flatMap(x=>x.results||[]).map(x=>({...x,data:JSON.parse(x.data_json)}));
if(process.argv.includes('--apply')){
 const {execFileSync}=require('child_process');
 try{execFileSync('npx',['wrangler','d1','execute','xianjiawei-internal-db','--remote','--command',fs.readFileSync('/tmp/treasures-media.sql','utf8')],{stdio:'pipe'});console.log('Media SQL applied through D1 query path');}catch(e){console.error('D1 media query failed; private SQL withheld. Exit code: '+e.status);const detail=(String(e.stderr||'')+'\n'+String(e.stdout||'')).replace(/\u001b\[[0-9;]*m/g,'');const safe=detail.split('\n').filter(l=>/constraint failed|SQLITE_|no such|syntax error|not authorized|code:|ERROR|D1_|API request|failed|not allowed/i.test(l)&&!l.includes('data_json=')).map(l=>l.replace(/'[^']*'/g,"'[redacted]'")).join('\n');console.error(safe.slice(0,1000));process.exit(1);}
 process.exit(0);
}
const before=read('/tmp/before.json');
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
if(process.argv.includes('--verify')){
 const after=read('/tmp/after.json'),plan=JSON.parse(fs.readFileSync('/tmp/media-plan.json'));
 for(const old of before){const now=after.find(x=>x.id===old.id);assert.ok(now,'Original product lost');const a={...old.data},b={...now.data};if(plan.some(p=>p.id===old.id)){delete a.image_url;delete b.image_url;delete a.gallery;delete b.gallery;}assert.deepEqual(b,a,'Non-media fields changed');}
 for(const p of plan){const now=after.find(x=>x.id===p.id);assert.ok(now);assert.equal(now.data.image_url,p.image_url);assert.deepEqual(now.data.gallery,p.gallery);}
 console.log('PASS two separate three-photo galleries; original records and all non-media fields preserved');
}else{
 const sql=[],plan=[];
 for(const target of targets){
  const prefix=target.name.startsWith('二')?'二珍寶':'四珍寶';
  const matches=before.filter(r=>r.id===target.id||r.data.sku===target.sku||r.data.source_product===target.sku||String(r.data.name||'').startsWith(prefix));
  assert.ok(matches.length<=1,'Ambiguous product identity: '+target.sku);
  const old=matches[0];const id=old?.id||target.id;
  if(old){sql.push(`UPDATE app_records SET data_json=json_set(data_json,'$.image_url',${q(target.image_url)},'$.gallery',json(${q(JSON.stringify(target.gallery))})),updated_at=datetime('now') WHERE module='products' AND id=${q(id)} AND archived=0 AND data_json=${q(old.data_json)};`);}
  else {const data={...target,category:'其他品牌商品／食品膏湯塊',manufacturing_mode:'原廠商品轉售',listing_status:'已核准公開'};delete data.id;sql.push(`INSERT INTO app_records(module,id,data_json) VALUES('products',${q(id)},${q(JSON.stringify(data))});`);}
  for(let i=0;i<3;i++){const asset={name:target.name+' '+['正面外盒','開盒實物','背面標示'][i],product_id:id,file_url:target.gallery[i],mime_type:'image/png',source:'20261019 使用者指定實拍去背照片',status:'approved'};sql.push(`INSERT INTO app_records(module,id,data_json) VALUES('assets',${q('AST-20261019-'+target.sku+'-'+['front','open','back'][i])},${q(JSON.stringify(asset))}) ON CONFLICT(module,id) DO UPDATE SET data_json=excluded.data_json,updated_at=datetime('now');`);}
  plan.push({...target,id});console.log('Prepared photo gallery for '+target.name+' ('+(old?'existing product':'missing product created from verified public catalog')+')');
 }
 fs.writeFileSync('/tmp/media-plan.json',JSON.stringify(plan));fs.writeFileSync('/tmp/treasures-media.sql',sql.join('\n'));
}
