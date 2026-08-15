import fs from 'node:fs';

function replaceExact(path, before, after) {
  let s = fs.readFileSync(path, 'utf8');
  if (!s.includes(before)) throw new Error(`${path}: expected text not found: ${before.slice(0,120)}`);
  s = s.replace(before, after);
  fs.writeFileSync(path, s, 'utf8');
}

function replaceRegex(path, pattern, after, label) {
  let s = fs.readFileSync(path, 'utf8');
  if (!pattern.test(s)) throw new Error(`${path}: pattern not found: ${label}`);
  s = s.replace(pattern, after);
  fs.writeFileSync(path, s, 'utf8');
}

// Worker: full-library audit + strict one-image-per-post + process scene allowance.
replaceExact('src/publishing-content-audit-entry.js',
  "const VERSION='2026-08-15-content-image-audit-v4-svg-render-integrity';",
  "const VERSION='2026-08-15-content-image-audit-v5-full-library-strict-unique';");
replaceExact('src/publishing-content-audit-entry.js',
  "if(imageUrl&&status!=='published'&&!isFixedReusableImage(imageUrl)){\n    const duplicated=liveRows.filter(other=>other.id!==row.id&&clean(other.status)!=='published'&&normalizedImageUrl(other.image_url)===imageUrl);\n    if(duplicated.length)errors.push(`目前圖片與 ${duplicated.slice(0,3).map(other=>`「${clean(other.title)||other.id}」`).join('、')} 重複使用；請改成符合本篇文案的專屬情境圖`);\n  }",
  "if(imageUrl){\n    const duplicated=liveRows.filter(other=>other.id!==row.id&&normalizedImageUrl(other.image_url)===imageUrl);\n    if(duplicated.length)errors.push(`目前主圖與 ${duplicated.slice(0,3).map(other=>`「${clean(other.title)||other.id}」`).join('、')} 重複使用；每篇貼文都要改成符合該篇文案的專屬圖片`);\n  }");
replaceExact('src/publishing-content-audit-entry.js',
  "if(hasAny(image,['guide-how-to-use'])&&!hasAny([row?.title,row?.headline,row?.category].join(' '),['使用方式','怎麼使用','使用']))errors.push('目前使用「怎麼使用」情境圖，但本篇主題不是使用方式；需改成對應本篇情境');",
  "if(hasAny(image,['guide-how-to-use'])&&!hasAny([row?.title,row?.headline,row?.category].join(' '),['使用方式','怎麼使用','使用','熬製','火候','工序','傳統工藝']))errors.push('目前使用「怎麼使用／工序」情境圖，但本篇主題不是使用方式或工序；需改成對應本篇情境');");
replaceExact('src/publishing-content-audit-entry.js',
  "const errors=[...productErrors(row),...await duplicatePostErrors(env,row),...semanticErrors(row,rows)];",
  "const errors=[...productErrors(row),...await duplicatePostErrors(env,row,rows),...semanticErrors(row,rows)];");
replaceExact('src/publishing-content-audit-entry.js',
  "async function batchAudit(request,env,ctx){\n  const authorization=await authorize(request,env,ctx);if(!authorization.ok)return authorization;\n  const ids=(new URL(request.url).searchParams.get('ids')||'').split(',').map(decodeURIComponent).map(clean).filter(Boolean).slice(0,60);\n  if(!ids.length)return json({version:VERSION,items:[],total:0});\n  const rows=await liveRows(env),byId=new Map(rows.map(row=>[row.id,row])),items=[];\n  for(const id of ids){const row=byId.get(id)||await postRow(env,id);items.push({id,...await auditOne(env,row,rows)});}\n  return json({version:VERSION,total:items.length,problem_count:items.filter(item=>!item.ok).length,items});\n}",
  "async function batchAudit(request,env,ctx){\n  const authorization=await authorize(request,env,ctx);if(!authorization.ok)return authorization;\n  const url=new URL(request.url),all=url.searchParams.get('all')==='1',rows=await liveRows(env);\n  const ids=all?rows.map(row=>row.id):(url.searchParams.get('ids')||'').split(',').map(decodeURIComponent).map(clean).filter(Boolean).slice(0,80);\n  if(!ids.length)return json({version:VERSION,items:[],total:0,scope:all?'all':'selected'});\n  const byId=new Map(rows.map(row=>[row.id,row])),items=[];\n  for(const id of ids){const row=byId.get(id)||await postRow(env,id);items.push({id,...await auditOne(env,row,rows)});}\n  return json({version:VERSION,total:items.length,problem_count:items.filter(item=>!item.ok).length,scope:all?'all':'selected',items});\n}");
replaceExact('src/publishing-content-audit-entry.js',
  "unsafePostingSvgBlocked:true},response.status)",
  "unsafePostingSvgBlocked:true,fullLibraryAudit:true,strictUniqueImagePerPost:true},response.status)");

