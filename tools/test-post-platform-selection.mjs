import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePostPlatformSelection} from '../src/worker.js';

const src=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
test('new post cannot silently select Facebook or Instagram when no platform is chosen',()=>{
 for(const invalid of [undefined,null,[],{},'',0]){
  const result=validatePostPlatformSelection(invalid);
  assert.equal(result.ok,false,String(invalid));
  assert.deepEqual(result.platforms,[]);
 }
 const worker=src('../src/worker.js');
 assert.match(worker,/if\(!selection\.ok\)return json\(\{error:selection\.error\},400\)/);
 assert.doesNotMatch(worker,/if\(!post\.platforms\.length\)post\.platforms=\['Facebook','Instagram'\]/);
});
test('invalid and mixed unsupported platform choices fail together, never silently drop an option',()=>{
 for(const invalid of [
  ['Facebook','not-real'],['Instagram',null],['Threads',{}],
  ['LINE OA',''],['Google 商家',4],['Facebook',' '],
  Array.from({length:13},()=> 'Facebook')
 ]){
  const result=validatePostPlatformSelection(invalid);
  assert.equal(result.ok,false,JSON.stringify(invalid));
  assert.deepEqual(result.platforms,[]);
 }
});
test('known channels deduplicate, preserve order, and normalize legacy LINE OA broadcast to the canonical channel',()=>{
 const v=validatePostPlatformSelection(['Instagram','Facebook','Instagram','LINE OA 廣播','LINE OA','Threads']);
 assert.equal(v.ok,true);
 assert.deepEqual(v.platforms,['Instagram','Facebook','LINE OA','Threads']);
 assert.deepEqual(validatePostPlatformSelection(['LINE VOOM']).platforms,['LINE VOOM']);
});
test('new post never implicitly subscribes to unverified Threads; edit preserves previously selected channels',()=>{
 const ui=src('../assets/js/publishing-app-v2.js');
 const fallback=src('../assets/js/manual-publish-tools.js');
 const html=src('../publishing.html');
 assert.match(ui,/const newPostDefaults=\['Facebook','Instagram'\]/);
 assert.match(ui,/post\?\.platforms\|\|newPostDefaults/);
 assert.doesNotMatch(ui,/\['Facebook','Instagram','Threads'\]\)\.includes\(name\)/);
 assert.match(ui,/if\(!chosen\.length\)throw Error\('請先明確選擇至少一個發布平台/);
 assert.match(fallback,/input\.value='Threads';input\.checked=false/);
 assert.doesNotMatch(fallback,/input\.value='Threads';input\.checked=true/);
 assert.match(html,/publishing-app-v2\.js\?v=20261028-ai-approved-filter-v16/);
 assert.equal((html.match(/manual-publish-tools\.js\?v=20261026-explicit-threads-v5/g)||[]).length,2);
});
test('publisher still requires valid platform selection, remote post receipts and human approval before sending',()=>{
 const pub=src('../src/social-publisher.js');
 assert.match(pub,/reason:'invalid_platform_selection'/);
 assert.match(pub,/preDispatchAtomicClaim:true/);
 assert.match(pub,/delivery_outcome_unverified:true/);
});
