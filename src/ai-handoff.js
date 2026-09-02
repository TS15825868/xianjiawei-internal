const ACTIVE_STATUSES=new Set(['waiting_chatgpt','pending_review']);
const ALLOWED_TYPES=new Set(['image','copy','all']);
const ALLOWED_STATUS=new Set(['waiting_chatgpt','pending_review','resolved','cancelled']);
const clean=(value,fallback='')=>String(value??fallback).trim();
const nowIso=()=>new Date().toISOString();

const BRAND_RULES=`品牌只顯示「仙加味」，不可出現公司名稱、統編、公司電話或公司地址。文案以日常飲食、生活節奏、料理搭配、品牌故事、產品知識、FAQ、保存、溫熱飲用、試喝或LINE諮詢等安全方向為主，不談療效、不強迫推銷。圖片必須是一體成形、自然完整的單一情境圖，禁止拼湊、剪貼、貼圖、紙偶、分層浮貼、產品像另外貼上去或角色像從別張圖剪下來；背景、角色、夥伴、道具與產品的透視、光線、陰影、視線與比例必須像同一個場景自然存在。提到產品時，產品本體必須維持正式實物外觀與比例，不得重畫、改包裝、改標籤、裁切、拉伸或巨大化；若置入情境，必須自然融入桌面、手持、架上、餐桌或料理場景，不可有浮貼感。龜鹿飲30cc固定為30cc／罐（小玻璃罐），裸罐、無貼紙；龜鹿飲180cc固定為180cc／包（鋁袋），維持正式狹長比例；龜鹿膏100g維持目前正式包裝；龜鹿膠600g維持正式盒型比例。小老闆固定官網Q版造型，小鹿與小烏龜為分開的獨立夥伴，不可融合。季節、天氣、場合、地點、情境、環境、冷熱、表情、動作與產品必須一致。任何拼湊剪貼感、產品錯誤、圖文不符或法規疑慮都不發布，改回待審核。`;

