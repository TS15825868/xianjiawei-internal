import {test} from 'node:test';
import assert from 'node:assert/strict';
import {socialFactSuggestion} from '../src/social-fact-suggestion.js';
const url='https://internal.example/api/social-facts/suggest';
const body={productId:'guilu-gao',topic:'ingredients',question:'請問龜鹿膏有什麼成分？'};
const staff=async()=>({role:'owner',active:1});
const req=(data=body,headers={})=>new Request(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)});
test('free zero-neuron answer uses exact official ingredient order without model or customer send',async()=>{
 const e={AI:{run:()=>assert.fail('No model call is permitted')},DB:{prepare:()=>assert.fail('No database write')}};
 const res=await socialFactSuggestion(req(),e,{authenticate:staff});const j=await res.json();
 assert.equal(res.status,200);assert.equal(j.ok,true);assert.equal(j.aiUsed,false);
 assert.equal(j.neuronsUsed,0);assert.equal(j.sent,false);assert.equal(j.autoReply,false);assert.equal(j.approved,false);
 assert.equal(j.humanReviewRequired,true);
 assert.match(j.reply,/鹿角萃取物、龜板萃取物、枸杞、紅棗、黃耆、粉光蔘/);
});
test('product specificity for 30cc and 180cc remains exact, without inventing bottle labels',async()=>{
 for(const [productId,name,size] of [['guilu-drink-30','龜鹿飲30cc玻璃罐','30cc／罐（小玻璃罐）'],['guilu-drink-180','龜鹿飲180cc鋁袋','180cc／包（鋁袋）']]){
  const r=await socialFactSuggestion(req({productId,topic:'specification',question:'請問'+name+'正式規格是什麼？'}),{},{authenticate:staff});
  assert.equal(r.status,200);const j=await r.json();assert.ok(j.reply.includes(size));
 }
});
test('unauthorized identities and invalid questions cannot access facts or cause side effects',async()=>{
 const env={AI:{run:()=>assert.fail('AI inference must not run')},DB:{prepare:()=>assert.fail('DB must not run')}};
 for(const authorize of [async()=>{throw Error('no Access')},async()=>({role:'viewer'}),async()=>({role:'sales'})]){
  const r=await socialFactSuggestion(req(),env,{authenticate:authorize});assert.notEqual(r.status,200);
 }
 for(const x of [
  {...body,question:'請問龜鹿膏價格多少錢'},
  {...body,question:'請問龜鹿膏的成分？電話0912345678'},
  {...body,question:'請問龜鹿膏可以治療疾病？'},
  {...body,question:'請問龜鹿飲正式成分？'},
  {...body,topic:'medical'},
  {...body,productId:'unknown'},
  {...body,untrustedRole:'owner'}
 ]){
  const r=await socialFactSuggestion(req(x),env,{authenticate:staff});assert.notEqual(r.status,200);
  assert.equal((await r.json()).sent,false);
 }
});
test('bad method, JSON and oversized requests fail without inference',async()=>{
 const e={AI:{run:()=>assert.fail('No model inference')}};
 const g=await socialFactSuggestion(new Request(url),e,{authenticate:staff});assert.equal(g.status,405);
 const bad=await socialFactSuggestion(new Request(url,{method:'POST',body:'{' ,headers:{'content-type':'application/json'}}),e,{authenticate:staff});assert.equal(bad.status,400);
 const size=await socialFactSuggestion(req({...body,question:'龜鹿膏'+'x'.repeat(5000)}),e,{authenticate:staff});assert.equal(size.status,413);
});
