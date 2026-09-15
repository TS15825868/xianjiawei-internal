import fs from 'node:fs';

const BANK_PATH=new URL('../assets/data/social-conversation-topic-bank-current.json',import.meta.url);
const bank=JSON.parse(fs.readFileSync(BANK_PATH,'utf8'));
const SEED_CREATED_BY=process.env.XJW_CONTENT_SEED_CREATED_BY||'tung314069@gmail.com';
const rows=Array.isArray(bank?.topics)?bank.topics:[];
const BLOCKED=['台興山產','柒玄茶','龜鹿調飲粉','治療','治癒','療效','改善疾病','預防疾病','保證功效','保證改善','藥到病除','關節','卡卡','疲勞','精神不濟','補氣','生津','膠原蛋白','鈣質'];
const ALLOWED_PLATFORMS=new Set(['Facebook','Instagram','Threads','LINE OA','LINE OA 廣播','LINE VOOM','Google 商家']);
const sqlString=value=>`'${String(value??'').replaceAll("'","''")}'`;
const jsonString=value=>sqlString(JSON.stringify(value??[]));
const safeId=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');

if(!rows.length)throw new Error('目前輕鬆互動題庫沒有可建立的題目');

const seen=new Set();
for(const topic of rows){
  const slug=safeId(topic.id);
  if(!slug)throw new Error(`題目缺少合法 id：${topic.title||'unknown'}`);
  if(seen.has(slug))throw new Error(`題目 id 重複：${slug}`);
  seen.add(slug);
  const publicText=[topic.title,topic.headline,topic.copy,topic.imageAlt,topic.category].join(' ');
  const hit=BLOCKED.find(term=>publicText.includes(term));
  if(hit)throw new Error(`題目 ${slug} 含目前不得公開字詞：${hit}`);
  if(!String(topic.copy||'').trim())throw new Error(`題目 ${slug} 缺少文案`);
  if(String(topic.imageUrl||'').trim())throw new Error(`題目 ${slug} 不應預綁未審核圖片`);
  if(topic.seedToReview!==false)throw new Error(`題目 ${slug} 必須維持 seedToReview=false`);
}

const statements=[];
statements.push(`CREATE TABLE IF NOT EXISTS social_posts(
  id TEXT PRIMARY KEY,title TEXT NOT NULL DEFAULT '',headline TEXT NOT NULL DEFAULT '',copy TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT '日常節奏',
  platforms_json TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL DEFAULT 'draft',scheduled_at TEXT,proposed_scheduled_at TEXT,approved_by TEXT,approved_at TEXT,published_at TEXT,
  image_url TEXT NOT NULL DEFAULT '',image_alt TEXT NOT NULL DEFAULT '',image_source TEXT NOT NULL DEFAULT '官方素材',image_approved INTEGER NOT NULL DEFAULT 0,
  image_width INTEGER NOT NULL DEFAULT 0,image_height INTEGER NOT NULL DEFAULT 0,image_bytes INTEGER NOT NULL DEFAULT 0,image_quality_status TEXT NOT NULL DEFAULT 'unknown',
  created_by TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);
statements.push(`CREATE TABLE IF NOT EXISTS audit_logs(
  id TEXT PRIMARY KEY,actor_email TEXT NOT NULL DEFAULT '',action TEXT NOT NULL DEFAULT '',entity_type TEXT NOT NULL DEFAULT '',entity_id TEXT NOT NULL DEFAULT '',before_json TEXT,after_json TEXT,ip TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);

for(const topic of rows){
  const slug=safeId(topic.id),postId=`XJW-CONV-${slug}`,auditId=`AUD-CONV-DRAFT-${slug}`;
  const platforms=[...new Set([...(Array.isArray(topic.platforms)?topic.platforms:[]),'Threads'])].filter(name=>ALLOWED_PLATFORMS.has(String(name||'').trim()));
  if(!platforms.includes('Facebook'))platforms.unshift('Facebook');
  if(!platforms.includes('Instagram'))platforms.splice(1,0,'Instagram');
  const source=`待依文案製作專屬正式情境圖|題庫:${slug}|季節:${topic.season||'evergreen'}|版本:${bank.version||''}`;
  const title=sqlString(topic.title),copy=sqlString(topic.copy),id=sqlString(postId);
  statements.push(`INSERT INTO social_posts(
    id,title,headline,copy,category,platforms_json,status,scheduled_at,proposed_scheduled_at,approved_by,approved_at,published_at,
    image_url,image_alt,image_source,image_approved,image_width,image_height,image_bytes,image_quality_status,created_by,created_at,updated_at
  )
  SELECT ${id},${title},${sqlString(topic.headline)},${copy},${sqlString(topic.category||'生活聊天')},${jsonString(platforms)},'draft',NULL,NULL,NULL,NULL,NULL,
    '',${sqlString(topic.imageAlt||topic.title)},${sqlString(source)},0,0,0,0,'unknown',${sqlString(SEED_CREATED_BY)},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
  WHERE NOT EXISTS(
    SELECT 1 FROM social_posts existing
    WHERE existing.id<>${id}
      AND existing.status IN ('published','scheduled','approved','manual_required')
      AND (trim(existing.title)=trim(${title}) OR trim(existing.copy)=trim(${copy}))
  )
  ON CONFLICT(id) DO NOTHING;`);
  statements.push(`UPDATE social_posts SET
    title=${title},headline=${sqlString(topic.headline)},copy=${copy},category=${sqlString(topic.category||'生活聊天')},platforms_json=${jsonString(platforms)},
    image_alt=CASE WHEN trim(image_alt)='' THEN ${sqlString(topic.imageAlt||topic.title)} ELSE image_alt END,
    image_source=CASE WHEN trim(image_url)='' THEN ${sqlString(source)} ELSE image_source END,
    updated_at=CURRENT_TIMESTAMP
  WHERE id=${id} AND status='draft'
    AND NOT EXISTS(
      SELECT 1 FROM social_posts existing
      WHERE existing.id<>${id}
        AND existing.status IN ('published','scheduled','approved','manual_required')
        AND (trim(existing.title)=trim(${title}) OR trim(existing.copy)=trim(${copy}))
    )
    AND (title<>${title} OR headline<>${sqlString(topic.headline)} OR copy<>${copy} OR category<>${sqlString(topic.category||'生活聊天')} OR platforms_json<>${jsonString(platforms)});`);
  statements.push(`INSERT OR IGNORE INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip)
    SELECT ${sqlString(auditId)},'github-actions-conversation-bank','輕鬆互動母庫建立可見草稿','貼文',${id},NULL,${sqlString(JSON.stringify({topic_id:slug,bank_version:bank.version||'',status:'draft',threads:true,image_required:true}))},''
    WHERE EXISTS(SELECT 1 FROM social_posts WHERE id=${id});`);
}

statements.push(`SELECT status,COUNT(*) AS count FROM social_posts WHERE id LIKE 'XJW-CONV-%' GROUP BY status ORDER BY status;`);
statements.push(`SELECT COUNT(*) AS threads_count FROM social_posts WHERE id LIKE 'XJW-CONV-%' AND platforms_json LIKE '%Threads%';`);
process.stdout.write(statements.join('\n\n')+'\n');
console.error(`PASS: ${rows.length} 個輕鬆互動／季節題目已準備為可見草稿；既有正式已發布內容不覆蓋，全部加入 Threads，未完成圖片不送審、不排程、不發布。`);
