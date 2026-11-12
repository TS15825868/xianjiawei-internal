import {createHash} from 'node:crypto';
const targets=[
  {
    "id": "XJW-CONV-chat-shop-organizing",
    "title": "小老闆今天在整理什麼？",
    "status": "pending_review",
    "copy": "今天不講大道理，小老闆正在整理仙加味店裡的漢方食材。把紅棗、枸杞分好，再把工作用的木匙放回原位。\n\n小鹿負責到處看看，小烏龜看起來比較像在監工。仙加味每天的細節，就是從這些小事慢慢累積。\n\n你是用完馬上歸位派，還是最後再一次整理派？",
    "image_alt": "仙加味小老闆在萬華木質工作間分類紅棗與枸杞，將木匙放回工作架；小鹿看著食材，小烏龜陪在工藝筆記旁。",
    "path": "assets/post-images/2026-10-12/formal-production/XJW-CONV-chat-shop-organizing-scene-v5.jpg",
    "sha": "7ad496354fb2413adf3af6c48c94d64247d98a618aea10ce39b03ad39a60a8f2",
    "replacement": {
      "sha": "0f44a2d76329c96bab697d66c6264f50494eeae0",
      "sha256": "b9b7192073a97c140a01875f91afa70febb2930d4419265b86dc24b816e20ab3",
      "bytes": 347104
    },
    "alt": "仙加味小老闆在萬華店把木匙掛回木架，桌上分碗擺好紅棗和枸杞，小鹿在旁看著，小烏龜坐在矮凳上。",
    "version": "v6"
  },
  {
    "id": "XJW-CONV-chat-receive-package",
    "title": "收到產品後，你第一件事會先看哪裡？",
    "status": "pending_review",
    "copy": "有人收到東西先看外觀，有人先看規格，也有人會先確認保存和使用方式。\n\n我們希望仙加味的資訊可以讓人一看就找得到重點。你拆開一個新產品時，第一個通常看哪裡？",
    "image_alt": "仙加味小老闆在家打開紙箱，先閱讀隨附說明卡，小鹿與小烏龜在旁陪伴。",
    "path": "assets/post-images/2026-09-23/XJW-CONV-chat-receive-package.jpg",
    "sha": "b143b3059aeb60b0482e09f32e3f5ae348023819fc9201b9889aeb4fe1d576ce",
    "replacement": {
      "sha": "f92f28ea4f5d5a3d7e971dded2889f62d9b02149",
      "sha256": "0750177841a586f6667b8ce425a780a06a04841f2a656d8fc6fd8d7f1c0c61f6",
      "bytes": 269065
    },
    "alt": "仙加味小老闆在家打開運送紙箱，手拿隨附說明卡閱讀，小鹿與小烏龜分別在桌邊。",
    "version": "v2"
  },
  {
    "id": "XJW-CONV-weather-cool-drink",
    "title": "天氣轉涼時，你會想喝點溫熱的嗎？",
    "status": "pending_review",
    "copy": "天氣轉涼時，有些人會比較想準備一杯溫熱的，或替家裡煮一鍋湯。\n\n仙加味分享的漢方飲食文化，也從這些簡單的日常安排開始。\n\n遇到涼爽的日子，你會先準備熱飲、湯，還是找件薄外套？",
    "image_alt": "天氣轉涼時，仙加味小老闆在窗邊翻看生活筆記，桌上放著溫熱飲品，小鹿與小烏龜一起享受安靜的午後。",
    "path": "assets/post-images/2026-10-12/formal-production/XJW-CONV-weather-cool-drink-audit-v1.jpg",
    "sha": "f98d6c1cd1a5ae37fa76deaa476df4bcebf174e880a8c3ef5dac767ad7c6c682",
    "replacement": {
      "sha": "c2d389a57217d2f65c5268585bcb2c8f532c9c77",
      "sha256": "36bd2a9f2927c89a642a12f4c41a6fecf1ddfcc119a3720e5cc4f137079d1bb3",
      "bytes": 249956
    },
    "alt": "秋日天氣轉涼，仙加味小老闆坐在窗邊雙手捧著冒出熱氣的溫熱飲品，小鹿和小烏龜分開陪伴。",
    "version": "v2"
  }
];
const hash=data=>createHash('sha256').update(data).digest('hex');
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('D1 credentials unavailable');
const endpoint='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/5e85d589-9c4f-412e-9ccd-585a5b6ecabe/query';
async function query(sql,params=[]){
 const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params})});
 const result=await response.json();
 if(!response.ok||!result.success)throw Error('D1 query failed '+response.status+' '+JSON.stringify(result.errors));
 return result.result[0];
}
const prefix='https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/';
const guard="published_at IS NULL AND COALESCE(scheduled_at,'')='' AND COALESCE(approved_by,'')='' AND COALESCE(approved_at,'')='' AND COALESCE(image_approved,0)=0 AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id AND state NOT IN ('pending_review','draft')) AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id AND (COALESCE(attempt_count,0)>0 OR last_attempt_at IS NOT NULL OR published_at IS NOT NULL OR TRIM(COALESCE(remote_id,''))<>'' OR status IN ('sending','retry','published','manual_required','permanent_failed')))";
const source='仙加味正式角色參考｜AI生成獨立情境圖｜2026-11-12';
const clean=x=>String(x??'').trim();
const keys=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
const specific=[
 ['木架、兩碗分放的紅棗與枸杞，萬華店門敞開','手握木匙掛回工作架，小鹿在左側觀察，小烏龜在右邊矮凳','白天店務，無即時氣象宣稱'],
 ['居家木桌、打開的素面運送紙箱與填充紙','雙手拿著卡片閱讀，卡片朝外的一面空白','室內日光，文案未指定季節'],
 ['轉涼午後，窗外陰雲與秋色，室內木窗座','雙手捧著有蒸汽的小陶杯，沒有貓或其他角色','秋涼用生活情境呈現，沒有實際氣象保證']
];
const prepared=[];
for(let i=0;i<targets.length;i++){
 const t=targets[i], path='assets/post-images/2026-11-12/'+t.id+'-'+t.version+'.jpg';
 const media=await fetch(prefix+'9f9bbe8de3e5bb502a49bb4af3642159ad98f882/'+path);
 const bytes=Buffer.from(await media.arrayBuffer());
 if(!media.ok||bytes.length!==t.replacement.bytes||hash(bytes)!==t.replacement.sha256)throw Error('Asset hash mismatch: '+t.id);
 const url=prefix+'main/'+path;
 const old=(await query('SELECT * FROM social_posts WHERE id=? AND '+guard,[t.id])).results[0];
 if(!old||old.copy!==t.copy||old.title!==t.title||!['draft','pending_review'].includes(old.status)||![url,prefix+'main/'+t.path].includes(old.image_url))throw Error('Unexpected current post: '+t.id);
 if((await query("SELECT id FROM social_posts WHERE id<>? AND image_url=? LIMIT 1",[t.id,url])).results.length)throw Error('Duplicate URL: '+t.id);
 if((await query("SELECT post_id FROM social_post_quality_reviews WHERE post_id<>? AND image_sha256=? LIMIT 1",[t.id,t.replacement.sha256])).results.length)throw Error('Duplicate known SHA: '+t.id);
 prepared.push({t,old,url,scene:specific[i]});
}
for(const {t,old,url,scene} of prepared){
 const now=new Date().toISOString();
 const material={title:clean(old.title),headline:clean(old.headline),copy:clean(old.copy),category:clean(old.category),image_url:url,image_alt:t.alt,image_source:source,image_width:1080,image_height:1080,image_quality_status:'clear'};
 const fp=hash(JSON.stringify(material));
 const details=['紅色直式仙加味印章、米白中式上衣與深橄欖綠圍裙清楚','生活情境圖，無品牌商品本體或虛構零售包裝','文案與畫面未標示商品規格，這一項不適用','沒有價金、優惠、試喝或活動資訊',scene[2],scene[2],scene[0],scene[0],scene[0],'溫熱與常溫物件符合圖文，未加入冰飲或錯誤加熱示範','角色表情自然，與日常活動和文案語氣一致',scene[1],'小老闆短黑髮、大眼睛，與分開的小鹿、小烏龜同框','一般家具及道具比例自然，無商品比例宣稱','正式D1圖片網址與已記錄圖片SHA已檢查，歷史視覺去重尚未齊全，15份媒體及舊輪播子圖仍缺件','圖片及生活文案未提供療效、疾病、價格或產品規格宣稱'];
 const evidence={requested_decision:'defer',reviewer_type:'AI',model:'ChatGPT',post_id:t.id,content_fingerprint:fp,image_url:url,image_sha256:t.replacement.sha256,reviewed_at:now,checks:Object.fromEntries(keys.map((k,i)=>[k,{result:k==='duplicate'?'DEFER':'PASS',evidence:details[i]}])),risk:{uncertainties:['完整歷史視覺去重尚未完成，缺件紀錄保留']},publication:{approved:false,auto_publish:false,auto_schedule:false},visual:{scene_summary:scene.join('；'),image_sha256:t.replacement.sha256,products_visible:false}};
 const review='AI-DEFER-'+hash(JSON.stringify(evidence));
 const changed=await query("UPDATE social_posts SET image_url=?,image_alt=?,image_source=?,image_width=1080,image_height=1080,image_bytes=?,image_quality_status='clear',status='pending_review',review_note=?,updated_at=? WHERE id=? AND updated_at=? AND image_url=? AND status=? AND "+guard,[url,t.alt,source,t.replacement.bytes,'AI審核：NEEDS_HUMAN_REVIEW；歷史視覺去重尚未完成',now,t.id,old.updated_at,old.image_url,old.status]);
 if(changed.meta.changes!==1)throw Error('Concurrent change: '+t.id);
 const saved=await query("INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT ?,?,'AI','NEEDS_HUMAN_REVIEW',?,?,?,?,?,'2026-10-31-ai-deferral-only-v1',NULL,?,?,'pending_review' WHERE EXISTS (SELECT 1 FROM social_posts WHERE id=? AND updated_at=? AND image_url=? AND status='pending_review' AND "+guard+")",[review,t.id,fp,url,t.replacement.sha256,JSON.stringify(evidence),'ChatGPT',now,old.status,t.id,now,url]);
 if(saved.meta.changes!==1)throw Error('Evidence not saved: '+t.id);
 const read=(await query("SELECT p.id,p.status,p.image_url,p.image_bytes,p.image_approved,q.content_fingerprint,q.image_sha256,q.decision FROM social_posts p JOIN social_post_quality_reviews q ON q.post_id=p.id WHERE p.id=? AND q.id=?",[t.id,review])).results[0];
 if(!read||read.image_url!==url||read.image_sha256!==t.replacement.sha256||read.content_fingerprint!==fp||read.status!=='pending_review'||Number(read.image_approved)!==0)throw Error('Readback mismatch: '+t.id);
 console.log(JSON.stringify(read));
}
console.log(JSON.stringify((await query('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status')).results));
console.log(JSON.stringify((await query('SELECT post_id,state FROM social_metricool_sync WHERE CAST(metricool_id AS TEXT)=?',['409189881'])).results));
