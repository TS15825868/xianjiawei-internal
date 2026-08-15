from pathlib import Path
import json,re


def loadj(path): return json.loads(Path(path).read_text())
def savej(path,obj,pretty=True):
    Path(path).write_text(json.dumps(obj,ensure_ascii=False,indent=2 if pretty else None,separators=None if pretty else (',',':'))+'\n')

public_repls=[
    ('正式規格為','規格為'),('正式規格是','規格是'),('正式規格','規格'),
    ('目前正式資訊','相關資訊'),('正式產品保存資訊','產品保存方式'),('正式保存資訊','保存方式'),
    ('正式產品資訊','產品資訊'),('依正式使用方式','依使用方式'),('正式使用方式','使用方式'),
    ('正式包裝','包裝'),('正式比例','原有比例'),('正式外觀','產品外觀'),('正式呈現','產品外觀'),
    ('目前使用方式為','使用方式為'),('網站同款Q版小老闆','仙加味小老闆'),('網站同款 Q 版小老闆','仙加味小老闆')
]
def clean_public(s):
    s=str(s or '')
    for a,b in public_repls:s=s.replace(a,b)
    s=re.sub(r'\n{3,}','\n\n',s).strip()
    return s
def clean_post(p):
    for k in ('title','headline','copy','imageAlt'):
        if k in p:p[k]=clean_public(p[k])
    return p

remove_by_file={
    'assets/data/social-batch-20260815-01.json':{'brand-from-wanhua','product-tangkuai'},
    'assets/data/social-batch-20260815-02.json':{'real-product-image-policy'},
    'assets/data/social-batch-20260815-03.json':{'one-eighty-pouch-detail'},
}
batches={}
for path in sorted(Path('assets/data').glob('social-batch-*.json')):
    key=str(path); data=loadj(path); remove=remove_by_file.get(key,set())
    data['posts']=[clean_post(p) for p in data.get('posts',[]) if p.get('id') not in remove]
    data['version']=re.sub(r'-v1$','-v2-customer-clean',str(data.get('version','')))
    batches[key]=data

def edit_batch(path,post_id,**changes):
    data=batches[path]
    for p in data.get('posts',[]):
        if p.get('id')==post_id:
            p.update(changes);return
    raise SystemExit(f'missing {post_id} in {path}')

edit_batch('assets/data/social-batch-20260815-01.json','product-drink-30',
  headline='30cc／罐（小玻璃罐），輕巧即飲，外出也方便',
  copy='龜鹿飲30cc玻璃罐規格為30cc／罐（小玻璃罐），外觀為小玻璃裸罐、無貼紙。每日 1-2罐，飲用時間可依個人使用習慣與作息安排；可直接飲用，也可隔水加熱或溫熱後飲用。\n\n龜鹿飲為接單後製作，約5～7個工作天完成並安排出貨。\n\n仙加味｜補養，是一種節奏。')
edit_batch('assets/data/social-batch-20260815-01.json','product-drink-180',
  headline='180cc／包（鋁袋），狹長直立包裝，居家或工作空檔都方便',
  copy='龜鹿飲180cc鋁袋規格為180cc／包（鋁袋），包裝為狹長直立鋁袋。每日一包，飲用時間可依個人使用習慣與作息安排；可直接飲用，也可隔水加熱或溫熱後飲用。\n\n龜鹿飲為接單後製作，約5～7個工作天完成並安排出貨。\n\n仙加味｜補養，是一種節奏。')
edit_batch('assets/data/social-batch-20260815-02.json','drink-30-outside',
  copy='龜鹿飲30cc玻璃罐是30cc／罐（小玻璃罐），外觀為裸罐、無貼紙。小份量更容易配合外出、工作空檔或自己的日常安排。\n\n每日 1-2罐，飲用時間可依個人使用習慣與作息安排。\n\n仙加味｜補養，是一種節奏。')
edit_batch('assets/data/social-batch-20260815-02.json','drink-180-home',
  copy='龜鹿飲180cc鋁袋規格為180cc／包（鋁袋），包裝為狹長直立鋁袋。適合想要完整一包份量、在家或工作空檔安排的人。\n\n每日一包，飲用時間可依個人使用習慣與作息安排；可直接飲用，也可隔水加熱或溫熱後飲用。\n\n仙加味｜補養，是一種節奏。')
