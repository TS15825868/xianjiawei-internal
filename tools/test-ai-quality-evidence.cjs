const assert=require('assert/strict'),{CHECKS,assess}=require('../src/ai-quality-evidence.cjs');
const e={reviewer_type:'AI',model:'ChatGPT-Work',post_id:'TEST',content_fingerprint:'b'.repeat(64),image_url:'https://raw.githubusercontent.com/example/image.jpg',image_sha256:'a'.repeat(64),reviewed_at:new Date().toISOString(),checks:Object.fromEntries(CHECKS.map(k=>[k,{result:'PASS',evidence:'測試證據：逐項比對目前圖文及正式品牌參考，已確認本項符合。'}])),risk:{level:'LOW',uncertainties:[],flags:[]},visual:{image_sha256:'a'.repeat(64),scene_summary:'測試證據：完整生活場景呈現小老闆整理桌面，角色、動作、光影與圖文一致，沒有產品或包裝。',mascot_reference:{url:'https://raw.githubusercontent.com/example/reference.png',sha256:'c'.repeat(64)},products_visible:false,product_assets:[]}};
const run=x=>assess(x,'TEST','b'.repeat(64),e.image_url).decision;
assert.equal(run(e),'AI_APPROVED');
assert.equal(run({...e,checks:{...e.checks,brand:{result:'FAIL',evidence:'品牌Logo錯誤，禁止公開發布。'}}}),'REJECTED');
assert.equal(run({...e,checks:{...e.checks,action:{result:'UNKNOWN',evidence:'無法確認角色是否真的在翻閱筆記。'}}}),'NEEDS_HUMAN_REVIEW');
assert.equal(run({...e,risk:{level:'HIGH',uncertainties:['天氣未查證'],flags:[]}}),'NEEDS_HUMAN_REVIEW');
assert.equal(run({...e,image_sha256:'unknown'}),'NEEDS_HUMAN_REVIEW');
assert.equal(run({...e,content_fingerprint:'edited'}),'NEEDS_HUMAN_REVIEW');
assert.equal(run({...e,reviewer_type:'HUMAN'}),'NEEDS_HUMAN_REVIEW');
assert.equal(run({...e,visual:{...e.visual,products_visible:true}}),'NEEDS_HUMAN_REVIEW');
assert.equal(run({...e,visual:{...e.visual,products_visible:true,product_assets:[{product_id:'guilu-jiao',url:'https://example.com/a.jpg',sha256:'d'.repeat(64),original_photo_verified:true,pixel_preservation_evidence:'不可公開的舊產品'}]}}),'NEEDS_HUMAN_REVIEW');
console.log('PASS AI evidence: all16 + current hash + source + risk; FAIL rejects; UNKNOWN/higher risk needs human; edited content and unverified/retired packaging blocked; no human impersonation');
(async()=>{
  const {recordAiReview,aiGate,AI_POLICY_VERSION}=await import('../src/ai-quality-review.js');
  const {createHash}=require('node:crypto');
  const bytes=Buffer.from('test image bytes'),hash=createHash('sha256').update(bytes).digest('hex');
  const proof={...e,image_sha256:hash,visual:{...e.visual,image_sha256:hash,mascot_reference:{...e.visual.mascot_reference,sha256:hash}}};
  const owner='owner@example.com',post={id:'TEST',status:'pending_review',updated_at:'before',image_url:e.image_url};
  let review;
  const DB={prepare:sql=>({bind(...values){this.values=values;return this},async run(){},async first(){return review},sql}),async batch(statements){
    const insert=statements[0].values,update=statements[1].values;
    // Model identities are not profiles: this reproduces the production FK constraint.
    assert.equal(update[1],owner,'approved_by must reference the authorizing profile');
    assert.equal(insert[2],'AI');assert.equal(insert[8],'ChatGPT-Work');
    review={decision:insert[3],model:insert[8],policy_version:insert[9],authorized_by:insert[10],reviewed_at:insert[11],evidence_json:insert[7],image_sha256:hash};
    Object.assign(post,{status:update[0],approved_by:update[1],review_note:update[4]});
    return[{meta:{changes:1}},{meta:{changes:1}}];
  }};
  const oldFetch=global.fetch;
  global.fetch=async()=>new Response(bytes,{headers:{'content-type':'image/png'}});
  try{
    await recordAiReview({DB},post,proof,{role:'owner',email:owner},{fingerprint:async()=>e.content_fingerprint,productMatchErrors:()=>[],duplicatePostErrors:async()=>[],isWeatherPost:()=>false});
    assert.equal(review.policy_version,AI_POLICY_VERSION);
    assert.equal((await aiGate({DB},post,e.content_fingerprint)).ok,true);
    assert.equal((await aiGate({DB},post,'changed')).ok,false);
    assert.equal((await aiGate({DB},{...post,approved_by:'other@example.com'},e.content_fingerprint)).ok,false);
    review.decision='REJECTED';assert.equal((await aiGate({DB},post,e.content_fingerprint)).ok,false);
    console.log('PASS AI approval FK, distinct AI reviewer, edited evidence and different authorizer blocked');
  }finally{global.fetch=oldFetch}
})().catch(error=>{console.error(error);process.exitCode=1});
