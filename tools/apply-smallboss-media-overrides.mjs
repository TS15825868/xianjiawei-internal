import fs from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(new URL('..',import.meta.url).pathname);
const dataDir=path.join(ROOT,'assets','data');
const mediaPath=path.join(dataDir,'post-smallboss-media-v20260815.json');
const socialAuditPath=path.join(dataDir,'social-image-audit-v20260815.json');

const media=JSON.parse(fs.readFileSync(mediaPath,'utf8'));
const audit=JSON.parse(fs.readFileSync(socialAuditPath,'utf8'));
if(media.brandDisplay!=='仙加味') throw new Error('small-boss media brandDisplay must be 仙加味');
for(const [id,item] of Object.entries(media.overrides||{})){
  const publicText=[item?.imageAlt,item?.imageSource].join(' ');
  if(publicText.includes('台興山產')) throw new Error(`${id}: customer-facing small-boss media contains blocked display name`);
}
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
    imageSource:String(item.imageSource||'2026-08-15完整單一情境正式圖'),
    reason:'依目前正式文案改綁仙加味完整單一情境／正式產品小老闆情境圖；禁止拼湊。'
  };
  changed++;
}
audit.version='2026-08-15-social-image-audit-v4-one-shot';
audit.purpose='社群貼文使用完整單一情境小老闆圖或正式產品小老闆情境圖；舊拼湊式 smallboss-v20260815 圖全面停用。';
audit.policy={
  ...(audit.policy||{}),
  one_shot_scene_only:true,
  no_collage:true,
  blocked_display_name:'台興山產',
  owner_review_required_after_rebinding:true
};
fs.writeFileSync(socialAuditPath,JSON.stringify(audit,null,2)+'\n','utf8');
console.log(`PASS: applied ${changed} one-shot/non-collage social media overrides.`);
