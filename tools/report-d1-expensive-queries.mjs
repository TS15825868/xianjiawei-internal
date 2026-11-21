#!/usr/bin/env node
// Offline-only D1 Insights triage. Does not connect to Cloudflare or execute SQL.
import fs from 'node:fs';
const path=process.argv[2];
if(!path){console.error('Usage: node tools/report-d1-expensive-queries.mjs <insights-json>');process.exitCode=2;}
else {
  const input=JSON.parse(fs.readFileSync(path,'utf8'));
  const rows=Array.isArray(input)?input:Array.isArray(input.result)?input.result:[];
  const threshold=Number(process.env.XJW_D1_READ_WARNING_ROWS||100000);
  if(!Number.isFinite(threshold)||threshold<0)throw Error('Invalid warning threshold');
  let total=0;
  for(const item of [...rows].sort((a,b)=>(b.rows_read||0)-(a.rows_read||0))){
    const reads=Number(item.rows_read||0), executions=Number(item.executions||0);
    if(!Number.isFinite(reads)||reads<0)throw Error('Invalid rows_read');
    total+=reads;
    if(reads<threshold)continue;
    const query=String(item.query||'').replace(/\\s+/g,' ').slice(0,160);
    console.log(JSON.stringify({rows_read:reads,executions,query,warning:'Review query plan and indexes; do not replay against production D1'}));
  }
  console.log(JSON.stringify({sampled_total_rows_read:total,queries:rows.length,warning_threshold:threshold,source:'D1 Insights estimates; not billing totals'}));
}
