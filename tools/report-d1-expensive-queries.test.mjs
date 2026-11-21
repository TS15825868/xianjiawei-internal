import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('offline D1 Insights report ranks expensive queries and never runs SQL',()=>{
  const dir=mkdtempSync(join(tmpdir(),'xjw-d1-insights-'));
  try{
    const file=join(dir,'insights.json');
    writeFileSync(file,JSON.stringify({result:[
      {query:'SELECT 1',rows_read:5,executions:1},
      {query:'SELECT *\n  FROM social_posts',rows_read:22945428,executions:1}
    ]}));
    const run=spawnSync(process.execPath,['tools/report-d1-expensive-queries.mjs',file],{encoding:'utf8',env:{...process.env,XJW_D1_READ_WARNING_ROWS:'100000'}});
    assert.equal(run.status,0,run.stderr);
    const lines=run.stdout.trim().split('\n').map(JSON.parse);
    assert.equal(lines.length,2);
    assert.equal(lines[0].rows_read,22945428);
    assert.equal(lines[0].query,'SELECT * FROM social_posts');
    assert.equal(lines[1].sampled_total_rows_read,22945433);
    assert.equal(lines[1].queries,2);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
