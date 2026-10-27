import test from 'node:test';
import assert from 'node:assert/strict';
import {assessAutopublishCandidate} from '../src/ai-autopublish-policy.js';
import {aiApprovedChannels} from '../src/ai-quality-review.js';
import {aiScheduleFresh} from '../src/metricool-sync.js';
import {recordAiReview,aiGate} from '../src/ai-quality-review.js';
import qualityEvidence from '../src/ai-quality-evidence.cjs';
import {createHash} from 'node:crypto';
const valid={status:'pending_review',copy:'在家準備一壺溫熱的紅棗茶，聊聊漢方飲食文化。',image_url:'https://example.com/image.jpg',platforms:['facebook','instagram','threads']};
const checks=Object.fromEntries(['aiEvidenceValid','imageAuthentic','sceneMatches','productAuthorityValid','uniqueCopy','uniqueImage','rightsVerified','scheduledTimeValid','platformReady','quotaVerified','deliveryDedupReady'].map(x=>[x,true]));checks.reviewedAt=new Date().toISOString();
test('完整證據才可排程',()=>assert.equal(assessAutopublishCandidate(valid,checks).ok,true));
test('沒有證據預設拒絕',()=>assert.equal(assessAutopublishCandidate(valid,{}).ok,false));
test('疾病療效阻擋',()=>assert.equal(assessAutopublishCandidate({...valid,copy:'治療高血壓'},checks).ok,false));
test('已發布不可重發',()=>assert.equal(assessAutopublishCandidate({...valid,status:'published'},checks).ok,false));
test('缺圖不可排程',()=>assert.equal(assessAutopublishCandidate({...valid,image_url:''},checks).ok,false));

test('正式資產品質 clear 與 ok 可驗證，待重製圖不可排程',()=>{
  assert.equal(assessAutopublishCandidate({...valid,image_quality_status:'clear'},checks).ok,true);
  assert.equal(assessAutopublishCandidate({...valid,image_quality_status:'ok'},checks).ok,true);
  assert.equal(assessAutopublishCandidate({...valid,image_quality_status:'needs_rework'},checks).ok,false);
});
test('AI委託僅可使用既有 Facebook Instagram Threads 平台',()=>{
  assert.deepEqual(aiApprovedChannels({platforms_json:'["Facebook","Threads","Instagram"]'}),['facebook','instagram','threads']);
  assert.equal(aiApprovedChannels({platforms_json:'["Facebook","LINE OA"]'}),null);
  assert.equal(aiApprovedChannels({platforms_json:'["Instagram","Instagram"]'}),null);
  assert.equal(aiApprovedChannels({platforms_json:'[]'}),null);
  assert.equal(aiApprovedChannels({platforms_json:'not JSON'}),null);
});
test('外部發送結果未知不可重發',()=>{
  assert.equal(assessAutopublishCandidate({...valid,externalStatus:'unknown'},checks).ok,false);
  assert.equal(assessAutopublishCandidate({...valid,published_at:'2026-10-20T01:00:00Z'},checks).ok,false);
  assert.equal(assessAutopublishCandidate({...valid,platforms:['Facebook','LINE OA']},checks).ok,false);
});

test('24小時AI證據不得用於逾期外部排程',()=>{
  const row={approved_by:'ai:verified'};
  const reviewed='2026-10-27T12:00:00Z';
  assert.equal(aiScheduleFresh(row,reviewed,'2026-10-28T10:00:00Z').ok,true);
  assert.equal(aiScheduleFresh(row,reviewed,'2026-10-28T12:30:00Z').ok,false);
  assert.equal(aiScheduleFresh(row,reviewed,'2026-10-27T10:00:00Z').ok,false);
  assert.equal(aiScheduleFresh(row,'invalid','2026-10-28T10:00:00Z').ok,false);
  assert.equal(aiScheduleFresh({approved_by:'human@example.com'},reviewed,'2026-11-25T09:00:00Z').ok,true);
});