edit_batch('assets/data/social-batch-20260815-03.json','thirty-cc-package-detail',
  title='30cc小玻璃罐，輕巧的即飲選擇。',
  headline='30cc／罐，小玻璃裸罐、無貼紙，外出攜帶也方便',
  copy='龜鹿飲30cc規格為30cc／罐（小玻璃罐），外觀為小玻璃裸罐、無貼紙。輕巧份量適合放進外出、工作空檔或日常隨手飲用的安排。\n\n飲用時間可依個人使用習慣與作息安排。\n\n仙加味｜補養，是一種節奏。')
edit_batch('assets/data/social-batch-20260815-03.json','warm-not-iced',
  copy='龜鹿飲不需要綁在固定白天時段。30cc每日 1-2罐，180cc每日一包，飲用時間都可依個人使用習慣與作息安排。\n\n可以直接飲用，也可以隔水加熱或溫熱後飲用；飲用時以避免冰飲為原則。\n\n仙加味｜補養，是一種節奏。')
edit_batch('assets/data/social-batch-20260815-03.json','ask-line-before-order',
  copy='產品型態很多，不需要一次把所有資訊記住。想確認規格、一般使用方式、龜鹿飲試喝、製作交期或下單流程，都可以先私訊仙加味官方LINE。\n\n我們會依你想了解的產品與使用情境，把相關資訊整理清楚，再慢慢選擇。\n\n仙加味｜補養，是一種節奏。')
for path,data in batches.items():savej(path,data,True)

bank_path='assets/data/guilu-content-topic-bank-v20260814.json'; bank=loadj(bank_path)
retire={'craft-time-heat','drink-30-vs-180','soup-block-vs-jiao','wanhua-four-generations','why-spec-clear','guilu-table'}
rewrites={
  'drink30-small-jar':{'copy':'龜鹿飲30cc規格是30cc／罐（小玻璃罐）。外觀為小玻璃裸罐、無貼紙，份量輕巧，方便依外出、工作空檔或日常習慣安排。\n\n仙加味｜補養，是一種節奏。'},
  'drink30-work-break':{'copy':'30cc小玻璃罐屬即飲型態，份量輕巧、打開即可飲用。若想溫熱飲用，也可以隔水加熱或溫熱後飲用，依自己的作息安排即可。\n\n仙加味｜補養，是一種節奏。'},
  'drink30-warm':{'copy':'龜鹿飲30cc可以開罐直接飲用，也能隔水加熱或溫熱後飲用。每日 1-2罐，飲用時間可依個人使用習慣與作息安排。\n\n仙加味｜補養，是一種節奏。'},
  'drink30-storage':{'headline':'未開封避免高溫與日光直射，開罐後儘速飲用','copy':'未開封時請避免高溫與日光直射；開罐後建議儘速飲用完畢。30cc為小玻璃罐，平時也請留意罐身與罐蓋完整。\n\n仙加味｜補養，是一種節奏。'},
  'drink180-pouch':{'copy':'龜鹿飲180cc規格為180cc／包，使用狹長直立鋁袋。份量較完整，可從居家、工作空檔或攜帶習慣來安排。\n\n仙加味｜補養，是一種節奏。'},
  'drink180-home':{'copy':'180cc鋁袋同樣屬即飲型態，可以從一包的容量、居家安排與溫熱飲用來理解。每日一包，飲用時間可依個人使用習慣與作息安排。\n\n仙加味｜補養，是一種節奏。'},
  'drink180-warm':{'headline':'隔水加熱或溫熱飲用，依自己的日常習慣安排','copy':'龜鹿飲180cc可以隔水加熱或溫熱後飲用，也可直接飲用。飲用時間可依個人使用習慣與作息安排。\n\n仙加味｜補養，是一種節奏。'},
  'drink180-storage':{'headline':'未開封依包裝標示保存，開封後儘速飲用','copy':'180cc鋁袋未開封時，請依包裝標示的保存方式放置；開封後建議儘速飲用完畢。平時避免高溫與日光直射，也請保持鋁袋完整。\n\n仙加味｜補養，是一種節奏。'},
  'gao-100g':{'copy':'龜鹿膏規格為100g／罐。可以先從罐裝型態、每次取用方式，以及直接食用或搭配溫熱水的日常安排開始認識。\n\n想了解完整成分、保存與使用方式，可查看產品資訊或私訊官方LINE。\n\n仙加味｜補養，是一種節奏。'},
  'gao-warm-water':{'copy':'龜鹿膏可以直接取用，也能以約100～300mL溫熱水化開。重點是選一種自己容易安排的方式，食用時間可依個人使用習慣與作息安排。\n\n仙加味｜補養，是一種節奏。'},
  'gao-storage':{'copy':'龜鹿膏未開封時置於陰涼處保存；開罐後密封冷藏。每次使用乾淨湯匙取用，並保持罐口清潔。\n\n仙加味｜補養，是一種節奏。'},
  'tangkuai-75g':{'copy':'龜鹿湯塊規格為75g （2兩）／盒｜8塊裝，每塊約9.375g。把總重量、盒裝數量與每塊約重一起看，更容易理解每次取用的份量。\n\n仙加味｜補養，是一種節奏。'},
  'tangkuai-soup':{'copy':'龜鹿湯塊可以從家常燉湯情境認識，例如雞湯或排骨湯。也可以搭配熱水或保溫壺，依自己的飲食習慣安排。\n\n仙加味｜補養，是一種節奏。'},
  'tangkuai-hot-water':{'copy':'龜鹿湯塊除了料理，也可以搭配熱水或保溫壺。規格為75g （2兩）／盒｜8塊裝，每塊約9.375g，可依自己的日常習慣安排使用方式。\n\n仙加味｜補養，是一種節奏。'},
  'jiao-600g':{'copy':'龜鹿膠規格為600g （1斤）／盒｜32塊裝，每塊約18.75 g。大盒裝與75g龜鹿湯塊不同，選擇前可先確認盒裝份量與使用方式。\n\n仙加味｜補養，是一種節奏。'},
  'jiao-family':{'copy':'龜鹿膠是600g （1斤）／盒｜32塊裝，每塊約18.75 g。可以從家庭料理、分塊取用與固定備用的角度理解，先看盒裝份量與使用方式。\n\n仙加味｜補養，是一種節奏。'},
  'jiao-hot-water':{'headline':'熱水化開或加入家常湯品，依自己的日常習慣選擇'},
}
for t in bank.get('topics',[]):
    for k in ('title','headline','copy','imageAlt'):
        if k in t:t[k]=clean_public(t[k])
    if t.get('id') in retire:t['queueEnabled']=False
    if t.get('id') in rewrites:t.update(rewrites[t['id']])
