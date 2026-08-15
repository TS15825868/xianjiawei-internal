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
  drink30: `${BRAND}/product-guilu-drink-30cc.webp`,
  drink180: `${BRAND}/product-guilu-drink-180cc.webp`,
  gao: `${BRAND}/product-guilu-gao-100g.webp`,
  jiao: `${BRAND}/product-guilu-jiao-600g.webp`,
  tangkuai: `${BRAND}/product-guilu-tangkuai-75g.webp`,
  luerong: `${BRAND}/product-luerong-fen-75g.webp`,
  all: `${BRAND}/products-all.webp`,
  recipes: `${BRAND}/recipes.webp`,
  routine: `${LIFE}/choose-by-routine.webp`,
  family: `${LIFE}/self-care-family.webp`,
  family2: `${LIFE}/self-care-family-2.webp`,
  storage: `${LIFE}/storage.webp`,
  temperature: `${LIFE}/temperature-coat.webp`,
  temperature2: `${LIFE}/temperature-coat-2.webp`,
  warm: `${LIFE}/warm-rhythm.webp`,
  warmWater: `${LIFE}/warm-water.webp`,
  rainy: `${LIFE}/rainy-warm.webp`,
  hydration: `${LIFE}/daily-hydration.webp`,
  hot: `${LIFE}/hot-weather-hydration.webp`,
  hot2: `${LIFE}/hot-weather-hydration-2.webp`
};

function chooseAuthority(id, item) {
  const text = `${id} ${item?.imageAlt || ''}`.toLowerCase();

  // Exact legacy cards first.
  if (id === 'POST-COMBO') return approved.family;
  if (id === 'POST-DRINK') return approved.drink30;
  if (id === 'POST-GAO-100') return approved.gao;
  if (id === 'POST-LUERONG') return approved.luerong;
  if (id === 'POST-SEASONS-RHYTHM') return approved.temperature;

  // Strong scene semantics take precedence over a generic product card.
  if (/storage|保存/.test(text)) return approved.storage;
  if (/rain|雨天|下雨/.test(text)) return approved.rainy;
  if (/temperature|溫差|換季|季節|seasons/.test(text)) return text.length % 2 ? approved.temperature : approved.temperature2;
  if (/warm|hot-water|溫熱|熱水|沖泡/.test(text)) return text.length % 2 ? approved.warm : approved.warmWater;
  if (/work-break|工作空檔|居家日常|home|family|家庭使用|routine|日常節奏/.test(text)) return text.length % 2 ? approved.family : approved.family2;
  if (/choose|怎麼選|哪三件事|first-three/.test(text)) return approved.routine;
  if (/cooking|料理|燉|雞湯|排骨湯|soup|recipe/.test(text)) return approved.recipes;
  if (/consult|諮詢|line|聯絡/.test(text)) return approved.contact;
  if (/made-order|5～7|工作天|熬製|火候|craft|萬華|wanhua|傳統|modern-tradition|品牌故事|四代/.test(text)) return approved.brand;

  // Product authority images: real approved product appearance + approved small-boss scene.
  if (/drink180|180cc/.test(text)) return approved.drink180;
  if (/drink30|30cc/.test(text)) return approved.drink30;
  if (/tangkuai|湯塊|75g/.test(text)) return approved.tangkuai;
  if (/jiao|龜鹿膠|600g|18\.75/.test(text)) return approved.jiao;
  if (/luerong|鹿茸|茸粉/.test(text)) return approved.luerong;
  if (/gao|龜鹿膏|100g|半匙/.test(text)) return approved.gao;
  if (/forms|比較|總覽|規格|型態|成分/.test(text)) return approved.all;

  return approved.home;
}

function altFor(id, item, url) {
  const topic = String(item?.imageAlt || '').replace(/^仙加味小老闆情境圖｜?/, '').trim();
  const kind = url.includes('/product-') || url.endsWith('/products-all.webp')
    ? '正式產品與小老闆情境'
    : '完整單一小老闆情境';
  return `仙加味｜${topic || id}｜${kind}`;
}

const entries = Object.entries(media.overrides || {});
if (entries.length !== 59) throw new Error(`expected 59 media bindings, got ${entries.length}`);

media.version = '2026-08-15-one-shot-non-collage-v1';
media.brandDisplay = '仙加味';
media.policy = {
  oneShotSceneOnly: true,
  noCollage: true,
  useExistingApprovedMediaFirst: true,
  realProductAppearanceIsAuthority: true,
  sameProductAuthorityMediaMayRepeat: true,
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

// Keep guilu bank on the exact same source of truth.
guilu.version = '2026-08-15-guilu-context-media-v4-one-shot';
guilu.purpose = '龜鹿母庫改用完整單一情境小老闆圖或正式產品小老闆情境圖；禁止拼湊，文案與圖片逐題對應。';
guilu.policy = {
  ...(guilu.policy || {}),
  one_shot_scene_only: true,
  no_collage: true,
  blocked_display_name: '台興山產',
  real_product_appearance_is_authority: true,
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

// Social batches use the same exact copy-to-image binding.
social.version = '2026-08-15-social-image-audit-v4-one-shot';
social.purpose = '社群貼文改用完整單一情境小老闆圖或正式產品小老闆情境圖；舊拼湊式 smallboss-v20260815 圖全面停用。';
social.policy = {
  ...(social.policy || {}),
  one_shot_scene_only: true,
  no_collage: true,
  blocked_display_name: '台興山產',
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
    reason: '依目前正式文案改綁完整單一情境小老闆圖／正式產品小老闆情境圖；禁止拼湊。'
  };
}

for (const [name, obj] of [['media', media], ['guilu', guilu], ['social', social]]) {
  const raw = JSON.stringify(obj);
  if (raw.includes('/images/posts/smallboss-v20260815/')) throw new Error(`${name}: retired collage path remains`);
  // blockedDisplayName policy itself is allowed; customer-facing fields are checked below.
}
for (const [id, item] of Object.entries(media.overrides)) {
  const customerText = [item.imageAlt, item.imageSource].join(' ');
  if (customerText.includes('台興山產')) throw new Error(`${id}: blocked display name remains`);
}

fs.writeFileSync(mediaPath, JSON.stringify(media, null, 2) + '\n', 'utf8');
fs.writeFileSync(guiluPath, JSON.stringify(guilu, null, 2) + '\n', 'utf8');
fs.writeFileSync(socialPath, JSON.stringify(social, null, 2) + '\n', 'utf8');

console.log(`PASS: rebound ${entries.length} old collage bindings to existing approved one-shot/product authority media.`);
console.log('PASS: retired /images/posts/smallboss-v20260815/ path count = 0 in active mapping files.');
console.log('PASS: public image alt/source blocked display name count = 0.');
