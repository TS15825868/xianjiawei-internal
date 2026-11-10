import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadPolicy(){
 const window={
  addEventListener(){},
  dispatchEvent(){}
 };
 const document={documentElement:{dataset:{}},querySelector(){return null}};
 const code=fs.readFileSync('assets/js/formal-media-policy-v20260810.js','utf8');
 vm.runInNewContext(code,{window,document,URL,console}, {filename:'formal-media-policy-v20260810.js'});
 assert.ok(window.XJWFormalMediaPolicy);
 return window.XJWFormalMediaPolicy;
}
test('official 2026/10/17 four products retain original role, no automatic fake replacements',()=>{
 const p=loadPolicy();
 assert.equal(p.formalProductMedia.length,4);
 const original=p.mediaForProduct('guilu-gao');
 assert.equal(original.id,'guilu-gao');
 assert.equal(original.role,'official-product-image');
 assert.equal(original.approved,true);
 assert.ok(original.public_url.includes('images/catalog-owner-final-v20261017/guilu-gao-main.webp'));
 assert.equal(p.resolveMedia('仙加味龜鹿膏100g／罐',[]).authority,'formal_product_media');
});
test('current jelly, soup blocks and qixuan require independently verified product photos, not legacy hard retirement',()=>{
 const p=loadPolicy();
 for(const [id,copy] of [['guilu-jiao','龜鹿膠600g'],['guilu-tangkuai','龜鹿湯塊75g'],['qixuan-tea','柒玄茶調飲粉']]){
  assert.equal(p.mediaForProduct(id),null);
  assert.equal(p.dmForProduct(id),null);
  const result=p.resolveMedia('仙加味 '+copy,[]);
  assert.equal(result.status,'needs_current_media_verification');
  assert.equal(result.candidate,null);
  assert.equal(result.action,'hold_for_current_authority');
 }
 assert.equal(p.formalDmMedia.some(x=>x.productId==='guilu-jiao'),true,'historical DM references should remain for internal archive, not public use');
});
test('retired media cannot reenter through generic ZIP ranking or explicit DM intent',()=>{
 const p=loadPolicy();
 const source={id:'guilu-jiao-dm',productId:'guilu-jiao',public_url:'https://ts15825868.github.io/xianjiawei/images/dm-final/06_guilu-jiao-600g-dm.jpg',source:'user-zip',approved:true,binary_ready:true,keywords:['仙加味','龜鹿膠']};
 assert.equal(p.chooseSourceCandidate('仙加味', [source]),null);
 assert.equal(p.chooseBestCandidate('仙加味', [source]),null);
 assert.equal(p.resolveMedia('仙加味 龜鹿膠 詳細DM',[source]).status,'needs_current_media_verification');
});
test('explicit current-product original-photo provenance lifts only media hold, never review/publish gate',()=>{
 const p=loadPolicy();
 const verified={id:'guilu-tangkuai-owner-photo',productId:'guilu-tangkuai',
  public_url:'https://ts15825868.github.io/xianjiawei/images/owner-approved-guilu-tangkuai.png',
  keywords:['龜鹿湯塊'],approved:true,binary_ready:true,
  currentProductAuthorityVerified:true,originalPhotoPixelsVerified:true};
 const result=p.resolveMedia('仙加味 龜鹿湯塊75g日常料理',[verified]);
 assert.equal(result.action,'use');
 assert.equal(result.candidate.id,verified.id);
 assert.equal(p.resolveMedia('仙加味 龜鹿湯塊75g日常料理',[{...verified,originalPhotoPixelsVerified:false}]).action,'hold_for_current_authority');
});

test('newer independently authorized product sources are not blocked only because not one of four old products',()=>{
 const p=loadPolicy();
 const newer={id:'royalherb-erzhenbao-64',public_url:'https://ts15825868.github.io/xianjiawei/images/catalog-owner-final-v20261017/royalherb-erzhenbao-64-main.webp',source:'user-verified',approved:true,binary_ready:true,keywords:['二珍寶']};
 const result=p.resolveMedia('仙加味 二珍寶', [newer]);
 assert.equal(result.action,'use');
 assert.equal(result.candidate.id,newer.id);
});

test('corrupt original primary jpg and visually unusable trial PNG are not publishable media',()=>{
 const p=loadPolicy();
 for(const img of ['https://ts15825868.github.io/xianjiawei/assets/reference/heygen/mascot-primary-v20260818.jpg','https://ts15825868.github.io/xianjiawei/images/customer-display-v20260812/trial-small-boss.png']){
  const candidate={id:'bad-original',public_url:img,binary_ready:true,approved:true,source:'user-zip',keywords:['仙加味'],scene:'仙加味'};
  assert.equal(p.chooseBestCandidate('仙加味',[candidate]),null);
  assert.equal(p.resolveMedia('仙加味',[candidate]).action,'regenerate');
 }
});