bank['version']='2026-08-15-guilu-publishing-v4-customer-clean-dedupe'
savej(bank_path,bank,False)

internal_terms=['待審核','人工審核','16項','核准','不自動排程','不自動發布','貼文中心','發布中心','ERP','products-v3','守門員','母庫','資料庫','D1','Worker','GitHub','Workflow','候選圖','回填','重新生成','ChatGPT','不重畫','圖片呈現時','看圖片時','產品圖片','版面效果','產品本體','誤畫','正式原圖','正式產品原圖','正式比例','正式包裝','目前正式','最新確認','此類貼文需確認','舊的300g','舊版','debug','TODO','placeholder','假資料']
leaks=[]
for t in bank.get('topics',[]):
    if t.get('queueEnabled') is False:continue
    public=' '.join(str(t.get(k) or '') for k in ('title','headline','copy','category'))
    hits=[x for x in internal_terms if x.lower() in public.lower()]
    if hits:leaks.append((t.get('id'),hits,public[:220]))
for path,data in batches.items():
    for p in data.get('posts',[]):
        public=' '.join(str(p.get(k) or '') for k in ('title','headline','copy','category'))
        hits=[x for x in internal_terms if x.lower() in public.lower()]
        if hits:leaks.append((f'{path}/{p.get("id")}',hits,public[:220]))
if leaks:
    print('PUBLIC COPY LEAKS:')
    for x in leaks:print(x)
    raise SystemExit(2)

for path in ('tools/build-guilu-review-seed.mjs','tools/build-guilu-draft-seed.mjs'):
    text=Path(path).read_text()
    text=text.replace("bank.topics.filter(topic => topic?.seedToReview === true)","bank.topics.filter(topic => topic?.queueEnabled !== false && topic?.seedToReview === true)")
    text=text.replace("bank.topics.filter(topic => topic?.seedToReview !== true && topic?.imageMode === 'context_required')","bank.topics.filter(topic => topic?.queueEnabled !== false && topic?.seedToReview !== true && topic?.imageMode === 'context_required')")
    if 'CUSTOMER_INTERNAL' not in text:
        insert="const CUSTOMER_INTERNAL=['待審核','人工審核','16項','核准','不自動排程','不自動發布','貼文中心','發布中心','ERP','products-v3','守門員','母庫','資料庫','D1','Worker','GitHub','Workflow','候選圖','回填','重新生成','ChatGPT','不重畫','圖片呈現時','看圖片時','產品圖片','版面效果','產品本體','誤畫','正式原圖','正式產品原圖','正式比例','正式包裝','目前正式','最新確認','此類貼文需確認','舊的300g','舊版','debug','TODO','placeholder','假資料'];\n"
        text=text.replace('const ids = new Set();',insert+'const ids = new Set();',1)
        text=text.replace('const hit = BLOCKED.find(term => text.includes(term));','const hit = [...BLOCKED,...CUSTOMER_INTERNAL].find(term => text.includes(term));')
    Path(path).write_text(text)

