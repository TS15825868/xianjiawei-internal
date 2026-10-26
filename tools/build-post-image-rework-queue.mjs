import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { publishedPlatformReceiptHold } from '../src/external-published-receipt-holds.js';

// Read-only production backlog. This is deliberately separate from the
// missing-image draft queue: existing-but-rejected images must not be ignored.
const REWORK_FLAGS = new Set(['needs_rework','needs_regeneration','rejected','low','missing']);
const BLOCKED_STATUSES = new Set(['published','archived','manual_required']);
const PRODUCT_TERMS = ['龜鹿飲30cc','龜鹿飲180cc','龜鹿膏','鹿茸粉','參仲四物飲','龜鹿活力飲','四珍寶','二珍寶','丹參','龜鹿膠','龜鹿湯塊','柒玄茶'];
const WINDOW_ORDER = Object.freeze({evergreen:0,weather_dynamic:1,season_dynamic:2,year_end_window:3,new_year_window:4,lunar_new_year_window:5});
function clean(v){return String(v??'').trim()}
function windowFor(row){
  const s=[row.id,row.title,row.category].map(clean).join(' ').toLowerCase();
  if(/cny-|春節|農曆|除夕|元宵|年節/.test(s))return 'lunar_new_year_window';
  if(/year-end-|年末|年底|歲末/.test(s))return 'year_end_window';
  if(/new-year-|元旦|新年|年初/.test(s))return 'new_year_window';
  if(/weather-|下雨|天氣|溫差/.test(s))return 'weather_dynamic';
  if(/season-|換季|冬天|春天|夏天|秋天/.test(s))return 'season_dynamic';
  return 'evergreen';
}
export function buildPlan(rows, sceneByPostId={}){
  if(!Array.isArray(rows))throw Error('D1 snapshot did not contain a row array');
  const ids=new Set(), items=[], counts={};
  for(const row of rows){
    const status=clean(row.status),q=clean(row.image_quality_status).toLowerCase();
    if(BLOCKED_STATUSES.has(status)||!REWORK_FLAGS.has(q))continue;
    if(!['draft','pending_review','approved','scheduled'].includes(status))continue;
    const id=clean(row.id);
    if(!id||ids.has(id))throw Error('Duplicate or missing post ID in rework queue: '+id);
    ids.add(id);
    const scene=clean(sceneByPostId[id])||clean(row.image_alt);
    const text=[row.title,row.headline,row.copy,row.image_alt].map(clean).join(' ');
    const products=PRODUCT_TERMS.filter(word=>text.includes(word));
    // Existing copy often says just "30cc 跟 180cc" while its formal
    // product scene/image-alt identifies the approved 龜鹿飲 variants.
    // Never omit the corresponding original package photo in a comparison.
    if(/(?:^|[^\\d])30\\s*cc/i.test(text) && !products.includes('龜鹿飲30cc'))products.push('龜鹿飲30cc');
    if(/(?:^|[^\\d])180\\s*cc/i.test(text) && !products.includes('龜鹿飲180cc'))products.push('龜鹿飲180cc');
    const window=windowFor(row);
    counts[status]=(counts[status]||0)+1;
    const remoteHold=publishedPlatformReceiptHold(row);
    items.push({
      postId:id, title:clean(row.title), status, imageQualityStatus:q,
      existingImageUrl:clean(row.image_url), imageAlt:clean(row.image_alt),
      scene, sceneSource:clean(sceneByPostId[id])?'formal_scene_map':'current_image_alt',
      sceneRequiresManualReview:!clean(sceneByPostId[id]),
      category:clean(row.category), productsMentioned:products,
      copyHash:crypto.createHash('sha256').update(clean(row.copy)).digest('hex').slice(0,16),
      window, priority:status==='approved'||status==='scheduled'?'urgent_hold':status==='pending_review'?'review_backlog':'draft_backlog',
      requiredAction:remoteHold?'reconcile_previously_published_platform_receipts':clean(row.image_url)?'replace_existing_rejected_image':'produce_missing_or_rejected_image',
      publicationReconciliationRequired:Boolean(remoteHold),
      safeToBeginImageRework:!remoteHold,
      productionRules:[
        '以本篇當前文案和對應場景重新製作專屬情境，禁止重複使用既有貼文圖片',
        '小老闆維持正式Q版幼童：短黑髮、大眼睛、米白中式上衣、深橄欖綠圍裙、胸前紅色直式「仙加味」印章',
        '小鹿與小烏龜必須分開，場景、季節、天氣、動作、產品溫度一致',
        '產品只使用使用者核准的正式實拍原圖等比例合成；AI不得重新設計瓶罐、鋁袋、標籤、產品尺寸',
        '不擅自修改本文、D1狀態、原圖片綁定或核准紀錄；新圖需由使用者人工確認再回待審核'
      ],
      readyForAutomaticPublication:false,requiresHumanVisualReview:true
    });
  }
  items.sort((a,b)=>(WINDOW_ORDER[a.window]-WINDOW_ORDER[b.window])||
    (a.priority==='urgent_hold'?-1:b.priority==='urgent_hold'?1:0)||
    a.postId.localeCompare(b.postId));
  return {
    version:'2026-10-26-live-rework-v1',brand:'仙加味',
    source:'Cloudflare D1 live social_posts; read-only snapshot; excludes published, archived and manual_required',
    status:'image-rework-production-backlog-not-approved',total:items.length,
    externalReceiptReconciliationCount:items.filter(x=>x.publicationReconciliationRequired).length,
    eligibleForImageReworkCount:items.filter(x=>x.safeToBeginImageRework).length,
    byStatus:counts,hasMissingScenes:items.some(x=>!x.scene),
    warning:'這不是已生成或已核准圖片；不能自動推進貼文狀態或發文。需逐張核對正式原圖、固定小老闆與圖文一致。',
    originalAssetAuthority:'使用者已提供的正式原圖或官網最新已核准原圖；未驗證不得自創產品外觀。',
    items
  };
}
export function rowsFromSnapshot(doc){
  const first=Array.isArray(doc)?doc[0]:doc;
  if(!first||!Array.isArray(first.results))throw Error('D1 snapshot results missing');
  return first.results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [inputPath,scenePath,outputPath]=process.argv.slice(2);
  if(!inputPath||!scenePath||!outputPath)throw Error('Usage: node tools/build-post-image-rework-queue.mjs <D1-export.json> <scene-map.json> <output.json>');
  const rows=rowsFromSnapshot(JSON.parse(fs.readFileSync(inputPath,'utf8')));
  const scenes=JSON.parse(fs.readFileSync(scenePath,'utf8')).sceneByPostId||{};
  const plan=buildPlan(rows,scenes);
  fs.writeFileSync(outputPath,JSON.stringify(plan,null,2)+'\n');
  console.log('PASS live image rework production queue: '+plan.total+' active flagged posts, byStatus='+JSON.stringify(plan.byStatus));
  if(process.env.GITHUB_STEP_SUMMARY){
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,[
      '## 圖片實際待重製工作清單（只讀，不是已完成）','',
      '- 待修資料：'+plan.total+' 篇；其中已發布紀錄需先核對 '+plan.externalReceiptReconciliationCount+' 篇；其他圖片重製候選 '+plan.eligibleForImageReworkCount+' 篇；待審核 '+(plan.byStatus.pending_review||0)+'；草稿 '+(plan.byStatus.draft||0),
      '- 清單附每篇專屬情境、原圖位置、產品提及、文案指紋及固定角色要求；不包含完整未發布文案。',
      '- 不修改貼文、圖片、排程或發布；實際產圖及人工視覺審核仍未完成。',''
    ].join('\n')+'\n');
  }
}