export async function ensureAiSchema(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ai_handoff_jobs(
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL DEFAULT '',
    job_type TEXT NOT NULL DEFAULT 'all',
    reason TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'waiting_chatgpt',
    source TEXT NOT NULL DEFAULT 'erp',
    result_note TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ai_handoff_status ON ai_handoff_jobs(status,updated_at)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ai_handoff_post ON ai_handoff_jobs(post_id,updated_at)').run();
}

function mapRow(row){return{...row,job_type:row.job_type||'all',status:row.status||'waiting_chatgpt'};}

export async function listAiJobs(env,{status='active',limit=200}={}){
  await ensureAiSchema(env);
  const capped=Math.max(1,Math.min(500,Number(limit)||200));
  let sql='SELECT * FROM ai_handoff_jobs';
  const args=[];
  if(status==='active') sql+=" WHERE status IN ('waiting_chatgpt','pending_review')";
  else if(status&&status!=='all'){sql+=' WHERE status=?';args.push(status);}
  sql+=' ORDER BY datetime(updated_at) DESC LIMIT ?';args.push(capped);
  const result=await env.DB.prepare(sql).bind(...args).all();
  return(result.results||[]).map(mapRow);
}

async function existingActive(env,postId,type,reason){
  const row=await env.DB.prepare("SELECT * FROM ai_handoff_jobs WHERE post_id=? AND job_type=? AND reason=? AND status IN ('waiting_chatgpt','pending_review') ORDER BY datetime(updated_at) DESC LIMIT 1").bind(postId,type,reason).first();
  return row?mapRow(row):null;
}

export async function createAiJob(env,profile,payload={}){
  await ensureAiSchema(env);
  if(!['owner','admin','content'].includes(profile?.role)) throw new Error('沒有建立AI任務的權限');
  const postId=clean(payload.post_id).slice(0,180);
  const type=ALLOWED_TYPES.has(clean(payload.job_type))?clean(payload.job_type):'all';
  const reason=clean(payload.reason,'人工要求重新生成').slice(0,1200);
  const prompt=clean(payload.prompt).slice(0,50000);
  const source=clean(payload.source,'erp').slice(0,80);
  if(!postId) throw new Error('AI任務缺少貼文ID');
  if(!prompt) throw new Error('AI任務缺少生成指令');
  const duplicate=await existingActive(env,postId,type,reason);
  if(duplicate) return{created:false,job:duplicate};
  const id=`AI-${crypto.randomUUID()}`,now=nowIso();
  await env.DB.prepare('INSERT INTO ai_handoff_jobs(id,post_id,job_type,reason,prompt,status,source,result_note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,postId,type,reason,prompt,'waiting_chatgpt',source,'',clean(profile.email,'system'),now,now).run();
  const row=await env.DB.prepare('SELECT * FROM ai_handoff_jobs WHERE id=?').bind(id).first();
  return{created:true,job:mapRow(row)};
}

export async function updateAiJobStatus(env,profile,id,payload={}){
  await ensureAiSchema(env);
  if(!['owner','admin','content'].includes(profile?.role)) throw new Error('沒有更新AI任務的權限');
  const status=clean(payload.status);
  if(!ALLOWED_STATUS.has(status)) throw new Error('AI任務狀態不支援');
  const before=await env.DB.prepare('SELECT * FROM ai_handoff_jobs WHERE id=? LIMIT 1').bind(id).first();
  if(!before) throw new Error('找不到AI任務');
  const resultNote=clean(payload.result_note,before.result_note||'').slice(0,3000);
  const now=nowIso();
  await env.DB.prepare('UPDATE ai_handoff_jobs SET status=?,result_note=?,updated_at=? WHERE id=?').bind(status,resultNote,now,id).run();
  const row=await env.DB.prepare('SELECT * FROM ai_handoff_jobs WHERE id=?').bind(id).first();
  return mapRow(row);
}

function detectIssues(post){
  const text=`${post.title||''} ${post.headline||''} ${post.copy||''}`;
  const image=`${post.image_url||''} ${post.image_alt||''} ${post.image_source||''}`;
  const copy=[];const visual=[];
  for(const term of ['台興山產有限公司','統一編號','公司電話','公司地址','治療','治癒','保證改善','藥到病除']) if(text.includes(term)) copy.push(`文案含不允許字詞「${term}」`);
  if(/龜鹿飲30cc玻璃瓶|30cc\s*／\s*瓶|小玻璃瓶/.test(text)) copy.push('30cc名稱／單位錯誤，必須是30cc／罐（小玻璃罐）');
  if(/龜鹿湯塊\s*150g|150g\s*／\s*盒/.test(text)) copy.push('仍含已移除的龜鹿湯塊150g規格');
  if(!clean(post.image_url)) visual.push('缺少貼文圖片');
  if(post.image_quality_status==='low') visual.push('圖片解析度不足');
  if(/approved-v405/i.test(image)&&/(龜鹿膏|30cc|180cc|龜鹿膠|龜鹿系列)/.test(text)) visual.push('仍使用舊產品候選圖，需依最新版包裝與比例重做');
  if(/拼湊|剪貼|collage|cut.?and.?paste|floating.?sticker|紙偶|浮貼/i.test(image)) visual.push('圖片來源或標記顯示可能有拼湊／剪貼／浮貼感，必須重做為完整單一情境圖');
  return{copy:[...new Set(copy)],visual:[...new Set(visual)]};
}

function buildPrompt(post,type,reasons){
  const head=`請處理仙加味貼文AI修正任務。\n貼文ID：${post.id}\n原標題：${post.title||''}\n原文案：${post.copy||post.headline||''}\n問題：${reasons.join('；')}\n\n${BRAND_RULES}`;
  if(type==='copy') return `${head}\n\n只重寫文案，不改產品事實。輸出：新標題、新正文、建議分類、圖片情境摘要。繁體中文。`;
  if(type==='image') return `${head}\n\n只重做圖片。輸出一份完整圖片生成指令：1:1繁體中文社群主圖，必須是一體成形的單一完整情境，禁止拼湊、剪貼、貼圖、紙偶、浮貼；如有產品，維持正式實物外觀與比例並自然融入場景。並列出16項圖文一致性自檢。`;
  return `${head}\n\n文案與圖片整套重新建立。輸出：新標題、新正文、建議分類、圖片情境摘要、16項圖文一致性自檢、完整圖片生成指令。圖片必須是一體成形的完整單一情境，禁止任何拼湊剪貼感。`;
}

async function createSystemJob(env,post,type,reasons,source='auto-scan'){
  const reason=reasons.join('；').slice(0,1200);
  const duplicate=await existingActive(env,post.id,type,reason);
  if(duplicate) return{created:false,job:duplicate};
  const id=`AI-${crypto.randomUUID()}`,now=nowIso(),prompt=buildPrompt(post,type,reasons);
  await env.DB.prepare('INSERT INTO ai_handoff_jobs(id,post_id,job_type,reason,prompt,status,source,result_note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,post.id,type,reason,prompt,'waiting_chatgpt',source,'','system',now,now).run();
  return{created:true,id};
}

export async function scanPostsForAiJobs(env,{source='auto-scan'}={}){
  await ensureAiSchema(env);
  const result=await env.DB.prepare("SELECT * FROM social_posts WHERE status NOT IN ('published','archived') ORDER BY datetime(updated_at) DESC").all();
  let scanned=0,created=0,cleanCount=0;
  for(const post of result.results||[]){
    scanned+=1;
    const issues=detectIssues(post);
    if(!issues.copy.length&&!issues.visual.length){cleanCount+=1;continue;}
    const type=issues.copy.length&&issues.visual.length?'all':issues.copy.length?'copy':'image';
    const reasons=[...issues.copy,...issues.visual];
    const out=await createSystemJob(env,post,type,reasons,source);
    if(out.created)created+=1;
  }
  return{ok:true,scanned,created,clean:cleanCount,checked_at:nowIso()};
}
