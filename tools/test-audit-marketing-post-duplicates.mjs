import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=path.join(path.dirname(fileURLToPath(import.meta.url)),'audit-marketing-post-duplicates.mjs');

test('read-only audit catches D1/Metricool body duplicates and historical duplicate publications',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xjw-dedupe-'));
 const d1=[
  {id:'D1-1',title:'生活故事',headline:'品牌',copy:'🌧️ 風雨來了，平安最重要。',status:'pending_review'},
  {id:'D1-2',title:'生活故事',headline:'另一標題',copy:'其他完全不同內容',status:'draft'}
 ];
 const metricool=[
  {id:403318046,text:'🌧️ 風雨來了，平安最重要。',draft:false,autoPublish:true,providers:[{status:'PUBLISHED'}]},
  {id:403326277,text:'🌧️ 風雨來了，平安最重要。',draft:false,autoPublish:true,providers:[{status:'PUBLISHED'}]},
  {id:409189928,text:'新草稿',draft:true,autoPublish:false,providers:[{status:'PENDING'}]}
 ];
 try{
  const dp=path.join(dir,'d1.json'),mp=path.join(dir,'metricool.json');
  fs.writeFileSync(dp,JSON.stringify([{results:d1}]));
  fs.writeFileSync(mp,JSON.stringify({data:metricool}));
  const run=spawnSync(process.execPath,[script,dp,mp],{encoding:'utf8',timeout:5000});
  assert.equal(run.status,0,run.stderr);
  const result=JSON.parse(run.stdout);
  assert.equal(result.exactTextDuplicateGroups.length,1);
  assert.deepEqual(result.exactTextDuplicateGroups[0].map(p=>p.id),['D1-1',403318046,403326277]);
  assert.equal(result.duplicateD1TitleGroups.length,1);
  assert.equal(result.metricoolPublishedRecords,2);
  assert.equal(result.metricoolDrafts,1);
  assert.equal(result.metricoolUnpublishedAutoPublishOn,0);
  assert.equal(result.metricoolDraftsWithAutoPublishOn,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
