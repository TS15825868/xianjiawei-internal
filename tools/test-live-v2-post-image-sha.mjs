import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve, relative, sep} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const report=JSON.parse(readFileSync(new URL('../ops/receipts/20261122-live-46-latest-review-version-delta.json',import.meta.url),'utf8'));
const changed=report.delta.filter(x=>x.image_sha_changed);
const exactPaths=new Map([
 ['XJW-CONV-chat-receive-package','assets/post-images/2026-11-12/XJW-CONV-chat-receive-package-v2.jpg'],
 ['XJW-CONV-weather-cool-drink','assets/post-images/2026-11-12/XJW-CONV-weather-cool-drink-v2.jpg']
]);
test('only the two current D1-reviewed v2 images are compared (no network or publication)',()=>{
  assert.equal(report.delta_count,17);
  assert.equal(report.live_latest_46_review_decisions,'NEEDS_HUMAN_REVIEW');
  assert.equal(report.production_d1_rows_written_this_query,0);
  assert.equal(report.any_external_publish_authorized,false);
  assert.equal(changed.length,2);
  assert.deepEqual(new Set(changed.map(x=>x.post_id)),new Set(exactPaths.keys()));
});
for(const image of changed){
  test('current GitHub image bytes match exact latest D1 review SHA: '+image.post_id,()=>{
    const u=new URL(image.live_latest_image_url);
    assert.equal(u.protocol,'https:');
    assert.equal(u.hostname,'raw.githubusercontent.com');
    const expected='/TS15825868/xianjiawei-internal/main/'+exactPaths.get(image.post_id);
    assert.equal(u.pathname,expected);
    assert.equal(u.search,'');
    const pathname=resolve(root,exactPaths.get(image.post_id));
    const rel=relative(root,pathname);
    assert.ok(rel && !rel.startsWith('..'+sep) && !rel.startsWith('..'));
    const bytes=readFileSync(pathname);
    const size=statSync(pathname).size;
    assert.ok(size>=10_000 && size<=10_000_000);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),image.live_latest_image_sha256);
    assert.notEqual(image.old_image_sha256,image.live_latest_image_sha256);
    assert.equal(image.release_allowed,false);
  });
}