// Review gate: duplicate copy and duplicate image checks use the already-loaded full row set.
replaceExact('src/publishing-review-gate-entry.js',
  "const VERSION='2026-08-15-publishing-review-gate-v6-semantic-dedupe-weather';",
  "const VERSION='2026-08-15-publishing-review-gate-v7-full-library-strict-unique';");
replaceRegex('src/publishing-review-gate-entry.js',
  /async function duplicatePostErrors\(env,row\)\{[\s\S]*?return\[\.\.\.new Set\(errors\)\]\n\}/,
  `async function duplicatePostErrors(env,row,liveRows=null){\n  const title=publicNorm(row?.title),copy=publicNorm(row?.copy),image=imageNorm(row?.image_url);\n  let others=Array.isArray(liveRows)?liveRows.filter(other=>other.id!==row.id):null;\n  if(!others){const result=await env.DB.prepare("SELECT id,title,copy,status,image_url,image_source FROM social_posts WHERE id<>? AND status<>'archived'").bind(row.id).all();others=result.results||[];}\n  const errors=[];\n  for(const other of others){\n    const otherTitle=publicNorm(other.title),otherCopy=publicNorm(other.copy);\n    if(title&&title===otherTitle)errors.push(\`貼文標題與「\${other.title}」重複\`);\n    else if(copy.length>=40&&otherCopy.length>=40&&diceSimilarity(copy,otherCopy)>=0.90)errors.push(\`貼文內容與「\${other.title}」過度相似\`);\n    const otherImage=imageNorm(other.image_url);\n    if(image&&otherImage&&image===otherImage)errors.push(\`主圖與「\${other.title}」重複；每篇貼文需使用符合各自文案的不同圖片\`);\n  }\n  return[...new Set(errors)]\n}`,
  'duplicatePostErrors');
replaceExact('src/publishing-review-gate-entry.js',
  "龜鹿湯塊正式規格只有75g （2兩）／盒｜8塊裝",
  "龜鹿湯塊正式規格只有75g／盒｜8塊裝");

// Browser UI: chip must represent the whole library, not only the first 18 cards.
replaceExact('assets/js/publishing-review-gate.js',
  "const VERSION='20260815-publishing-review-ui-v5-semantic-audit';",
  "const VERSION='20260815-publishing-review-ui-v6-full-library-audit';");
replaceExact('assets/js/publishing-review-gate.js',
  "chip.innerHTML=`<strong>圖文完整檢查</strong><small>${problem?`${problem}／${total} 篇需修正`:`${total} 篇自動檢查通過`}</small>`;",
  "chip.innerHTML=`<strong>全庫圖文完整檢查</strong><small>${problem?`${problem}／${total} 篇需修正`:`${total} 篇自動檢查通過`}</small>`;");
replaceRegex('assets/js/publishing-review-gate.js',
  /async function auditVisible\(\)\{[\s\S]*?catch\(error\)\{console\.warn\('圖文完整檢查暫時無法載入',error\)\}\n  \}/,
  `async function auditVisible(){\n    const run=++auditRun;\n    const ids=[...document.querySelectorAll('.publish-card [data-post-view],.xjw-row [data-post-view]')].map(node=>node.dataset.postView).filter(Boolean);\n    if(!ids.length)return;\n    try{\n      const [visibleResult,allResult]=await Promise.all([auditIds(ids),api('/posts/content-audit?all=1',{timeout:20000})]);\n      if(run!==auditRun)return;\n      (visibleResult.items||[]).forEach(applyAudit);\n      auditSummary(Number(allResult.problem_count||0),Number(allResult.total||0));\n    }catch(error){console.warn('全庫圖文完整檢查暫時無法載入',error)}\n  }`,
  'auditVisible');
replaceExact('assets/js/publishing-review-gate.js',
  "semanticAudit:true,duplicateImageAudit:true});",
  "semanticAudit:true,duplicateImageAudit:true,fullLibraryAudit:true,strictUniqueImagePerPost:true});");

// Seed builder: do not silently allow repeated product main images anymore.
replaceExact('tools/build-social-batches-review-seed.mjs',
  "if(!row.imageUrl||row.status==='draft'||fixedReusable(row.imageUrl))continue;",
  "if(!row.imageUrl||row.status==='draft')continue;");
replaceExact('tools/build-social-batches-review-seed.mjs',
  "if(/guide-how-to-use/.test(image)&&!/使用方式|怎麼使用|使用/.test(topic))return'使用方式圖不可代替其他日常主題';",
  "if(/guide-how-to-use/.test(image)&&!/使用方式|怎麼使用|使用|熬製|火候|工序|傳統工藝/.test(topic))return'使用方式／工序圖不可代替其他日常主題';");

console.log('PASS: full-library UI/audit/strict-unique source patches applied.');
