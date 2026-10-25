'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const worker=fs.readFileSync(path.join(root,'src/worker.js'),'utf8');
const production=fs.readFileSync(path.join(root,'src/production-entry.js'),'utf8');
const between=(source,start,end)=>{
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Expected production function not found');
 return source.slice(a,b);
};
test('post edits cannot erase published history or race against approval and release',()=>{
 const f=between(worker,'async function updatePost(','async function changePostStatus(');
 assert.match(f,/before\.published_at/);
 assert.match(f,/manual_required/);
 assert.match(f,/AND status=\? AND published_at IS NULL AND COALESCE\(updated_at,''\)=\?/);
 assert.doesNotMatch(f,/published_at=NULL/);
 assert.match(f,/Number\(applied\?\.meta\?\.changes\)!==1/);
});
test('post status transition uses compare and swap and does not recycle historical publication',()=>{
 const f=between(worker,'async function changePostStatus(','async function publishNow(');
 assert.match(f,/before\.published_at&&next!=='archived'/);
 assert.match(f,/AND status=\? AND \(published_at IS NULL OR \?='archived'\)/);
 assert.match(f,/Number\(applied\?\.meta\?\.changes\)!==1/);
});
test('immediate publish must reserve an unposted state before invoking any sender',()=>{
 const f=between(worker,'async function publishNow(','export async function overview(');
 assert.match(f,/AND status=\? AND published_at IS NULL/);
 assert.match(f,/Number\(reserved\?\.meta\?\.changes\)!==1/);
 assert.ok(f.indexOf('Number(reserved?.meta?.changes)')<f.indexOf('publishPostById('));
});
test('scheduled fallback cannot reset rows published during its review check',()=>{
 const f=between(production,'async function quarantineUngatedDuePosts(','async function productionHealth(');
 assert.match(f,/AND status='scheduled' AND published_at IS NULL AND scheduled_at=\?/);
 assert.match(f,/if\(Number\(changed\?\.meta\?\.changes\)!==1\)continue;/);
 assert.ok(f.indexOf('changed?.meta?.changes')<f.indexOf('quarantined+=1'));
});