p=Path('tools/build-social-batches-review-seed.mjs');text=p.read_text()
if 'CUSTOMER_INTERNAL' not in text:
    text=text.replace("const ALLOWED_PLATFORMS = new Set", "const CUSTOMER_INTERNAL=['待審核','人工審核','16項','核准','不自動排程','不自動發布','貼文中心','發布中心','ERP','products-v3','守門員','母庫','資料庫','D1','Worker','GitHub','Workflow','候選圖','回填','重新生成','ChatGPT','不重畫','圖片呈現時','看圖片時','產品圖片','版面效果','產品本體','誤畫','正式原圖','正式產品原圖','正式比例','正式包裝','目前正式','最新確認','此類貼文需確認','舊的300g','舊版','debug','TODO','placeholder','假資料'];\nconst normPublic=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/仙加味[｜|]?補養，是一種節奏。?/g,'').replace(/[\\s\\W_]+/gu,'');\nconst bigrams=s=>{const out=new Map();for(let i=0;i<s.length-1;i++){const k=s.slice(i,i+2);out.set(k,(out.get(k)||0)+1)}return out};\nconst dice=(a,b)=>{if(!a||!b)return 0;if(a===b)return 1;const A=bigrams(a),B=bigrams(b);let hit=0,ai=0,bi=0;for(const n of A.values())ai+=n;for(const n of B.values())bi+=n;for(const [k,n] of A)hit+=Math.min(n,B.get(k)||0);return ai+bi?2*hit/(ai+bi):0};\nconst qualitySeen=[];\nconst ALLOWED_PLATFORMS = new Set")
    text=text.replace("    const hit = BLOCKED.find(term => text.includes(term));\n    if (hit) throw new Error(`${file}/${slug} 含禁止公開字詞：${hit}`);", "    const hit = BLOCKED.find(term => text.includes(term));\n    if (hit) throw new Error(`${file}/${slug} 含禁止公開字詞：${hit}`);\n    const internalHit=CUSTOMER_INTERNAL.find(term=>text.toLowerCase().includes(term.toLowerCase()));\n    if(internalHit)throw new Error(`${file}/${slug} 含不應公開的內部用語：${internalHit}`);\n    const titleKey=normPublic(post.title),copyKey=normPublic(post.copy);\n    for(const prior of qualitySeen){if(titleKey&&titleKey===prior.titleKey)throw new Error(`${file}/${slug} 標題與既有批次重複：${prior.ref}`);if(copyKey.length>=40&&prior.copyKey.length>=40&&dice(copyKey,prior.copyKey)>=0.90)throw new Error(`${file}/${slug} 文案與既有批次過度相似：${prior.ref}`)}\n    qualitySeen.push({titleKey,copyKey,ref:`${file}/${slug}`});")
p.write_text(text)

p=Path('.github/workflows/seed-guilu-review-queue.yml');text=p.read_text()
text=text.replace("const topics=(bank.topics||[]).filter(Boolean);\n          const review=topics.filter(x=>x.seedToReview===true).length;\n          const draft=topics.filter(x=>x.seedToReview!==true&&x.imageMode==='context_required').length;", "const topics=(bank.topics||[]).filter(Boolean);\n          const activeTopics=topics.filter(x=>x.queueEnabled!==false);\n          const review=activeTopics.filter(x=>x.seedToReview===true).length;\n          const draft=activeTopics.filter(x=>x.seedToReview!==true&&x.imageMode==='context_required').length;")
text=text.replace('`${review} ${draft} ${topics.length} ${social}`','`${review} ${draft} ${activeTopics.length} ${social}`')
p.write_text(text)

