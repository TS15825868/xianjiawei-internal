import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const worker=read('../src/worker.js');
const gate=read('../src/publishing-review-gate-entry.js');
const ui=read('../assets/js/publishing-app-v2.js');
const helper=read('../assets/js/manual-publish-tools.js');
test('no approved or scheduled post may be fabricated as published through generic status API',()=>{
 assert.match(worker,/if\(next==='published'\)return json\(\{error:/);
 assert.match(worker,/scheduled:\['draft'\]/);
 assert.doesNotMatch(worker,/scheduled:\['draft','published'\]/);
 assert.match(gate,/if\(body\?\.status==='published'\)return json\(\{error:/);
});
test('manual handling UI removes dead bypass button and retains real per-platform status inspection',()=>{
 assert.match(ui,/data-post-deliveries/);
 assert.match(ui,/各平台發布結果/);
 assert.doesNotMatch(ui,/data-post-status="published"|手動補登已發布/);
 assert.match(ui,/部分平台尚未取得可採信的發布回執/);
 assert.doesNotMatch(helper,/manualMarkPublished|data-manual-published|手動補登已發布/);
 assert.doesNotMatch(helper,/status:'published'|status:"published"/);
 assert.match(helper,/data-manual-package/);
});
function loadHelper(){
 const context={window:{},document:{readyState:'loading',addEventListener(){}},setTimeout(){}};
 runInNewContext(helper,context,{filename:'manual-publish-tools.js'});
 return context.window.XJWManualPublishTools;
}
test('manual package lists only platforms lacking verified remote receipts',()=>{
 const packageTools=loadHelper();
 const post={id:'safe-20261026',status:'manual_required',
  title:'有部分平台待查核',copy:'人工已核准文案',
  platforms:['Facebook','Instagram','LINE VOOM'],image_url:'https://example.test/img.webp'};
 const deliveries={platforms:[
  {platform:'Facebook',status:'published',remote_id:'fb-verified-123'},
  {platform:'Instagram',status:'manual_required',remote_id:''},
  {platform:'LINE VOOM',status:'sending',remote_id:''}
 ]};
 const text=packageTools.packageText(post,deliveries);
 assert.match(text,/已取得正式回執.*Facebook/);
 assert.match(text,/待人工核對.*Instagram.*LINE VOOM/);
 assert.doesNotMatch(text,/待人工核對.*Facebook/);
 assert.match(text,/不要直接重發|不可直接重發/);
 assert.doesNotMatch(text,/手動補登已發布/);
});
test('published delivery lacking official remote ID is not trusted as confirmation',()=>{
 const p=loadHelper(),text=p.packageText(
  {id:'unknown',status:'manual_required',platforms:['Facebook','LINE OA']},
  {platforms:[{platform:'Facebook',status:'published',remote_id:''}]});
 assert.match(text,/待人工核對.*Facebook.*LINE OA/);
 assert.doesNotMatch(text,/已取得正式回執.*Facebook/);
});
test('Threads status widget never forces connected/ready green status',()=>{
 assert.doesNotMatch(helper,/chip\.classList\.add\('ready'\)/);
 assert.doesNotMatch(helper,/chip\.textContent='Threads：Metricool 發布'/);
 assert.match(helper,/chip\.dataset\.threadsRoute='metricool'/);
});

test('Threads main platform chip is not hardcoded green before Metricool remote proof',()=>{
 assert.match(ui,/Threads：Metricool 待遠端發布驗證/);
 assert.match(ui,/platform-chip manual" data-threads-route="metricool"/);
 assert.doesNotMatch(ui,/platform-chip ready" data-threads-route="metricool"/);
});

test('manual required UI shows verification rather than direct publication or unproven retries',()=>{
 const html=read('../publishing.html');
 assert.match(html,/<option value="manual_required">需人工核對<\/option>/);
 assert.match(ui,/manual_required:'需人工核對'/);
 assert.match(helper,/function eligible\(card\).*需人工核對/);
 assert.match(helper,/const done=confirmedPlatformsFor\(delivery\)/);
 assert.doesNotMatch(worker,/系統會依重試規則繼續處理/);
 assert.match(worker,/不會自動重送/);
});
