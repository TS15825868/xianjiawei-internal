import { ensureMediaSchema } from './media-upload.js';

const OFFICIAL_MEDIA=[
  {id:'XJW-GUILU-drink30-work-break',file:'01-work-30cc.webp',bytes:49620,sha:'2126f7218e28840d691d3e7e9277e2e4b3877d7394d3fa1cc9454fce475fdb4d',alt:'仙加味上班日常；小老闆手持30cc小玻璃罐',status:'pending_review'},
  {id:'XJW-GUILU-drink180-home',file:'02-home-180cc.webp',bytes:53070,sha:'f346affa8e5387ba9323bb1cfaccacab739b06d5f45fdaa0f9c469d966a8b401',alt:'仙加味居家溫飲；180cc鋁袋生活情境',status:'pending_review'},
  {id:'XJW-GUILU-gao-storage',file:'03-gao-storage.webp',bytes:47502,sha:'d9072baa0d40dce6ab1dac9c750fac0badeee188c7f24558cedd97aff6c6c41f',alt:'仙加味保存提醒；龜鹿膏開罐後冷藏',status:'pending_review'},
  {id:'XJW-GUILU-tangkuai-soup',file:'04-tangkuai-soup.webp',bytes:50334,sha:'f9ad9d7b153ad8da3761b17e7bbacda268361f67986b88a7ca823224150e99a7',alt:'仙加味料理搭配；龜鹿湯塊家常燉湯',status:'pending_review'},
  {id:'XJW-GUILU-jiao-600g',file:'05-jiao-600g.webp',bytes:48654,sha:'4c2566ffcbdb0af564ebe8c6182ccc3c7d9e51b09c31f7238591052f5835a0bf',alt:'仙加味型態認識；600g／32塊龜鹿膠',status:'pending_review'},
  {id:'XJW-GUILU-luerong-75g',file:'06-lurong-75g.webp',bytes:46950,sha:'0d0cbdf260af3f9d067205eba476d833d016ad85b16feb27e2bcf1f8c8c494de',alt:'仙加味粉末安排；75g鹿茸粉',status:'pending_review'},
  {id:'XJW-SOCIAL-20260815-02-line-consult-and-trial',file:'07-line-consult.webp',bytes:52640,sha:'dc2ab1d8516eb1e133853ad40a8f8128ae6c154c31dba76b7e61d7266ada55e9',alt:'仙加味LINE諮詢；依日常協助挑選產品',status:'pending_review'},
  {id:'XJW-GUILU-choose-by-place',file:'08-home-out.webp',bytes:50190,sha:'17a75dff9fa92cbe164bb9e729ab6bcf49a8c5011c43b83f9f809d835856d38b',alt:'仙加味生活節奏；在家與外出依情境選擇',status:'pending_review'},
  {id:'XJW-SOCIAL-20260815-03-storage-basics',file:'09-organize-cabinet.webp',bytes:49092,sha:'4f93a8d1c948184b28dad6115708000e47968442eaf5be6f01b2c6ac23912132',alt:'仙加味整理一下；產品櫃與保存整理',status:'pending_review'},
  {id:'XJW-SOCIAL-20260815-01-warm-drink-moment',file:'10-office-warm-drink.webp',bytes:49882,sha:'5d35292b7c18c5b1bfae7aebfb2b48b869aea948e4bbde2cba1329fab187ad2f',alt:'仙加味辦公桌安排；30cc與180cc溫熱飲情境',status:'pending_review'},
  {id:'POST-AUDIENCE-NEEDS',file:'11-audience-needs.webp',bytes:50280,sha:'30719042a9291b34eb34711dbbc022d7e8ea58a940d553aafc7e40896b6da70d',alt:'常見生活情境與需求，協助顧客認識龜鹿系列',status:'pending_review'},
  {id:'POST-TRIAL-MAIN',file:'12-trial-group-published.webp',bytes:57232,sha:'47793954b2883aab287edefc1b059c033d1bb9be605df114ff16f0d90cbfe40f',alt:'龜鹿飲試喝組正式發布主圖',status:'published'},
  {id:'POST-BRAND-START',file:'13-brand-story-wanhua-published.webp',bytes:27672,sha:'dad70a2120e5630e733c341993ef477c28bc5e06eef203a5c780bda72780f9cd',alt:'仙加味品牌故事正式發布主圖',status:'published'}
];

const DEFAULT_PLATFORMS='["Facebook","Instagram","LINE VOOM"]';
const SOURCE='使用者2026-08-18確認正式圖｜D1 media_assets 檔名+bytes+SHA256三重精確綁定｜禁止舊圖fallback';

