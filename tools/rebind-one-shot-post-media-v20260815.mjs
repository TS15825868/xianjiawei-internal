import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const dataDir = path.join(ROOT, 'assets', 'data');
const mediaPath = path.join(dataDir, 'post-smallboss-media-v20260815.json');
const guiluPath = path.join(dataDir, 'guilu-context-media-v20260815.json');
const socialPath = path.join(dataDir, 'social-image-audit-v20260815.json');

const media = JSON.parse(fs.readFileSync(mediaPath, 'utf8'));
const guilu = JSON.parse(fs.readFileSync(guiluPath, 'utf8'));
const social = JSON.parse(fs.readFileSync(socialPath, 'utf8'));

const SITE = 'https://ts15825868.github.io/xianjiawei';
const BRAND = `${SITE}/images/brand/approved-v405`;
const LIFE = `${SITE}/images/post-library/userzip3-v20260811`;

const approved = {
  brand: `${BRAND}/brand-story.webp`,
  choose: `${BRAND}/choose.webp`,
  contact: `${BRAND}/contact-line.webp`,
  faq: `${BRAND}/faq.webp`,
  use: `${BRAND}/guide-how-to-use.webp`,
  home: `${BRAND}/home-brand.webp`,
  combo: `${BRAND}/combo.webp`,
  drink30: `${BRAND}/product-guilu-drink-30cc.webp`,
  drink180: `${BRAND}/product-guilu-drink-180cc.webp`,
  gao: `${BRAND}/product-guilu-gao-100g.webp`,
  jiao: `${BRAND}/product-guilu-jiao-600g.webp`,
  tangkuai: `${BRAND}/product-guilu-tangkuai-75g.webp`,
  luerong: `${BRAND}/product-luerong-fen-75g.webp`,
  all: `${BRAND}/products-all.webp`,
  recipes: `${BRAND}/recipes.webp`,
  routine: `${LIFE}/choose-by-routine.webp`,
  hydration: `${LIFE}/daily-hydration.webp`,
  hot: `${LIFE}/hot-weather-hydration.webp`,
  hot2: `${LIFE}/hot-weather-hydration-2.webp`,
  rainyHome: `${LIFE}/rainy-home.webp`,
  rainy: `${LIFE}/rainy-warm.webp`,
  family: `${LIFE}/self-care-family.webp`,
  family2: `${LIFE}/self-care-family-2.webp`,
  storage: `${LIFE}/storage.webp`,
  temperature: `${LIFE}/temperature-coat.webp`,
  temperature2: `${LIFE}/temperature-coat-2.webp`,
  warm: `${LIFE}/warm-rhythm.webp`,
  warmWater: `${LIFE}/warm-water.webp`
};

const genericPool = [
  approved.routine, approved.hydration, approved.hot, approved.hot2,
  approved.rainyHome, approved.rainy, approved.family, approved.family2,
  approved.storage, approved.temperature, approved.temperature2,
  approved.warm, approved.warmWater,
  approved.home, approved.choose, approved.contact, approved.combo,
  approved.brand, approved.recipes, approved.all, approved.use, approved.faq
];
const genericUsed = new Map();
const domainFor = id => id.startsWith('XJW-GUILU-') ? 'guilu' : id.startsWith('XJW-SOCIAL-') ? 'social' : 'legacy';
const usedFor = id => {
  const domain=domainFor(id);
  if(!genericUsed.has(domain)) genericUsed.set(domain,new Set());
  return genericUsed.get(domain);
};
const uniqueScene = (id, candidates=[]) => {
  const used=usedFor(id);
  for(const url of [...candidates, ...genericPool]){
    if(!url || used.has(url)) continue;
    used.add(url);
    return url;
  }
  throw new Error(`${id}: no unique approved generic scene remains`);
};