test('真正的低風險AI證據只核准原平台；更改發布對象立即失效',async()=>{
  const previousFetch=globalThis.fetch;
  const imageBytes=new TextEncoder().encode('isolated-approved-media-content');
  const digest=createHash('sha256').update(imageBytes).digest('hex');
  const imageUrl='https://raw.githubusercontent.com/xianjiawei/formal/main/approved.jpg';
  const referenceUrl='https://raw.githubusercontent.com/xianjiawei/formal/main/mascot.jpg';
  globalThis.fetch=async()=>new Response(imageBytes,{status:200,headers:{'content-type':'image/jpeg'}});
  const row={id:'TEST-AI-SAFE',status:'draft',title:'仙加味下午茶',headline:'在家溫熱飲用',copy:'下午在家準備溫熱飲品，分享仙加味的日常漢方飲食文化。',category:'生活情境',image_url:imageUrl,image_alt:'小老闆在家中準備溫熱飲品，分開的小鹿與小烏龜在一旁',image_quality_status:'ok',platforms_json:'["Facebook","Instagram","Threads"]',updated_at:'2026-10-27T12:00:00Z'};
  const fingerprint='f'.repeat(64),store={row:{...row},review:null};
  const env={DB:{
    prepare(sql){return{sql,args:[],bind(...args){this.args=args;return this},
      async first(){
        if(sql.includes('FROM social_metricool_sync'))return null;
        if(sql.includes('FROM social_post_quality_reviews'))return store.review;
        return null;
      },
      async run(){return{success:true,meta:{changes:1}}}
    }},
    async batch(stmts){
      const u=stmts[0].args;
      assert.match(stmts[0].sql,/^UPDATE social_posts/);
      assert.equal(u[7],store.row.updated_at);
      Object.assign(store.row,{status:u[0],approved_by:u[1],approved_at:u[2],image_approved:u[3],review_note:u[4],updated_at:u[5]});
      const v=stmts[1].args;
      assert.match(stmts[1].sql,/INSERT INTO social_post_quality_reviews.*WHERE changes\\(\\)=1 AND EXISTS/);
      assert.equal(v[14],row.id);
      assert.equal(v[15],store.row.status);
      assert.equal(v[16],store.row.updated_at);
      assert.equal(v[17],store.row.approved_by);
      assert.equal(v[18],store.row.image_approved);
      store.review={post_id:v[1],reviewer_type:v[2],decision:v[3],content_fingerprint:v[4],image_url:v[5],image_sha256:v[6],evidence_json:v[7],model:v[8],policy_version:v[9],authorized_by:v[10],reviewed_at:v[11]};
      return[{meta:{changes:1}},{meta:{changes:1}}];
    }
  }};
  const reviewedAt=new Date().toISOString();
  const evidence={
    reviewer_type:'AI',model:'isolated-verifier',post_id:row.id,
    content_fingerprint:fingerprint,image_url:imageUrl,image_sha256:digest,reviewed_at:reviewedAt,
    checks:Object.fromEntries(qualityEvidence.CHECKS.map(key=>[key,{result:'PASS',evidence:'已查核正式仙加味產品來源與對應場景影像'}])),
    risk:{level:'LOW',uncertainties:[],flags:[]},
    visual:{image_sha256:digest,scene_summary:'仙加味小老闆在下午的家中準備溫熱飲品，小鹿與小烏龜分開坐在桌邊，與文案一致。',mascot_reference:{url:referenceUrl,sha256:digest},products_visible:false,product_assets:[]},
    publication:{approved:false,auto_publish:false}
  };
  const checks={fingerprint:async()=>fingerprint,productMatchErrors:()=>[],duplicatePostErrors:async()=>[],isWeatherPost:()=>false};
  try{
    const result=await recordAiReview(env,row,evidence,{role:'owner',email:'owner@example.com'},checks);
    assert.equal(result.decision,'AI_APPROVED');
    assert.equal(store.row.status,'approved');
    assert.equal(store.row.approved_by,'ai:isolated-verifier');
    assert.deepEqual(JSON.parse(store.review.evidence_json).approved_channels,['facebook','instagram','threads']);
    assert.equal((await aiGate(env,store.row,fingerprint)).ok,true);
    assert.equal((await aiGate(env,{...store.row,platforms_json:'["Facebook","LINE OA"]'},fingerprint)).ok,false);
    assert.equal((await aiGate(env,{...store.row,image_quality_status:'needs_rework'},fingerprint)).ok,false);

    const pastDeliveryEnv={DB:{prepare(sql){return{bind(){return this},async first(){
      return sql.includes('FROM social_publish_deliveries')?{platform:'Facebook',status:'sending'}:null;
    }}}}};
    await assert.rejects(
      ()=>recordAiReview(pastDeliveryEnv,row,evidence,{role:'owner',email:'owner@example.com'},checks),
      /已有平台發送嘗試/
    );
    const racedEnv={DB:{prepare(sql){return{bind(){return this},async first(){return null},async run(){return{meta:{changes:1}}}}},
      async batch(stmts){assert.match(stmts[0].sql,/^UPDATE social_posts/);
        assert.match(stmts[1].sql,/WHERE changes\\(\\)=1 AND EXISTS/);
        return[{meta:{changes:0}},{meta:{changes:0}}];
      }
    }};
    await assert.rejects(
      ()=>recordAiReview(racedEnv,row,evidence,{role:'owner',email:'owner@example.com'},checks),
      /正式內容已變更/
    );

  }finally{globalThis.fetch=previousFetch}
});

