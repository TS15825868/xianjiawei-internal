import { createRemoteJWKSet, jwtVerify } from 'jose';
import { publishDuePosts, publishPostById, publisherConfiguration } from './social-publisher.js';

const VERSION='2026-08-07-public-runtime-v1';
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-xianjiawei-runtime':VERSION};
const MODULES=new Set(['products','customers','visits','orders','inventory','purchases','suppliers','finance','tasks','documents','templates','assets']);
const MODULE_PREFIX={products:'PRD',customers:'CUS',visits:'VIS',orders:'ORD',inventory:'INV',purchases:'PUR',suppliers:'SUP',finance:'FIN',tasks:'TSK',documents:'DOC',templates:'TPL',assets:'AST'};
const READ_RESTRICTED={finance:['owner','admin','accounting']};
const WRITE_ROLES={products:['owner','admin'],customers:['owner','admin','sales'],visits:['owner','admin','sales'],orders:['owner','admin','sales','warehouse','accounting'],inventory:['owner','admin','warehouse'],purchases:['owner','admin','warehouse','accounting'],suppliers:['owner','admin','warehouse','accounting'],finance:['owner','admin','accounting'],tasks:['owner','admin','sales','warehouse','accounting','content'],documents:['owner','admin','content'],templates:['owner','admin','content'],assets:['owner','admin','content'],posts:['owner','admin','content']};
const ALLOWED_PLATFORMS=new Set(['Facebook','Instagram','LINE OA','LINE OA 廣播','LINE VOOM','Google 商家']);
let schemaPromise=null;

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});}
function clean(value,fallback=''){return String(value??fallback).trim();}
function cleanMultiline(value,fallback=''){return clean(value,fallback).replace(/\\n/g,'\n');}
function makeId(prefix){return `${prefix}-${crypto.randomUUID()}`;}
function safeNumber(value){const number=Number(value??0);return Number.isFinite(number)?number:0;}
function safeInt(value){const number=Number(value??0);return Number.isFinite(number)?Math.round(number):0;}
function safePlatforms(value){
  const input=Array.isArray(value)?value:[];
  return [...new Set(input.map(clean).filter((item)=>ALLOWED_PLATFORMS.has(item)))];
}
function roleLabel(role){return({owner:'系統擁有者',admin:'管理員',sales:'業務',warehouse:'倉庫',accounting:'財務',content:'內容管理',viewer:'僅檢視'})[role]||role;}
function canRead(profile,module){const roles=READ_RESTRICTED[module];return !roles||roles.includes(profile.role);}
function canWrite(profile,module){return(WRITE_ROLES[module]||['owner','admin']).includes(profile.role);}
function decodeJwtPayload(token){
  try{const part=String(token||'').split('.')[1];if(!part)return null;const normalized=part.replace(/-/g,'+').replace(/_/g,'/');const padded=normalized.padEnd(Math.ceil(normalized.length/4)*4,'=');return JSON.parse(atob(padded));}catch{return null;}
}
function audienceValues(value){if(Array.isArray(value))return value.flatMap(audienceValues).filter(Boolean);return String(value||'').split(/[\s,]+/).map(clean).filter(Boolean);}
function imageQuality(width,height){
  if(!width||!height)return{ok:true,status:'unknown'};
  const longSide=Math.max(width,height),shortSide=Math.min(width,height),squareLike=longSide/Math.max(1,shortSide)<=1.15;
  const ok=squareLike?shortSide>=1254:shortSide>=1000&&longSide>=1400;
  return{ok,status:ok?'clear':'low'};
}
async function readJson(request){try{return await request.json();}catch{throw new Error('請求內容不是有效的 JSON');}}
function cleanRecord(value){
  if(!value||Array.isArray(value)||typeof value!=='object')throw new Error('資料格式錯誤');
  const output={};
  for(const [key,item] of Object.entries(value)){
    if(['__proto__','prototype','constructor'].includes(key))continue;
    if(typeof item==='string')output[key]=item.trim();
    else if(typeof item==='number'||typeof item==='boolean'||item==null)output[key]=item;
    else if(Array.isArray(item))output[key]=item.slice(0,100);
  }
  if(JSON.stringify(output).length>120000)throw new Error('單筆資料過大，請將大型圖片或檔案改放素材庫');
  return output;
}
async function addColumn(env,table,definition){
  try{await env.DB.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);}catch(error){if(!/duplicate column|already exists/i.test(String(error?.message||error)))throw error;}
}
async function ensureSchema(env){
  if(!env.DB)throw new Error('D1 資料庫尚未綁定');
  if(schemaPromise)return schemaPromise;
  schemaPromise=(async()=>{
    await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS profiles(
        email TEXT PRIMARY KEY,display_name TEXT NOT NULL DEFAULT '',role TEXT NOT NULL DEFAULT 'viewer',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS app_records(
        module TEXT NOT NULL,id TEXT NOT NULL,data_json TEXT NOT NULL DEFAULT '{}',archived INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(module,id)
      );
      CREATE TABLE IF NOT EXISTS app_settings(
        setting_key TEXT PRIMARY KEY,setting_value TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS social_posts(
        id TEXT PRIMARY KEY,title TEXT NOT NULL DEFAULT '',headline TEXT NOT NULL DEFAULT '',copy TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT '日常節奏',platforms_json TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL DEFAULT 'draft',scheduled_at TEXT,proposed_scheduled_at TEXT,approved_by TEXT,approved_at TEXT,published_at TEXT,image_url TEXT NOT NULL DEFAULT '',image_alt TEXT NOT NULL DEFAULT '',image_source TEXT NOT NULL DEFAULT '官方素材',image_approved INTEGER NOT NULL DEFAULT 0,image_width INTEGER NOT NULL DEFAULT 0,image_height INTEGER NOT NULL DEFAULT 0,image_bytes INTEGER NOT NULL DEFAULT 0,image_quality_status TEXT NOT NULL DEFAULT 'unknown',created_by TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS social_publish_deliveries(
        post_id TEXT NOT NULL,platform TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempt_count INTEGER NOT NULL DEFAULT 0,last_attempt_at TEXT,published_at TEXT,remote_id TEXT NOT NULL DEFAULT '',response_json TEXT NOT NULL DEFAULT '',error_text TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(post_id,platform)
      );
      CREATE TABLE IF NOT EXISTS audit_logs(
        id TEXT PRIMARY KEY,actor_email TEXT NOT NULL DEFAULT '',action TEXT NOT NULL DEFAULT '',entity_type TEXT NOT NULL DEFAULT '',entity_id TEXT NOT NULL DEFAULT '',before_json TEXT,after_json TEXT,ip TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    for(const definition of ["proposed_scheduled_at TEXT","image_alt TEXT NOT NULL DEFAULT ''","image_source TEXT NOT NULL DEFAULT '官方素材'","image_approved INTEGER NOT NULL DEFAULT 0","image_width INTEGER NOT NULL DEFAULT 0","image_height INTEGER NOT NULL DEFAULT 0","image_bytes INTEGER NOT NULL DEFAULT 0","image_quality_status TEXT NOT NULL DEFAULT 'unknown'","approved_by TEXT","approved_at TEXT","published_at TEXT"]){await addColumn(env,'social_posts',definition);}
    for(const definition of ["attempt_count INTEGER NOT NULL DEFAULT 0","last_attempt_at TEXT","published_at TEXT","remote_id TEXT NOT NULL DEFAULT ''","response_json TEXT NOT NULL DEFAULT ''","error_text TEXT NOT NULL DEFAULT ''","created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP","updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"]){await addColumn(env,'social_publish_deliveries',definition);}
  })().catch((error)=>{schemaPromise=null;throw error;});
  return schemaPromise;
}
async function verifyAccess(request,env){
  if(!env.POLICY_AUD||!env.TEAM_DOMAIN)throw new Error('Cloudflare Access 驗證尚未設定完成');
  const token=request.headers.get('cf-access-jwt-assertion');
  if(!token)throw new Error('找不到 Cloudflare Access 登入憑證');
  const teamDomain=clean(env.TEAM_DOMAIN).replace(/\/$/,'');
  const unverified=decodeJwtPayload(token);
  let audiences=audienceValues(env.POLICY_AUD);
  if(String(env.ALLOW_TEAM_AUD_FALLBACK||'').toLowerCase()==='true'){
    const tokenAudiences=audienceValues(unverified?.aud);
    if(tokenAudiences.length)audiences=tokenAudiences;
  }
  const jwks=createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  const {payload}=await jwtVerify(token,jwks,{issuer:teamDomain,audience:audiences});
  const email=clean(payload.email).toLowerCase();
  if(!email)throw new Error('登入憑證沒有電子郵件');
  let profile=await env.DB.prepare('SELECT email,display_name,role,active FROM profiles WHERE lower(email)=? LIMIT 1').bind(email).first();
  if(!profile){
    const count=await env.DB.prepare('SELECT COUNT(*) AS count FROM profiles').first();
    if(Number(count?.count||0)===0){
      await env.DB.prepare("INSERT INTO profiles(email,display_name,role,active) VALUES(?,?,'owner',1)").bind(email,email.split('@')[0]).run();
      profile=await env.DB.prepare('SELECT email,display_name,role,active FROM profiles WHERE lower(email)=? LIMIT 1').bind(email).first();
    }
  }
  if(!profile||Number(profile.active)!==1)throw new Error('此帳號尚未被加入仙加味內部系統');
  return profile;
}
async function audit(env,request,profile,action,entityType,entityId,beforeValue,afterValue){
  try{
    const ip=request.headers.get('cf-connecting-ip')||'';
    await env.DB.prepare('INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) VALUES(?,?,?,?,?,?,?,?)').bind(makeId('AUD'),profile.email,action,entityType,entityId||'',beforeValue==null?null:JSON.stringify(beforeValue),afterValue==null?null:JSON.stringify(afterValue),ip).run();
  }catch(error){console.warn('audit failed',String(error?.message||error));}
}

function mapRecord(row){
  let value={};try{value=JSON.parse(row.data_json||'{}');}catch{}
  return{...value,id:row.id,created_at:row.created_at,updated_at:row.updated_at};
}
async function listRecords(env,module){
  const result=await env.DB.prepare("SELECT id,data_json,created_at,updated_at FROM app_records WHERE module=? AND archived=0 ORDER BY datetime(updated_at) DESC").bind(module).all();
  return(result.results||[]).map(mapRecord);
}
async function getRecord(env,module,id){
  const row=await env.DB.prepare("SELECT id,data_json,created_at,updated_at FROM app_records WHERE module=? AND id=? AND archived=0 LIMIT 1").bind(module,id).first();
  return row?mapRecord(row):null;
}
async function createRecord(request,env,profile,module){
  if(!canWrite(profile,module))return json({error:'沒有新增資料權限'},403);
  const body=cleanRecord(await readJson(request));
  const id=clean(body.id)||makeId(MODULE_PREFIX[module]||'REC');delete body.id;
  const now=new Date().toISOString();
  await env.DB.prepare("INSERT INTO app_records(module,id,data_json,archived,created_at,updated_at) VALUES(?,?,?,0,?,?)").bind(module,id,JSON.stringify(body),now,now).run();
  const saved=await getRecord(env,module,id);await audit(env,request,profile,'新增',module,id,null,saved);return json(saved,201);
}
async function updateRecord(request,env,profile,module,id){
  if(!canWrite(profile,module))return json({error:'沒有修改資料權限'},403);
  const before=await getRecord(env,module,id);if(!before)return json({error:'找不到資料'},404);
  const patch=cleanRecord(await readJson(request));delete patch.id;delete patch.created_at;delete patch.updated_at;
  const merged={...before,...patch};delete merged.id;delete merged.created_at;delete merged.updated_at;
  const now=new Date().toISOString();
  await env.DB.prepare("UPDATE app_records SET data_json=?,updated_at=? WHERE module=? AND id=? AND archived=0").bind(JSON.stringify(merged),now,module,id).run();
  const after=await getRecord(env,module,id);await audit(env,request,profile,'修改',module,id,before,after);return json(after);
}
async function deleteRecord(request,env,profile,module,id){
  if(!canWrite(profile,module))return json({error:'沒有刪除資料權限'},403);
  const before=await getRecord(env,module,id);if(!before)return json({error:'找不到資料'},404);
  await env.DB.prepare("UPDATE app_records SET archived=1,updated_at=? WHERE module=? AND id=?").bind(new Date().toISOString(),module,id).run();
  await audit(env,request,profile,'封存',module,id,before,null);return json({ok:true,id});
}

function mapPost(row){
  let platforms=[];try{platforms=JSON.parse(row.platforms_json||'[]');}catch{}
  return{id:row.id,title:row.title||'',headline:cleanMultiline(row.headline||''),copy:cleanMultiline(row.copy||''),category:row.category||'日常節奏',platforms,status:row.status||'draft',scheduled_at:row.scheduled_at||'',proposed_scheduled_at:row.proposed_scheduled_at||'',approved_by:row.approved_by||'',approved_at:row.approved_at||'',published_at:row.published_at||'',image_url:row.image_url||'',image_alt:row.image_alt||'',image_source:row.image_source||'官方素材',image_approved:Number(row.image_approved||0)===1,image_width:safeInt(row.image_width),image_height:safeInt(row.image_height),image_bytes:safeInt(row.image_bytes),image_quality_status:row.image_quality_status||'unknown',created_by:row.created_by||'',created_at:row.created_at||'',updated_at:row.updated_at||'',owner_review_required:!['published','archived'].includes(row.status),auto_approve:false,auto_schedule:false,auto_publish:false,line_voom_manual_only:true};
}
async function getPost(env,id){const row=await env.DB.prepare('SELECT * FROM social_posts WHERE id=? LIMIT 1').bind(id).first();return row?mapPost(row):null;}
async function listPosts(env){const result=await env.DB.prepare("SELECT * FROM social_posts WHERE status<>'archived' ORDER BY datetime(updated_at) DESC,datetime(created_at) DESC").all();return(result.results||[]).map(mapPost);}
async function createPost(request,env,profile){
  if(!canWrite(profile,'posts'))return json({error:'沒有新增貼文權限'},403);
  const body=await readJson(request),now=new Date().toISOString(),width=safeInt(body.image_width),height=safeInt(body.image_height),quality=imageQuality(width,height);
  const post={id:makeId('XJW'),title:clean(body.title),headline:cleanMultiline(body.headline),copy:cleanMultiline(body.copy),category:clean(body.category,'日常節奏'),platforms:safePlatforms(body.platforms),image_url:clean(body.image_url),image_alt:clean(body.image_alt),image_source:clean(body.image_source,'官方素材'),image_width:width,image_height:height,image_bytes:safeInt(body.image_bytes),image_quality_status:clean(body.image_quality_status,quality.status)};
  if(!post.title)return json({error:'貼文標題不可空白'},400);if(!post.platforms.length)post.platforms=['Facebook','Instagram'];
  await env.DB.prepare("INSERT INTO social_posts(id,title,headline,copy,category,platforms_json,status,scheduled_at,image_url,image_alt,image_source,image_approved,image_width,image_height,image_bytes,image_quality_status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,'draft',NULL,?,?,?,0,?,?,?,?,?,?,?)").bind(post.id,post.title,post.headline,post.copy,post.category,JSON.stringify(post.platforms),post.image_url,post.image_alt,post.image_source,post.image_width,post.image_height,post.image_bytes,post.image_quality_status,profile.email,now,now).run();
  const saved=await getPost(env,post.id);await audit(env,request,profile,'新增','貼文',post.id,null,saved);return json(saved,201);
}
async function updatePost(request,env,profile,id){
  if(!canWrite(profile,'posts'))return json({error:'沒有修改貼文權限'},403);
  const before=await getPost(env,id);if(!before)return json({error:'找不到貼文'},404);
  const body=await readJson(request),now=new Date().toISOString();
  const title=clean(body.title,before.title),headline=cleanMultiline(body.headline,before.headline),copy=cleanMultiline(body.copy,before.copy),category=clean(body.category,before.category),platforms=body.platforms===undefined?before.platforms:safePlatforms(body.platforms),imageUrl=clean(body.image_url,before.image_url),imageAlt=clean(body.image_alt,before.image_alt),imageSource=clean(body.image_source,before.image_source),imageWidth=body.image_width===undefined?before.image_width:safeInt(body.image_width),imageHeight=body.image_height===undefined?before.image_height:safeInt(body.image_height),imageBytes=body.image_bytes===undefined?before.image_bytes:safeInt(body.image_bytes),quality=imageQuality(imageWidth,imageHeight),qualityStatus=clean(body.image_quality_status,quality.status);
  if(!title)return json({error:'貼文標題不可空白'},400);if(!platforms.length)return json({error:'請至少選擇一個發布平台'},400);
  await env.DB.prepare("UPDATE social_posts SET title=?,headline=?,copy=?,category=?,platforms_json=?,image_url=?,image_alt=?,image_source=?,image_width=?,image_height=?,image_bytes=?,image_quality_status=?,image_approved=0,status='draft',scheduled_at=NULL,approved_by=NULL,approved_at=NULL,published_at=NULL,updated_at=? WHERE id=?").bind(title,headline,copy,category,JSON.stringify(platforms),imageUrl,imageAlt,imageSource,imageWidth,imageHeight,imageBytes,qualityStatus,now,id).run();
  const after=await getPost(env,id);await audit(env,request,profile,'修改並退回草稿','貼文',id,before,after);return json(after);
}
async function changePostStatus(request,env,profile,id){
  if(!canWrite(profile,'posts'))return json({error:'沒有貼文審核權限'},403);
  const before=await getPost(env,id);if(!before)return json({error:'找不到貼文'},404);
  const body=await readJson(request),next=clean(body.status),allowed={pending_review:['approved','draft'],draft:['approved'],approved:['draft','scheduled'],scheduled:['draft','published'],published:['archived']};
  if(!(allowed[before.status]||[]).includes(next))return json({error:`不允許由「${before.status}」變更為「${next}」`},400);
  if(next==='approved'){
    if(!before.copy&&!before.headline)return json({error:'貼文沒有文案，不能審核通過'},400);
    if(!before.image_url)return json({error:'貼文沒有圖片，不能審核通過'},400);
    if(!before.platforms.length)return json({error:'貼文沒有發布平台，不能審核通過'},400);
    if(before.image_quality_status==='low')return json({error:'圖片解析度不足，不能審核通過'},400);
  }
  if(next==='scheduled'){
    const scheduledAt=clean(body.scheduled_at);if(!scheduledAt)return json({error:'加入排程時必須填寫排程時間'},400);
    const date=new Date(scheduledAt);if(Number.isNaN(date.getTime())||date.getTime()<=Date.now())return json({error:'排程時間必須晚於目前時間'},400);
  }
  const now=new Date().toISOString(),approvedBy=next==='approved'?profile.email:next==='draft'?null:before.approved_by||null,approvedAt=next==='approved'?now:next==='draft'?null:before.approved_at||null,scheduledAt=next==='scheduled'?clean(body.scheduled_at):next==='draft'?null:before.scheduled_at||null,publishedAt=next==='published'?now:next==='draft'?null:before.published_at||null,imageApproved=next==='approved'?1:next==='draft'?0:before.image_approved?1:0;
  await env.DB.prepare('UPDATE social_posts SET status=?,scheduled_at=?,approved_by=?,approved_at=?,published_at=?,image_approved=?,updated_at=? WHERE id=?').bind(next,scheduledAt,approvedBy,approvedAt,publishedAt,imageApproved,now,id).run();
  const after=await getPost(env,id);await audit(env,request,profile,`狀態改為${next}`,'貼文',id,before,after);return json(after);
}
async function publishNow(request,env,profile,id){
  if(!canWrite(profile,'posts'))return json({error:'沒有發布貼文權限'},403);
  const post=await getPost(env,id);if(!post)return json({error:'找不到貼文'},404);
  if(!['approved','scheduled'].includes(post.status))return json({error:'貼文必須先審核通過，才能立即發布'},409);
  if(!post.image_url||!post.image_approved)return json({error:'貼文圖片尚未完成審核，不能立即發布'},409);
  const configuration=publisherConfiguration(env);
  const automatic=post.platforms.filter((platform)=>platform!=='LINE VOOM');
  const missing=automatic.filter((platform)=>!configuration.platforms?.[platform]?.ready);
  if(missing.length)return json({error:`尚未完成自動發布授權：${missing.join('、')}`,missing_platforms:missing,publisher:configuration},503);
  const now=new Date().toISOString();
  await env.DB.prepare("UPDATE social_posts SET status='scheduled',scheduled_at=?,updated_at=? WHERE id=?").bind(now,now,id).run();
  const result=await publishPostById(env,id,new Date());
  const after=await getPost(env,id);await audit(env,request,profile,'立即發布','貼文',id,post,{post:after,result});
  if(!result.ok)return json({error:'立即發布未全部完成，系統會依重試規則繼續處理',...result},502);
  return json({ok:true,partially_published:Boolean(result.manual_required),manual_required:Boolean(result.manual_required),id,status:after?.status||'published',message:result.manual_required?'自動平台已完成；LINE VOOM 仍需人工發布。':'立即發布完成。',result});
}

async function overview(env){
  const modules={};
  for(const module of MODULES){const row=await env.DB.prepare("SELECT COUNT(*) AS count FROM app_records WHERE module=? AND archived=0").bind(module).first();modules[module]=Number(row?.count||0);}
  const result=await env.DB.prepare("SELECT status,COUNT(*) AS count FROM social_posts WHERE status<>'archived' GROUP BY status").all();
  const posts={draft:0,pending_review:0,approved:0,scheduled:0,published:0};for(const row of result.results||[])posts[row.status]=Number(row.count||0);
  return{modules,posts,checked_at:new Date().toISOString()};
}
async function settings(env){
  const result=await env.DB.prepare('SELECT setting_key,setting_value,updated_at FROM app_settings ORDER BY setting_key').all();
  const output={schedule_policy:'週二 19:30、週六 09:30（Asia/Taipei）；立即發布不受固定時段限制',storage:'Cloudflare D1',secrets:'Cloudflare Worker Secrets',access:'Cloudflare Access'};
  for(const row of result.results||[]){if(/token|secret|password|credential|private.?key|api.?key/i.test(row.setting_key))continue;let value=row.setting_value;try{value=JSON.parse(value);}catch{}output[row.setting_key]=value;}
  return{settings:output};
}
async function health(env){
  if(!env.DB)return json({ok:false,service:'仙加味營運中控',version:VERSION,error:'D1 資料庫尚未綁定'},503);
  try{
    await ensureSchema(env);
    const [products,inventory,posts]=await Promise.all([env.DB.prepare("SELECT COUNT(*) AS count FROM app_records WHERE module='products' AND archived=0").first(),env.DB.prepare("SELECT COUNT(*) AS count FROM app_records WHERE module='inventory' AND archived=0").first(),env.DB.prepare("SELECT COUNT(*) AS count FROM social_posts WHERE status<>'archived'").first()]);
    return json({ok:true,service:'仙加味營運中控',version:VERSION,storage:'cloudflare-d1',products:Number(products?.count||0),inventory:Number(inventory?.count||0),posts:Number(posts?.count||0),checkedAt:new Date().toISOString(),publicRepository:'TS15825868/xianjiawei-internal',privateHistoryRepository:'TS15825868/xianjiawei-internal-private',privateOperationalDataInGit:false,accessProtected:true,socialPublisher:publisherConfiguration(env),fixedPostingFrequency:'每週兩篇（週二 19:30、週六 09:30，Asia/Taipei）',immediatePublishing:true,lineVoomManualOnly:true});
  }catch(error){return json({ok:false,service:'仙加味營運中控',version:VERSION,error:String(error?.message||error),checkedAt:new Date().toISOString()},503);}
}

async function handleApi(request,env,ctx,profile){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/me'&&request.method==='GET')return json({...profile,role_label:roleLabel(profile.role)});
  if(path==='/api/overview'&&request.method==='GET')return json(await overview(env));
  if(path==='/api/settings'&&request.method==='GET')return json(await settings(env));
  if(path==='/api/platform-authorization'&&request.method==='GET')return json(publisherConfiguration(env));
  if(path==='/api/public-content-source'&&request.method==='GET')return json({ok:true,copyAndImageAuthority:'TS15825868/xianjiawei',approvalSchedulePublishResults:'Cloudflare D1',runtimeCode:'TS15825868/xianjiawei-internal',privateHistory:'TS15825868/xianjiawei-internal-private'});
  if(path==='/api/posts'){
    if(request.method==='GET')return json(await listPosts(env));
    if(request.method==='POST')return createPost(request,env,profile);
  }
  const postMatch=path.match(/^\/api\/posts\/([^/]+)$/);
  if(postMatch){const id=decodeURIComponent(postMatch[1]);if(request.method==='GET'){const post=await getPost(env,id);return post?json(post):json({error:'找不到貼文'},404);}if(request.method==='PUT')return updatePost(request,env,profile,id);}
  const statusMatch=path.match(/^\/api\/posts\/([^/]+)\/status$/);if(statusMatch&&request.method==='POST')return changePostStatus(request,env,profile,decodeURIComponent(statusMatch[1]));
  const publishMatch=path.match(/^\/api\/posts\/([^/]+)\/publish-now$/);if(publishMatch&&request.method==='POST')return publishNow(request,env,profile,decodeURIComponent(publishMatch[1]));
  if(path==='/api/assets'){
    if(!canRead(profile,'assets'))return json({error:'沒有讀取權限'},403);
    if(request.method==='GET')return json(await listRecords(env,'assets'));
    if(request.method==='POST')return createRecord(request,env,profile,'assets');
  }
  const moduleMatch=path.match(/^\/api\/modules\/([^/]+)(?:\/([^/]+))?$/);
  if(moduleMatch){
    const module=decodeURIComponent(moduleMatch[1]),id=moduleMatch[2]?decodeURIComponent(moduleMatch[2]):'';
    if(!MODULES.has(module))return json({error:'不支援的模組'},404);
    if(!canRead(profile,module))return json({error:'沒有讀取權限'},403);
    if(!id&&request.method==='GET')return json(await listRecords(env,module));
    if(!id&&request.method==='POST')return createRecord(request,env,profile,module);
    if(id&&request.method==='GET'){const item=await getRecord(env,module,id);return item?json(item):json({error:'找不到資料'},404);}
    if(id&&request.method==='PUT')return updateRecord(request,env,profile,module,id);
    if(id&&request.method==='DELETE')return deleteRecord(request,env,profile,module,id);
  }
  return json({error:'找不到 API 路徑'},404);
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/healthz')return health(env);
    if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
    try{await ensureSchema(env);const profile=await verifyAccess(request,env);return await handleApi(request,env,ctx,profile);}catch(error){const message=String(error?.message||error);const status=/登入|Access|帳號|憑證|電子郵件/.test(message)?401:500;return json({error:message},status);}
  },
  async scheduled(controller,env,ctx){
    ctx.waitUntil((async()=>{try{await ensureSchema(env);const result=await publishDuePosts(env,new Date(controller.scheduledTime||Date.now()));console.log('仙加味排程發布檢查',JSON.stringify(result));}catch(error){console.error('仙加味排程發布失敗',String(error?.message||error));}})());
  }
};