function chooseAuthority(id, item) {
  const text = `${id} ${item?.imageAlt || ''}`.toLowerCase();

  // Legacy cards with an exact product/scene authority.
  if (id === 'POST-COMBO') return uniqueScene(id, [approved.family]);
  if (id === 'POST-DRINK') return approved.drink30;
  if (id === 'POST-GAO-100') return approved.gao;
  if (id === 'POST-LUERONG') return approved.luerong;
  if (id === 'POST-SEASONS-RHYTHM') return uniqueScene(id, [approved.temperature]);

  // Final three social rows get a dedicated, non-shared formal image before generic matching.
  // Cooking uses the actual recipe scene; craft uses the heat/cooking combo scene;
  // Wanhua uses the formal brand-story scene. All three are reserved in the social image pool.
  if (id === 'XJW-SOCIAL-20260815-01-daily-cooking') return uniqueScene(id, [approved.recipes]);
  if (id === 'XJW-SOCIAL-20260815-03-craft-time-and-heat') return uniqueScene(id, [approved.combo]);
  if (id === 'XJW-SOCIAL-20260815-03-wanhua-visit-brand') return uniqueScene(id, [approved.brand]);

  // Product-specific copy always keeps the real approved product appearance.
  // These are fixed product authority images and may repeat within the same product family.
  if (/drink180|drink-180|product-drink-180|180cc/.test(text)) return approved.drink180;
  if (/drink30|drink-30|product-drink-30|30cc/.test(text)) return approved.drink30;
  if (/tangkuai|湯塊/.test(text)) return approved.tangkuai;
  if (/jiao|龜鹿膠|600g|18\.75/.test(text)) return approved.jiao;
  if (/luerong|鹿茸|茸粉/.test(text)) return approved.luerong;
  if (/gao|龜鹿膏|100g|半匙/.test(text)) return approved.gao;

  // Generic themes must use a unique full-scene image within each source bank.
  if (/storage|保存/.test(text)) return uniqueScene(id, [approved.storage]);
  if (/rain|雨天|下雨/.test(text)) return uniqueScene(id, [approved.rainy, approved.rainyHome]);
  if (/temperature|溫差|換季|季節|seasons/.test(text)) return uniqueScene(id, [approved.temperature, approved.temperature2, approved.hot, approved.hot2]);
  if (/warm|hot-water|溫熱|熱水|沖泡/.test(text)) return uniqueScene(id, [approved.warm, approved.warmWater, approved.use]);
  if (/cooking|料理|燉|雞湯|排骨湯|soup|recipe/.test(text)) return uniqueScene(id, [approved.recipes, approved.combo]);
  if (/work-break|工作空檔|居家日常|home|family|家庭使用|routine|日常節奏|日常/.test(text)) return uniqueScene(id, [approved.family, approved.family2, approved.routine, approved.home]);
  if (/choose|怎麼選|哪三件事|first-three/.test(text)) return uniqueScene(id, [approved.routine, approved.choose]);
  if (/consult|諮詢|line|聯絡/.test(text)) return uniqueScene(id, [approved.contact]);
  if (/萬華|wanhua|四代|品牌故事|傳承/.test(text)) return uniqueScene(id, [approved.brand, approved.home]);
  if (/made-order|5～7|工作天|熬製|火候|craft|傳統|modern-tradition/.test(text)) return uniqueScene(id, [approved.combo, approved.home, approved.brand]);
  if (/forms|比較|總覽|規格|型態|成分|一次認識/.test(text)) return uniqueScene(id, [approved.all, approved.choose]);

  return uniqueScene(id, [approved.home]);
}

function altFor(id, item, url) {
  const topic = String(item?.imageAlt || '')
    .replace(/^仙加味小老闆情境圖｜?/, '')
    .replace(/^仙加味｜/, '')
    .replace(/｜(?:完整單一小老闆情境|正式產品與小老闆情境)$/, '')
    .trim();
  const kind = /\/product-|\/products-all\.webp$/.test(url)
    ? '正式產品與小老闆情境'
    : '完整單一小老闆情境';
  return `仙加味｜${topic || id}｜${kind}`;
}

const entries = Object.entries(media.overrides || {});
if (entries.length !== 59) throw new Error(`expected 59 media bindings, got ${entries.length}`);

media.version = '2026-08-15-one-shot-non-collage-v3';
media.brandDisplay = '仙加味';
media.policy = {
  oneShotSceneOnly: true,
  noCollage: true,
  useExistingApprovedMediaFirst: true,
  realProductAppearanceIsAuthority: true,
  sameProductAuthorityMediaMayRepeat: true,
  genericLifestyleMediaUniqueWithinBank: true,
  seasonWeatherTemperatureContextMustMatchCopy: true,
  ownerReviewRequired: true,
  blockedDisplayName: '台興山產'
};