p=Path('src/publishing-review-gate-entry.js');text=p.read_text()
if 'CUSTOMER_INTERNAL_TERMS' not in text:
    text=text.replace("const REGENERATION_ROLES=new Set(['owner','admin','content']);", "const REGENERATION_ROLES=new Set(['owner','admin','content']);\nconst CUSTOMER_INTERNAL_TERMS=Object.freeze(['待審核','人工審核','16項','核准','不自動排程','不自動發布','貼文中心','發布中心','ERP','products-v3','守門員','母庫','資料庫','D1','Worker','GitHub','Workflow','候選圖','回填','重新生成','ChatGPT','不重畫','圖片呈現時','看圖片時','產品圖片','版面效果','產品本體','誤畫','正式原圖','正式產品原圖','正式比例','正式包裝','目前正式','最新確認','此類貼文需確認','舊的300g','舊版','debug','TODO','placeholder','假資料']);")
    funcs="function publicNorm(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/仙加味[｜|]?補養，是一種節奏。?/g,'').replace(/[\\s\\W_]+/gu,'')}\nfunction diceSimilarity(a,b){if(!a||!b)return 0;if(a===b)return 1;const grams=s=>{const m=new Map();for(let i=0;i<s.length-1;i++){const k=s.slice(i,i+2);m.set(k,(m.get(k)||0)+1)}return m},A=grams(a),B=grams(b);let ai=0,bi=0,hit=0;for(const n of A.values())ai+=n;for(const n of B.values())bi+=n;for(const [k,n] of A)hit+=Math.min(n,B.get(k)||0);return ai+bi?2*hit/(ai+bi):0}\nfunction customerCopyErrors(row){const text=[row?.title,row?.headline,row?.copy].filter(Boolean).join(' ');const hits=CUSTOMER_INTERNAL_TERMS.filter(term=>text.toLowerCase().includes(term.toLowerCase()));return hits.map(term=>`顧客文案含內部作業用語「${term}」`)}\nasync function duplicatePostErrors(env,row){const title=publicNorm(row?.title),copy=publicNorm(row?.copy);const result=await env.DB.prepare(\"SELECT id,title,copy,status FROM social_posts WHERE id<>? AND status<>'archived'\").bind(row.id).all();const errors=[];for(const other of result.results||[]){const otherTitle=publicNorm(other.title),otherCopy=publicNorm(other.copy);if(title&&title===otherTitle)errors.push(`貼文標題與「${other.title}」重複`);else if(copy.length>=40&&otherCopy.length>=40&&diceSimilarity(copy,otherCopy)>=0.90)errors.push(`貼文內容與「${other.title}」過度相似`)}return[...new Set(errors)]}\n"
    text=text.replace('function productMatchErrors(row){',funcs+'function productMatchErrors(row){',1)
    text=text.replace("if(clean(row?.image_quality_status)==='low')errors.push('圖片解析度不足');return[...new Set(errors)]}","if(clean(row?.image_quality_status)==='low')errors.push('圖片解析度不足');errors.push(...customerCopyErrors(row));return[...new Set(errors)]}")
    text=text.replace("const errors=productMatchErrors(row);if(errors.length)throw new Error(errors.join('；'));const fp=await fingerprint(row)","const errors=productMatchErrors(row);errors.push(...await duplicatePostErrors(env,row));if(errors.length)throw new Error(errors.join('；'));const fp=await fingerprint(row)")
    text=text.replace("const errors=productMatchErrors(row);if(errors.length)return json({error:'正式發布守門：圖文檢查未通過',details:errors},409);return app.fetch(request,env,ctx)","const errors=productMatchErrors(row);errors.push(...await duplicatePostErrors(env,row));if(errors.length)return json({error:'正式發布守門：圖文檢查未通過',details:errors},409);return app.fetch(request,env,ctx)")
    text=text.replace("export { VERSION, REQUIRED_CHECKS, PRODUCT_RULES, REGENERATION_ROLES, productMatchErrors","export { VERSION, REQUIRED_CHECKS, PRODUCT_RULES, REGENERATION_ROLES, CUSTOMER_INTERNAL_TERMS, customerCopyErrors, duplicatePostErrors, productMatchErrors")
p.write_text(text)