test('SQLite 批次 CAS 失敗不可產生第二筆 AI 核准證據',async t=>{
  const sqlite=await import('node:sqlite').catch(()=>null);
  if(!sqlite){t.skip('此 Node 版本未內建 SQLite');return;}
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../src/ai-quality-review.js',import.meta.url),'utf8');
  const updateSql=source.match(/env\\.DB\\.prepare\\("(UPDATE social_posts[^"]+)"\\)/)?.[1];
  const insertSql=source.match(/env\\.DB\\.prepare\\("(INSERT INTO social_post_quality_reviews[^"]+)"\\)/)?.[1];
  assert.ok(updateSql&&insertSql,'回歸測試需使用正式程式的 SQL');
  const db=new sqlite.DatabaseSync(':memory:');
  try{
    db.exec('CREATE TABLE social_posts(id TEXT PRIMARY KEY,status TEXT,approved_by TEXT,approved_at TEXT,image_approved INTEGER,scheduled_at TEXT,review_note TEXT,updated_at TEXT,published_at TEXT)');
    db.exec('CREATE TABLE social_post_quality_reviews(id TEXT PRIMARY KEY,post_id TEXT,reviewer_type TEXT,decision TEXT,content_fingerprint TEXT,image_url TEXT,image_sha256 TEXT,evidence_json TEXT,model TEXT,policy_version TEXT,authorized_by TEXT,reviewed_at TEXT,old_status TEXT,new_status TEXT)');
    db.prepare("INSERT INTO social_posts(id,status,image_approved,updated_at) VALUES ('P','draft',0,'original')").run();
    for(const [rid,changes] of [['REVIEW-1',1],['REVIEW-2',0]]){
      const update=db.prepare(updateSql).run('approved','ai:verified','approved-now',1,'AI審核','saved-now','P','original');
      const review=db.prepare(insertSql).run(rid,'P','AI','AI_APPROVED','fingerprint','image','hash','{}','verified','policy','staff','approved-now','draft','approved','P','approved','saved-now','ai:verified',1);
      assert.equal(update.changes,changes);
      assert.equal(review.changes,changes,'沒有更新貼文時不得新增 AI 核准證據');
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM social_post_quality_reviews').get().c,1);
  }finally{db.close();}
});