for (const [id, item] of entries) {
  const imageUrl = chooseAuthority(id, item);
  item.imageUrl = imageUrl;
  item.imageAlt = altFor(id, item, imageUrl);
  item.imageSource = '2026-08-15完整單一情境正式圖｜非拼湊｜既有正式核准素材｜人工審核';
}

guilu.version = '2026-08-15-guilu-context-media-v6-one-shot';
guilu.purpose = '龜鹿母庫改用完整單一情境小老闆圖或正式產品小老闆情境圖；禁止拼湊，產品文章保留正式產品外觀，泛用生活圖不得重複套不同主題。';
guilu.policy = {
  ...(guilu.policy || {}),
  one_shot_scene_only: true,
  no_collage: true,
  blocked_display_name: '台興山產',
  real_product_appearance_is_authority: true,
  same_product_authority_media_may_repeat: true,
  generic_lifestyle_media_unique_within_bank: true,
  owner_review_required: true
};
guilu.overrides = guilu.overrides || {};
for (const [id, item] of Object.entries(media.overrides)) {
  if (!id.startsWith('XJW-GUILU-')) continue;
  const slug = id.slice('XJW-GUILU-'.length);
  guilu.overrides[slug] = {
    action: 'replace',
    imageUrl: item.imageUrl,
    imageAlt: item.imageAlt,
    imageSource: item.imageSource
  };
}

social.version = '2026-08-15-social-image-audit-v6-one-shot';
social.purpose = '社群貼文改用完整單一情境小老闆圖或正式產品小老闆情境圖；產品文章維持正式產品外觀，泛用情境圖不跨不同貼文重複；料理、工序、萬華品牌三篇改用各自專屬正式圖；舊拼湊圖停用。';
social.policy = {
  ...(social.policy || {}),
  one_shot_scene_only: true,
  no_collage: true,
  blocked_display_name: '台興山產',
  real_product_appearance_is_authority: true,
  same_product_authority_media_may_repeat: true,
  generic_lifestyle_media_unique_within_bank: true,
  current_media_overrides_legacy_batch_binding: true,
  owner_review_required_after_rebinding: true
};
social.overrides = social.overrides || {};
for (const [id, item] of Object.entries(media.overrides)) {
  const match = id.match(/^XJW-SOCIAL-\d{8}-\d{2}-(.+)$/);
  if (!match) continue;
  const slug = match[1];
  social.overrides[slug] = {
    action: 'replace',
    imageUrl: item.imageUrl,
    imageAlt: item.imageAlt,
    imageSource: item.imageSource,
    reason: '依目前正式文案改綁完整單一情境小老闆圖／正式產品小老闆情境圖；禁止拼湊，泛用圖不跨主題重複。'
  };
}

for (const [name, obj] of [['media', media], ['guilu', guilu], ['social', social]]) {
  const raw = JSON.stringify(obj);
  if (raw.includes('/images/posts/smallboss-v20260815/')) throw new Error(`${name}: retired collage path remains`);
}
for (const [id, item] of Object.entries(media.overrides)) {
  const customerText = [item.imageAlt, item.imageSource].join(' ');
  if (customerText.includes('台興山產')) throw new Error(`${id}: blocked display name remains`);
}

fs.writeFileSync(mediaPath, JSON.stringify(media, null, 2) + '\n', 'utf8');
fs.writeFileSync(guiluPath, JSON.stringify(guilu, null, 2) + '\n', 'utf8');
fs.writeFileSync(socialPath, JSON.stringify(social, null, 2) + '\n', 'utf8');

console.log(`PASS: rebound ${entries.length} bindings to approved non-collage media.`);
console.log(`PASS: unique generic scenes used — guilu=${genericUsed.get('guilu')?.size||0}, social=${genericUsed.get('social')?.size||0}, legacy=${genericUsed.get('legacy')?.size||0}.`);
console.log('PASS: final three social drafts now reserve recipes/combo/brand-story respectively.');
console.log('PASS: product-specific copy keeps approved product authority media; retired collage path count = 0.');
