import test from 'node:test';
import assert from 'node:assert/strict';
import {checkD1ExportBudget, queryD1ExportBudget, MAX_ROWS_BEFORE_EXPORT} from './check-d1-free-budget-before-export.mjs';

const now=new Date('2026-11-22T08:20:00Z');
const since='2026-11-22T00:00:00.000Z';
const payload=(rows=[100])=>({
  success:true,errors:[],
  result:rows.map((count,i)=>({
    database_id:'a'+String(i),database_name:'database-'+i,
    rows_read:count,rows_written:0,queries:3
  })),
  result_info:{count:rows.length,query_window:{from:since,to:'2026-11-22T08:19:00.000Z'}}
});

test('all account D1 databases count toward the conservative free allowance',()=>{
  const ok=checkD1ExportBudget(payload([25_172,3_700_000]),{now,since});
  assert.equal(ok.allow_export,true);
  assert.equal(ok.account_rows_read,3_725_172);
  assert.equal(ok.budget_reserved_rows,1_000_000);
  assert.equal(ok.production_d1_sql_queries,0);
  assert.equal(checkD1ExportBudget(payload([3_000_000,1_000_001]),{now,since}).allow_export,false);
  assert.equal(checkD1ExportBudget(payload([MAX_ROWS_BEFORE_EXPORT]),{now,since}).allow_export,true);
});

test('missing, truncated, stale and malformed billing metadata fail closed',()=>{
  assert.throws(()=>checkD1ExportBudget({success:false,result:[]},{now,since}),/UNAVAILABLE/);
  const missingInfo=payload();
  delete missingInfo.result_info;
  assert.throws(()=>checkD1ExportBudget(missingInfo,{now,since}),/COUNT_UNVERIFIED/);
  const stale=payload();stale.result_info.query_window.to='2026-11-22T07:00:00.000Z';
  assert.throws(()=>checkD1ExportBudget(stale,{now,since}),/STALE/);
  const wrongDay=payload();wrongDay.result_info.query_window.from='2026-11-21T00:00:00.000Z';
  assert.throws(()=>checkD1ExportBudget(wrongDay,{now,since}),/WRONG_DAY/);
  const partial=payload();partial.result_info.count=9;
  assert.throws(()=>checkD1ExportBudget(partial,{now,since}),/COUNT_UNVERIFIED/);
  const badValue=payload();badValue.result[0].rows_read=-1;
  assert.throws(()=>checkD1ExportBudget(badValue,{now,since}),/UNRELIABLE_ROW/);
  const completePage=payload(Array(1000).fill(1));
  assert.throws(()=>checkD1ExportBudget(completePage,{now,since}),/INCOMPLETE_DATABASE_LIST/);
});

test('only official account-wide Insights GET is called; no DB SQL or write request', async()=>{
  let called=0;
  const out=await queryD1ExportBudget({
    now,token:'isolated-value-not-real',accountId:'a'.repeat(32),
    transport:async (url, options)=>{
      called++;
      assert.equal(options.method,'GET');
      assert.equal(url.hostname,'api.cloudflare.com');
      assert.equal(url.pathname,'/client/v4/accounts/'+ 'a'.repeat(32)+'/d1/insights/databases');
      assert.equal(url.searchParams.get('since'),since);
      assert.equal(url.searchParams.get('limit'),'1000');
      assert.equal(options.body,undefined);
      return {ok:true,json:async()=>payload([25_172])};
    }
  });
  assert.equal(called,1);
  assert.equal(out.allow_export,true);
  assert.equal(out.account_rows_written,0);
});

test('missing credentials or unavailable Insights refuse export',async()=>{
  await assert.rejects(queryD1ExportBudget({accountId:'a'.repeat(32),token:''}),/CREDENTIALS_MISSING/);
  await assert.rejects(queryD1ExportBudget({
    accountId:'a'.repeat(32),token:'fake',now,
    transport:async()=>({ok:false,status:403})
  }),/HTTP_UNAVAILABLE/);
});