function base64Bytes(value){
  const binary=atob(String(value||''));
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i+=1)bytes[i]=binary.charCodeAt(i);
  return bytes;
}
async function sha256Hex(base64){
  const digest=await crypto.subtle.digest('SHA-256',base64Bytes(base64));
  return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function tableExists(db,name){
  const row=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(name).first();
  return Boolean(row?.name);
}
async function ensureSpecialPosts(db){
  const now=new Date().toISOString();
  const audience=await db.prepare("SELECT id FROM social_posts WHERE id='POST-AUDIENCE-NEEDS' LIMIT 1").first();
  if(!audience){
    const copy='不是只有特定年齡。不同生活節奏的人，可能因為在家、上班、運動、作息忙碌、想安排日常補養或送禮，而開始認識龜鹿系列。\n\n仙加味會先從生活情境、使用方式與產品型態協助了解，不急著一次選完。\n\n仙加味｜補養，是一種節奏。';
    await db.prepare("INSERT INTO social_posts(id,title,headline,copy,category,platforms_json,status,scheduled_at,approved_by,approved_at,published_at,image_url,image_alt,image_source,image_approved,image_width,image_height,image_bytes,image_quality_status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?, 'pending_review',NULL,NULL,NULL,NULL,'','','待正式圖綁定',0,0,0,0,'missing','system',?,?)")
      .bind('POST-AUDIENCE-NEEDS','哪些人，會開始認識龜鹿系列？','哪些人，會開始認識龜鹿系列？',copy,'龜鹿入門',DEFAULT_PLATFORMS,now,now).run();
  }
  const trial=await db.prepare("SELECT id FROM social_posts WHERE id='POST-TRIAL-MAIN' LIMIT 1").first();
  if(!trial){
    const copy='龜鹿飲試喝組｜先試喝，再決定\n\n30cc小玻璃罐3罐試喝品免費，運費自付：7-11店到店60元／郵局宅配100元。每位顧客、電話及地址限申請一次。龜鹿飲接單後安排製作，約5～7個工作天出貨。\n\n所有試喝申請與正式下單皆在LINE OA完成。';
    await db.prepare("INSERT INTO social_posts(id,title,headline,copy,category,platforms_json,status,scheduled_at,approved_by,approved_at,published_at,image_url,image_alt,image_source,image_approved,image_width,image_height,image_bytes,image_quality_status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?, 'published',NULL,'owner',?,NULL,'','','待正式圖綁定',1,0,0,0,'missing','system',?,?)")
      .bind('POST-TRIAL-MAIN','龜鹿飲試喝組｜先試喝，再決定','龜鹿飲試喝組｜先試喝，再決定',copy,'試喝申請',DEFAULT_PLATFORMS,now,now,now).run();
  }
}

export async function reconcileOfficialPostMedia(env){
  const db=env?.DB;
  if(!db)return{ok:false,reason:'no-db'};
  try{
    if(!(await tableExists(db,'social_posts')))return{ok:false,reason:'no-social-posts'};
    await ensureMediaSchema(env);
    await ensureSpecialPosts(db);
    const sizes=[...new Set(OFFICIAL_MEDIA.map(x=>x.bytes))];
    const placeholders=sizes.map(()=>'?').join(',');
    const result=await db.prepare(`SELECT id,file_name,mime_type,data_base64,bytes,width,height,created_at FROM media_assets WHERE bytes IN (${placeholders}) ORDER BY datetime(created_at) DESC`).bind(...sizes).all();
    const candidates=result.results||[];
    const matched=new Map();
    const rejected=[];
    for(const row of candidates){
      if(!row?.data_base64)continue;
      let hash='';
      try{hash=await sha256Hex(row.data_base64);}catch(error){
        rejected.push({id:row.id,file_name:String(row.file_name||''),reason:'sha256-failed'});
        continue;
      }
      const fileName=String(row.file_name||'');
      const byteCount=Number(row.bytes||0);
      const item=OFFICIAL_MEDIA.find(x=>x.file===fileName&&x.bytes===byteCount&&x.sha===hash);
      if(!item){
        rejected.push({id:row.id,file_name:fileName,bytes:byteCount,sha:hash,reason:'not-exact-official-media'});
        continue;
      }
      if(!matched.has(item.id))matched.set(item.id,row);
    }
    const now=new Date().toISOString();
    let updated=0;
    for(const item of OFFICIAL_MEDIA){
      const media=matched.get(item.id);
      if(!media)continue;
      const current=await db.prepare('SELECT id,status,platforms_json FROM social_posts WHERE id=? LIMIT 1').bind(item.id).first();
      if(!current)continue;
      const platforms=String(current.platforms_json||'').trim();
      const nextPlatforms=!platforms||platforms==='[]'?DEFAULT_PLATFORMS:platforms;
      const url=`/media/${encodeURIComponent(media.id)}`;
      if(item.status==='published'){
        await db.prepare("UPDATE social_posts SET image_url=?,media_id=?,image_alt=?,image_source=?,image_width=?,image_height=?,image_bytes=?,image_quality_status='ok',image_approved=1,status='published',platforms_json=?,scheduled_at=NULL,proposed_scheduled_at=NULL,updated_at=? WHERE id=?")
          .bind(url,media.id,item.alt,SOURCE,Number(media.width||0),Number(media.height||0),Number(media.bytes||0),nextPlatforms,now,item.id).run();
      }else{
        await db.prepare("UPDATE social_posts SET image_url=?,media_id=?,image_alt=?,image_source=?,image_width=?,image_height=?,image_bytes=?,image_quality_status='ok',image_approved=0,status='pending_review',platforms_json=?,scheduled_at=NULL,proposed_scheduled_at=NULL,approved_by=NULL,approved_at=NULL,updated_at=? WHERE id=?")
          .bind(url,media.id,item.alt,SOURCE,Number(media.width||0),Number(media.height||0),Number(media.bytes||0),nextPlatforms,now,item.id).run();
      }
      updated+=1;
    }
    return{ok:true,matched:matched.size,updated,expected:OFFICIAL_MEDIA.length,missing:OFFICIAL_MEDIA.filter(x=>!matched.has(x.id)).map(x=>x.file),rejected};
  }catch(error){
    console.warn('official media reconcile skipped',String(error?.message||error));
    return{ok:false,reason:String(error?.message||error)};
  }
}
