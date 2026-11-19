import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {acquisitionDataReadiness,countSql} from '../src/acquisition-data-readiness.js';
const keys=['relationalCustomers','relationalOrders','activeCustomerRecords','activeOrderRecords','businessInquiries','businessCrmDeliveryRows','lineReceiptRows'];
const row=Object.fromEntries(keys.map((k,i)=>[k,i]));
const request={method:'GET'};
const auth=async()=>({role:'owner',active:1});
function db(r){return {DB:{prepare(sql){assert.equal(sql,countSql);return {first:async()=>r}}}}}
test('authorized aggregate separates stores, never exposes rows, no write',async()=>{const a=await acquisitionDataReadiness(request,db({...row,customerName:'offline secret'}),{authenticate:auth});assert.equal(a.status,200);const b=await a.json();assert.deepEqual(b.counts,row);assert.equal(b.crmOrderSyncVerified,false);assert.equal(b.paidRevenueVerified,false);assert.equal(b.readOnly,true);assert(!JSON.stringify(b).includes('offline secret'));assert.equal(a.headers.get('cache-control'),'no-store');assert(!/\b(?:INSERT|UPDATE|DELETE|DROP)\b/i.test(countSql));});
test('missing access, viewer, inactive or non-GET never query D1',async()=>{const env={DB:{prepare(){throw Error('must not query')}}};for(const [req,authenticate,expected] of [[request,async()=>{throw Error('denied')},401],[request,async()=>({role:'viewer',active:1}),403],[request,async()=>({role:'admin',active:0}),403],[{method:'POST'},auth,405]])assert.equal((await acquisitionDataReadiness(req,env,{authenticate})).status,expected);});
test('unavailable or malformed data is not reported as zero',async()=>{for(const r of [null,{...row,relationalOrders:null},{...row,relationalOrders:-1},{...row,relationalOrders:'0'}]){const a=await acquisitionDataReadiness(request,db(r),{authenticate:auth});assert.equal(a.status,503);assert.equal((await a.json()).counts,undefined)}assert.equal((await acquisitionDataReadiness(request,{}, {authenticate:auth})).status,503);});
test('ERP route is authenticated, maintenance blocked, UI counts separated',()=>{const entry=fs.readFileSync('src/full-system-entry.js','utf8'),app=fs.readFileSync('assets/js/internal-app.js','utf8'),html=fs.readFileSync('erp.html','utf8');assert(entry.includes('acquisitionDataReadiness(request,env,{authenticate:verifyFastAccess})'));assert(entry.includes('if(path===acquisitionPath){if(maintenance)return maintenanceLocked'));assert(app.includes('禁止加總成客戶數或訂單數'));assert(app.includes('不等於零客戶或零營收'));assert(html.includes('20261119-acquisition-readiness-v4'));});
