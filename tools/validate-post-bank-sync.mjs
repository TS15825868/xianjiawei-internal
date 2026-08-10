import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};
const sync=read('assets/js/post-bank-sync.js');
const html=read('publishing.html');
const pkg=read('package.json');
const gate=read('src/publishing-review-gate-entry.js');

for(const token of [
  "post-bank-export.html",
  "xjw-post-bank-export-v1",
  "const EXPORT_RUNTIME=",
  "const PRODUCT_IMAGE_VERSION=",
  "event.data.product_image_version!==PRODUCT_IMAGE_VERSION",
  "event.data.retired_assets_removed!==true",
  "event.data.runtime!==EXPORT_RUNTIME",
  "knownMinimum<KNOWN_REGENERATION_MINIMUM",
  "posts.length!==500",
  "PUBLIC_ORIGIN='https://ts15825868.github.io'",
  "WRITE_CONCURRENCY=4",
  "protectedPost(post)",
  "campaignHold(post)",
  "existingIdentity(existing)",
  "existingIds",
  "legacyTitles",
  "missingPosts(active,existing)",
  "SOURCE_PREFIX='公開500母庫:'",
  "image_status||''",
  "needs_generation",
  "/regeneration-ready",
  "data-sync-post-bank",
  "window.confirm",
]) must(sync.includes(token),`500篇母庫同步缺少安全契約：${token}`);

const exporterRuntime=sync.match(/const EXPORT_RUNTIME=['\"]([^'\"]+)['\"]/i)?.[1]||'';
must(exporterRuntime&&/export/i.test(exporterRuntime)&&/retired-assets-removed/i.test(exporterRuntime),'500篇 exporter runtime 必須保留「退役資產已移除」能力識別');
const productImageVersion=sync.match(/const PRODUCT_IMAGE_VERSION=['\"]([^'\"]+)['\"]/i)?.[1]||'';
must(productImageVersion&&/products-v3/i.test(productImageVersion)&&!/products-v2/i.test(productImageVersion),'500篇同步產品圖權威必須維持products-v3正式原圖系列');
const knownMinimum=Number(sync.match(/KNOWN_REGENERATION_MINIMUM=(\d+)/)?.[1]||0);
must(knownMinimum>=121,`500篇母庫已知重生成安全門檻不得低於121，目前${knownMinimum}`);
const syncVersion=sync.match(/const VERSION=['\"]([^'\"]+)['\"]/i)?.[1]||'';
must(syncVersion&&/post-bank-sync/i.test(syncVersion),'500篇母庫同步工具必須有正式版本識別');

must(sync.includes("if(posts.length!==500)"),'母庫不是500篇時必須拒絕同步');
must(sync.includes("new Set(ids).size!==posts.length"),'母庫ID重複時必須拒絕同步');
must(sync.includes("if(id)existingIds.add(id)"),'正式母庫資料必須以source id去重');
must(sync.includes("else{const title=titleOf(post);if(title)legacyTitles.add(title)}"),'只有無source id的舊資料才允許用標題相容去重');
must(!sync.includes("existingTitles=new Set(existing.map"),'不得再用全部既有標題去重，避免不同ID同標題貼文被誤刪');
must(sync.includes("if(protectedPost")||sync.includes("filter(protectedPost"),'已發布鎖定必須被識別');
must(sync.includes("filter(p=>!protectedPost(p)&&!campaignHold(p))"),'正式同步必須排除已發布鎖定與活動冷卻');
must(sync.includes("const requires=needsGeneration(post),image=requires?'':absoluteImage(post.image_url)"),'需重生成貼文不得帶入舊錯圖');
must(sync.includes('event.data.runtime!==EXPORT_RUNTIME'),'500篇同步必須拒絕不同步 exporter runtime');
must(sync.includes('event.data.retired_assets_removed!==true'),'500篇同步必須確認退役產品卡片資產已移除');
must(sync.includes('event.data.product_image_version!==PRODUCT_IMAGE_VERSION'),'500篇同步必須拒絕不同步產品圖權威');
must(sync.includes('knownMinimum<KNOWN_REGENERATION_MINIMUM'),'500篇同步必須拒絕低於正式重生成門檻的 exporter');
must(!sync.includes('/publish-now'),'500篇同步不得呼叫立即發布');
must(!sync.includes("status:'approved'")&&!sync.includes("status:'scheduled'")&&!sync.includes("status:'published'"),'500篇同步不得自行建立已核准／排程／發布狀態');
must(gate.includes('/regeneration-ready')&&gate.includes("status='pending_review'"),'安全候選送待審核必須由正式review gate處理');
must(/post-bank-sync\.js\?v=[^\"']+/.test(html),'貼文系統沒有載入正式500篇母庫同步工具或缺少快取版本');

// 重生成守門改驗正式能力，不再綁舊版固定文案字串。
for(const token of [
  '圖不符合／文案不符合／全部重新生成',
  '原核准自動失效',
  '儲存後會自動回到「待審核」',
  '不會自動核准或發布',
  '需要重新生成的內容不得沿用舊錯圖',
]) must(html.includes(token),`貼文系統缺少重生成安全能力說明：${token}`);

must(html.includes('products-v3')&&!html.includes('products-v2-actual-photos'),'貼文系統沒有維持目前products-v3正式產品圖權威');
must(pkg.includes('assets/js/post-bank-sync.js'),'部署包沒有包含500篇母庫同步工具');

console.log(`PASS：500篇母庫以可信postMessage來源重建；exporter與內部sync雙邊驗證退役資產已移除、products-v3正式原圖與至少${knownMinimum}篇已知重生成。正式內容依source id去重，只有無source id舊資料才以標題相容去重；已發布／活動冷卻不動，安全候選只進待審核，需重生成只建草稿，絕不自動發布；重生成守門驗正式能力，不再被舊固定文案誤擋。`);