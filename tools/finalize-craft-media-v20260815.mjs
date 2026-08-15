import fs from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(new URL('..',import.meta.url).pathname);
const mediaPath=path.join(ROOT,'assets','data','post-smallboss-media-v20260815.json');
const socialPath=path.join(ROOT,'assets','data','social-image-audit-v20260815.json');
const id='XJW-SOCIAL-20260815-03-craft-time-and-heat';
const slug='craft-time-and-heat';
const imageUrl='https://ts15825868.github.io/xianjiawei/images/brand/approved-v405/guide-how-to-use.webp';
const imageAlt='仙加味｜傳統熬製，為什麼總是在談時間與火候？｜小老闆鍋煮工序情境';
const imageSource='2026-08-15完整單一情境正式圖｜工序／加熱／攪拌情境｜非拼湊｜人工審核';

const media=JSON.parse(fs.readFileSync(mediaPath,'utf8'));
if(!media.overrides?.[id]) throw new Error('craft post mapping missing');
media.overrides[id]={imageUrl,imageAlt,imageSource};
media.version='2026-08-15-one-shot-non-collage-v4-craft-final';

const social=JSON.parse(fs.readFileSync(socialPath,'utf8'));
social.overrides=social.overrides||{};
social.overrides[slug]={
  action:'replace',imageUrl,imageAlt,imageSource,
  reason:'熬製／時間／火候主題改用有鍋煮與攪拌動作的小老闆正式工序情境圖，不再使用作息、品牌故事或泛用圖。'
};
social.version='2026-08-15-social-image-audit-v5-craft-final';

for(const text of [imageAlt,imageSource]) if(text.includes('台興山產')) throw new Error('blocked display name');
fs.writeFileSync(mediaPath,JSON.stringify(media,null,2)+'\n','utf8');
fs.writeFileSync(socialPath,JSON.stringify(social,null,2)+'\n','utf8');
console.log('PASS: craft-time-and-heat bound to dedicated guide-how-to-use process scene.');
