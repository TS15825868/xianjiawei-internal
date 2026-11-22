import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  METADATA_SQL,verifyLiveTableInventory,captureD1LiveTableInventory
} from './capture-d1-live-table-inventory.mjs';

const payload=(names=['business_inquiries','business_inquiry_drafts','business_inquiry_crm_delivery','unrelated_erp_customer'])=>({
  success:true,
  result:[{success:true,results:names.map(name=>({name})),meta:{rows_read:117,rows_written:0}}],
  errors:[]
});

test('inventory lists all live schema tables without accessing customer records',()=>{
  const r=verifyLiveTableInventory(payload());
  assert.equal(r.table_count,4);
  assert.equal(r.rows_read,117);
  assert.equal(r.customer_rows_retrieved,0);
  assert.equal(r.rows_written,0);
  assert.deepEqual(r.table_names,['business_inquiries','business_inquiry_crm_delivery','business_inquiry_drafts','unrelated_erp_customer']);
  assert.ok(!METADATA_SQL.includes('business_contact'));
  assert.ok(!METADATA_SQL.toLowerCase().includes('social_posts'));
});

test('a missing CRM table is recorded rather than silently invented',()=>{
  const r=verifyLiveTableInventory(payload(['business_inquiries','business_inquiry_drafts','unrelated_erp_customer']));
  assert.equal(r.table_count,3);
  assert.ok(!r.table_names.includes('business_inquiry_crm_delivery'));
});

test('malformed, duplicate, incomplete or write-producing metadata fails closed',()=>{
  assert.throws(()=>verifyLiveTableInventory({success:false,result:[]}),/QUERY_FAILED/);
  assert.throws(()=>verifyLiveTableInventory(payload([])),/INCOMPLETE_OR_INVALID/);
  assert.throws(()=>verifyLiveTableInventory(payload(['business_inquiries','business_inquiries'])),/INCOMPLETE_OR_INVALID/);
  assert.throws(()=>verifyLiveTableInventory(payload(['foo; DROP TABLE x'])),/INCOMPLETE_OR_INVALID/);
  const edited=payload();edited.result[0].meta.rows_written=1;
  assert.throws(()=>verifyLiveTableInventory(edited),/RESULT_UNTRUSTED/);
  const partial=payload();partial.result[0].success=false;
  assert.throws(()=>verifyLiveTableInventory(partial),/RESULT_UNTRUSTED/);
});

test('official Cloudflare API is called exactly once and only with bounded metadata SQL', async()=>{
  const folder=mkdtempSync(join(tmpdir(),'xjw-d1-inventory-'));
  const dest=join(folder,'private-inventory.json');
  let count=0;
  try{
    const receipt=await captureD1LiveTableInventory({
      token:'fake-isolated-test-token',
      accountId:'a'.repeat(32),
      databaseId:'5e85d589-9c4f-412e-9ccd-585a5b6ecabe',
      output:dest,
      transport:async (url,args)=>{
        count++;
        assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+'a'.repeat(32)+'/d1/database/5e85d589-9c4f-412e-9ccd-585a5b6ecabe/query');
        assert.equal(args.method,'POST');
        assert.deepEqual(JSON.parse(args.body),{sql:METADATA_SQL});
        assert.ok(!args.body.toLowerCase().includes('business_contact'));
        assert.equal(args.headers['Content-Type'],'application/json');
        return {ok:true,json:async()=>payload()};
      }
    });
    assert.equal(count,1);
    assert.deepEqual(receipt,{table_count:4,rows_read:117,rows_written:0});
    const saved=JSON.parse(readFileSync(dest,'utf8'));
    assert.equal(saved.table_names.length,4);
    await assert.rejects(captureD1LiveTableInventory({
      token:'fake',accountId:'a'.repeat(32),
      databaseId:'5e85d589-9c4f-412e-9ccd-585a5b6ecabe',output:dest,
      transport:async()=>({ok:true,json:async()=>payload()})
    }),/EEXIST/);
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('missing credentials and failed API refuse to create an inventory file',async()=>{
  await assert.rejects(captureD1LiveTableInventory({accountId:'a'.repeat(32),output:'not-used'}),/INPUT_MISSING/);
  const folder=mkdtempSync(join(tmpdir(),'xjw-d1-inventory-'));
  try{
    await assert.rejects(captureD1LiveTableInventory({
      token:'fake',accountId:'a'.repeat(32),databaseId:'5e85d589-9c4f-412e-9ccd-585a5b6ecabe',
      output:join(folder,'not-created.json'),transport:async()=>({ok:false,status:403})
    }),/HTTP_ERROR/);
  }finally{rmSync(folder,{recursive:true,force:true});}
});