p=Path('assets/js/publishing-app-v2.js');text=p.read_text()
if 'CUSTOMER_INTERNAL_TERMS' not in text:
    text=text.replace('const PAGE_SIZE=18;',"const PAGE_SIZE=18;\nconst CUSTOMER_INTERNAL_TERMS=['待審核','人工審核','16項','核准','不自動排程','不自動發布','貼文中心','發布中心','ERP','products-v3','守門員','母庫','資料庫','D1','Worker','GitHub','Workflow','候選圖','回填','重新生成','ChatGPT','不重畫','圖片呈現時','看圖片時','產品圖片','版面效果','產品本體','誤畫','正式原圖','正式產品原圖','正式比例','正式包裝','目前正式','最新確認','此類貼文需確認','舊的300g','舊版','debug','TODO','placeholder','假資料'];")
    text=text.replace("  const multiProductImage=mentioned.length>=2&&['六項','全系列','產品總覽','products-all','all-products','全品項','產品合照','產品情境圖'].some(k=>image.includes(norm(k)));","  const multiProductImage=mentioned.length>=2&&['六項','全系列','產品總覽','products-all','all-products','全品項','產品合照','產品情境圖'].some(k=>image.includes(norm(k)));\n  const internalHit=CUSTOMER_INTERNAL_TERMS.find(term=>[post.title,post.headline,post.copy].filter(Boolean).join(' ').toLowerCase().includes(term.toLowerCase()));")
    text=text.replace("  if(!post.image_url)return{level:'danger',text:'缺少圖片，不能通過審核。'};","  if(internalHit)return{level:'danger',text:`顧客文案含內部作業用語「${internalHit}」，請先改成客戶可直接閱讀的文字。`};\n  if(!post.image_url)return{level:'danger',text:'缺少圖片，不能通過審核。'};")
    text=text.replace('    <div class="xjw-copy">${esc(post.copy||\'尚無文案\')}</div>','    <div class="public-copy-label">客戶實際會看到的文案</div><div class="xjw-copy">${esc(post.copy||\'尚無文案\')}</div>')
    text=text.replace('    <div class="xjw-${a.level}">${esc(a.text)}</div>','    <div class="xjw-${a.level}"><strong>內部檢查（不會發布）</strong><br>${esc(a.text)}</div>')
    text=text.replace("document.documentElement.dataset.publishingRuntime='20260815-standalone-v18-mobile-review-ready';","document.documentElement.dataset.publishingRuntime='20260815-standalone-v19-dedupe-customer-clean';")
p.write_text(text)

p=Path('assets/css/publishing-base.css');text=p.read_text()
if '.public-copy-label' not in text:text+='\n.public-copy-label{margin:12px 0 5px;font-size:12px;font-weight:800;letter-spacing:.04em;color:#667085}.xjw-ok strong,.xjw-warning strong,.xjw-danger strong{color:inherit}\n'
p.write_text(text)

p=Path('publishing.html');text=p.read_text()
text=text.replace('publishing-base.css?v=20260815-app-v2-mobile','publishing-base.css?v=20260815-app-v3-customer-clean')
text=text.replace('publishing-app-v2.js?v=20260815-lean-core-v2-audit','publishing-app-v2.js?v=20260815-lean-core-v3-dedupe')
p.write_text(text)

p=Path('tools/validate-publishing-review-gate.mjs');text=p.read_text();anchor="must(gate.includes('龜鹿湯塊正式規格只有75g'),'龜鹿湯塊75g唯一規格守門缺失');"
extra="\nmust(gate.includes('CUSTOMER_INTERNAL_TERMS'),'正式審核缺少顧客文案內部用語守門');\nmust(gate.includes('duplicatePostErrors'),'正式審核缺少重複貼文守門');\nmust(gate.includes('diceSimilarity'),'重複貼文守門缺少近似文案判斷');\nmust(gate.includes('顧客文案含內部作業用語'),'正式審核缺少可理解的內部文字錯誤訊息');"
if '正式審核缺少顧客文案內部用語守門' not in text:text=text.replace(anchor,anchor+extra,1)
p.write_text(text)

p=Path('tools/validate-publishing-app-contract.mjs');text=p.read_text();anchor="if(!js.includes('setButtonBusy'))throw new Error('操作按鈕必須提供處理中狀態');"
extra="\nif(!js.includes('內部檢查（不會發布）')||!js.includes('客戶實際會看到的文案'))throw new Error('貼文卡片必須清楚區分顧客文案與內部檢查');\nif(!js.includes('CUSTOMER_INTERNAL_TERMS'))throw new Error('貼文前端預檢缺少內部用語守門');"
if '貼文卡片必須清楚區分顧客文案與內部檢查' not in text:text=text.replace(anchor,anchor+extra,1)
p.write_text(text)
print('PASS temporary source cleanup script completed')
