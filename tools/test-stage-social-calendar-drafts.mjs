import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepare,localWeek} from './stage-social-calendar-drafts.mjs';
const manifest=JSON.parse(fs.readFileSync('ops/social-calendar-safe-drafts-20261105.json','utf8'));
const existing=JSON.parse(fs.readFileSync('ops/social-schedule-candidates-current.json','utf8')).items;
const drafts=JSON.parse(fs.readFileSync('ops/metricool-future-draft-holds-20261105.json','utf8')).items;
const opts={from:'2026-11-05',createdBy:'tung314069@gmail.com'};
test('historical D1 and Metricool reservations leave only 23 low-risk draft proposals',()=>{
 const p=prepare(manifest,existing,drafts,true,opts);
 assert.equal(p.eligible.length,23);
 assert.equal(p.skipped.length,0);
 assert.equal(p.sql.split('INSERT INTO social_posts').length-1,23);
 assert.doesNotMatch(p.sql,/\b(?:UPDATE|DELETE|DROP|ALTER)\b/i);
 assert.ok(p.sql.includes("'draft'"));
 assert.ok(p.sql.includes("'needs-generation'"));
 assert.ok(p.sql.includes('approved_by,approved_at'));
 assert.ok(p.sql.includes('NULL,NULL,NULL,NULL'));
 assert.ok(p.sql.includes("AND NOT EXISTS (SELECT 1 FROM social_posts"));
});
test('new conflicting date, existing title, and week cap fail closed without affecting other weeks',()=>{
 const conflictDate={id:'other-1',title:'unrelated',copy:'different',status:'pending_review',proposed_scheduled_at:'2027-03-02T10:00:00+08:00'};
 const p=prepare(manifest,[...existing,conflictDate],drafts,true,opts);
 assert.ok(!p.eligible.some(x=>x.date==='2027-03-02'));
 assert.ok(p.skipped.find(x=>x.id==='XJW-CAND-20270302'&&x.reason==='date_occupied'));
 const conflictTitle={id:'other-2',title:manifest.items.find(x=>x.date==='2027-03-09').title,status:'draft'};
 const s=prepare(manifest,[...existing,conflictTitle],drafts,true,opts);
 assert.ok(s.skipped.some(x=>x.id==='XJW-CAND-20270309'));
 const weekOver=[
 {id:'another-a',title:'No title same 1',copy:'other A',status:'draft',proposed_scheduled_at:'2027-03-01T10:00:00+08:00'},
 {id:'another-b',title:'No title same 2',copy:'other B',status:'pending_review',proposed_scheduled_at:'2027-03-03T10:00:00+08:00'}
 ];
 const q=prepare(manifest,[...existing,...weekOver],drafts,true,opts);
 assert.ok(q.skipped.some(x=>x.id==='XJW-CAND-20270302'&&x.reason==='weekly_cap'));
 assert.ok(q.skipped.some(x=>x.id==='XJW-CAND-20270305'&&x.reason==='weekly_cap'));
 assert.ok(q.eligible.some(x=>x.date==='2027-03-09'));
});
test('unknown D1 owner profile and unsafe edited draft fail closed',()=>{
 assert.throws(()=>prepare(manifest,existing,drafts,false,opts),/profile/);
 assert.throws(()=>prepare({...manifest,items:manifest.items.map((x,i)=>i?x:{...x,copy:'仙加味 治療疾病；本篇不應匯入'})},existing,drafts,true,opts),/unsafe/);
 assert.throws(()=>prepare({...manifest,safety:{...manifest.safety,autoPublish:true}},existing,drafts,true,opts),/contract/);
});
test('weekly time and date calculations retain Taiwan-local scheduled plan',()=>{
 assert.equal(localWeek('2027-03-02'),'2027-03-01');
 const p=prepare(manifest,existing,drafts,true,opts);
 assert.ok(p.sql.includes('2027-03-02T10:00:00+08:00'));
 assert.ok(!p.sql.includes('2027-03-02T02:00:00+08:00'));
});
