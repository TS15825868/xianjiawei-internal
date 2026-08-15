import fs from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(new URL('..',import.meta.url).pathname);
const dataDir=path.join(ROOT,'assets','data');
const mediaPath=path.join(dataDir,'post-smallboss-media-v20260815.json');
const socialAuditPath=path.join(dataDir,'social-image-audit-v20260815.json');

const media=JSON.parse(fs.readFileSync(mediaPath,'utf8'));
const audit=JSON.parse(fs.readFileSync(socialAuditPath,'utf8'));
if(media.brandDisplay!=='仙加味') throw new Error('small-boss media brandDisplay must be 仙加味');
if(JSON.stringify(media).includes('台興山產')) throw new Error('small-boss media must not contain blocked display name');
audit.overrides=audit.overrides||{};
let changed=0;
for(const [postId,item] of Object.entries(media.overrides||{})){
  const match=postId.match(/^XJW-SOCIAL-\d{8}-\d{2}-(.+)$/);
  if(!match) continue;
  const slug=match[1];
  audit.overrides[slug]={
    action:'replace',
    imageUrl:String(item.imageUrl||''),
    imageAlt:String(item.imageAlt||''),
    imageSource:String(item.imageSource||'2026-08-15小老闆正式貼文重製'),
    reason:'依目前正式文案重製為仙加味小老闆貼文圖，取代產品單圖、空白SVG或圖文不符版本。'
  };
  changed++;
}
audit.version='2026-08-15-social-image-audit-v3-smallboss-runtime';
audit.purpose='社群貼文以目前正式小老闆媒體綁定覆蓋舊產品單圖與顯示不完整SVG；保留既有試喝、FAQ、品牌故事與已核准生活情境規則。';
fs.writeFileSync(socialAuditPath,JSON.stringify(audit,null,2)+'\n','utf8');
console.log(`PASS: applied ${changed} small-boss social media overrides.`);
