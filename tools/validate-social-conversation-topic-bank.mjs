import fs from 'node:fs';

const file = 'assets/data/social-conversation-topic-bank-current.json';
const bank = JSON.parse(fs.readFileSync(file, 'utf8'));
const errors = [];
const req = (ok, message) => { if (!ok) errors.push(message); };
const text = (value) => String(value ?? '');

req(/^2026-09-15-conversation-content-v2/.test(text(bank.version)), '題庫版本不是目前混合季節版');
req(bank.brand === '仙加味', '題庫品牌不是仙加味');
req(Array.isArray(bank.topics) && bank.topics.length >= 50, '正式題庫不足50題，無法支撐到農曆年前後');
req(bank.rules?.publishingSequencePolicy?.mode === 'mixed_dynamic_pool', '未啟用混合動態發布池');
req(bank.rules?.publishingSequencePolicy?.avoidBackToBackSameCategory === true, '未禁止同類內容連續發布');
req(bank.rules?.publishingSequencePolicy?.avoidBackToBackSameProduct === true, '未禁止同產品連續發布');
req(bank.rules?.publishingSequencePolicy?.reorderBeforeScheduling === true, '正式排程前必須重新穿插題材');
req(Number(bank.rules?.publishingSequencePolicy?.minimumGapForSimilarAngle || 0) >= 6, '相似角度間隔不足');
req(bank.rules?.weatherPolicy?.mode === 'dynamic_override', '未啟用突發天氣覆寫規則');
req(text(bank.rules?.weatherPolicy?.area).includes('萬華'), '天氣規則未對應萬華');
req(text(bank.rules?.seasonalPolicy?.horizon).includes('農曆'), '季節內容未涵蓋農曆年前後');
req(text(bank.rules?.mascotPolicy?.character).includes('Q版小男孩'), '小老闆未鎖定Q版小男孩');
req(text(bank.rules?.productVisualPolicy).includes('正式實物原圖'), '產品視覺未鎖定正式原圖');
req(text(bank.rules?.productVisualPolicy).includes('30cc') && text(bank.rules?.productVisualPolicy).includes('小玻璃裸罐'), '30cc正式小玻璃裸罐規則缺失');
req(text(bank.rules?.productVisualPolicy).includes('180cc') && text(bank.rules?.productVisualPolicy).includes('鋁袋'), '180cc正式鋁袋規則缺失');
req(Array.isArray(bank.rules?.blockedPublicProducts) && bank.rules.blockedPublicProducts.includes('柒玄茶・龜鹿調飲粉'), '未封鎖尚未完成的柒玄茶・龜鹿調飲粉');
req(text(bank.rules?.videoPolicy).includes('完整正式情境圖'), '短影片失敗時缺少完整正式情境圖fallback');
req(text(bank.rules?.reviewRule).includes('待審核') && text(bank.rules?.reviewRule).includes('不自動發布'), '人工審核流程缺失');

const allowedProducts = new Set(bank.rules?.allowedPublicProductIds || []);
const ids = new Set();
const titles = new Set();
const categorySet = new Set();
const seasonSet = new Set();

for (const topic of bank.topics || []) {
  const id = text(topic.id).trim();
  const title = text(topic.title).trim();
  const publicText = [topic.title, topic.headline, topic.copy].map(text).join('\n');
  req(Boolean(id), '存在缺少id的題目');
  req(Boolean(title), `${id || '(unknown)'}: 缺少標題`);
  if (ids.has(id)) errors.push(`${id}: id重複`); else ids.add(id);
  if (titles.has(title)) errors.push(`${id}: 標題重複「${title}」`); else titles.add(title);
  if (publicText.includes('柒玄茶') || (topic.productIds || []).some(x => text(x).includes('qixuan'))) errors.push(`${id}: 對外題目誤用未完成柒玄茶系列`);
  if ((topic.productIds || []).some(x => !allowedProducts.has(x))) errors.push(`${id}: 使用未核准產品ID ${JSON.stringify(topic.productIds)}`);
  if (topic.seedToReview !== false) errors.push(`${id}: seedToReview必須維持false，未完成素材不得直接送審`);
  if (!Array.isArray(topic.formatPreference) || !topic.formatPreference.includes('full_image_fallback')) errors.push(`${id}: 缺少完整正式情境圖fallback`);
  if (text(topic.imageUrl).trim()) errors.push(`${id}: 題庫不應預綁未審核圖片`);
  if (!text(topic.imageSource).trim()) errors.push(`${id}: 缺少圖片來源/製作規則`);
  if (!text(topic.mascotAction).trim()) errors.push(`${id}: 缺少小老闆動作設定`);
  categorySet.add(text(topic.category));
  seasonSet.add(text(topic.season));
}

req(categorySet.size >= 12, `內容類型不足，只有${categorySet.size}種`);
for (const season of ['evergreen', 'cool_season', 'year_end', 'new_year', 'pre_lunar_new_year', 'lunar_new_year', 'post_lunar_new_year', 'weather_trigger']) {
  req(seasonSet.has(season), `缺少季節窗口 ${season}`);
}

const mixedOrder = bank.defaultMixedOrder || [];
req(Array.isArray(mixedOrder) && mixedOrder.length >= 35, '預設混合母序不足35題');
req(new Set(mixedOrder).size === mixedOrder.length, '預設混合母序有重複ID');
for (const id of mixedOrder) req(ids.has(id), `預設混合母序引用不存在題目 ${id}`);
// 這是內容母池，不是硬排程。正式排程前仍依 policy 再打散；守門只禁止三篇以上形成系列區塊。
for (let i = 2; i < mixedOrder.length; i += 1) {
  const a = bank.topics.find(t => t.id === mixedOrder[i - 2]);
  const b = bank.topics.find(t => t.id === mixedOrder[i - 1]);
  const c = bank.topics.find(t => t.id === mixedOrder[i]);
  if (a && b && c && a.category === b.category && b.category === c.category) {
    errors.push(`混合母池形成三篇同類系列區塊：${a.id} → ${b.id} → ${c.id} (${a.category})`);
  }
}

for (const [windowName, list] of Object.entries(bank.seasonalInsertions || {})) {
  req(Array.isArray(list) && list.length > 0, `${windowName}: 季節插入清單為空`);
  for (const id of list || []) req(ids.has(id), `${windowName}: 引用不存在題目 ${id}`);
}
for (const id of bank.weatherTriggerTopics || []) {
  const topic = bank.topics.find(t => t.id === id);
  req(Boolean(topic), `天氣觸發題不存在 ${id}`);
  req(topic?.triggerOnly === true, `${id}: 天氣題必須標示triggerOnly=true`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`PASS social topic bank: ${bank.topics.length} topics, ${categorySet.size} categories, seasons=${[...seasonSet].join(',')}`);
