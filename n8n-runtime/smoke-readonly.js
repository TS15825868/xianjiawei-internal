const TIMEOUT_MS = 90000;

async function fetchResource(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, ok: res.ok, body };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  const errors = [];
  const lineUrl = process.env.XJW_LINE_HEALTH_URL || 'https://ts-line.onrender.com/healthz';

  const line = await fetchResource(lineUrl);
  if (!(line.status >= 200 && line.status < 300) || line.body?.ok === false) {
    errors.push(`LINE healthz 異常：HTTP ${line.status}`);
  }

  const master = await fetchResource('https://ts15825868.github.io/xianjiawei/public-product-master.json');
  const m = master.body || {};
  const expected = ['guilu-gao','guilu-drink-30','guilu-drink-180','guilu-tangkuai','guilu-jiao','luerong-fen'];
  const ids = Array.isArray(m.products) ? m.products.map((p) => p.id) : [];
  if (!master.ok) errors.push(`產品母資料 HTTP ${master.status}`);
  if (m.authority !== 'user-confirmed-current') errors.push('產品母資料 authority 錯誤');
  if (Number(m.productCount) !== 6) errors.push('產品母資料公開產品數不是 6');
  if (JSON.stringify(ids) !== JSON.stringify(expected)) errors.push('產品母資料 ID／順序不一致');
  if (ids.includes('qixuan-guilu-drink-powder')) errors.push('柒玄茶被錯誤公開');
  const p30 = Array.isArray(m.products) ? m.products.find((p) => p.id === 'guilu-drink-30') : null;
  if (!Array.isArray(p30?.usage) || !p30.usage.some((x) => String(x).includes('每日 1–2 罐'))) {
    errors.push('30cc 使用資料不是每日 1–2 罐');
  }

  const ai = await fetchResource('https://ts15825868.github.io/xianjiawei/ai-answers.json');
  if (!ai.ok) errors.push(`AI answers HTTP ${ai.status}`);
  if (ai.body?.sourceOfTruth !== 'public-product-master.json') errors.push('AI answers 未指向產品母資料');

  const geo = await fetchResource('https://ts15825868.github.io/xianjiawei/geo-data.json');
  if (!geo.ok) errors.push(`GEO data HTTP ${geo.status}`);
  const graph = Array.isArray(geo.body?.['@graph']) ? geo.body['@graph'] : [];
  const org = graph.find((x) => x?.['@type'] === 'Organization');
  const list = graph.find((x) => x?.['@type'] === 'ItemList');
  if (org?.name !== '仙加味') errors.push('GEO Organization 品牌錯誤');
  if (Number(list?.numberOfItems) !== 6) errors.push('GEO ItemList 不是 6 項');

  // 直接驗證 GitHub Pages 正式公開站，不依賴匿名 GitHub Actions API，避免 rate-limit 403。
  const pages = await fetchResource('https://ts15825868.github.io/xianjiawei/sitemap.xml');
  if (!pages.ok || typeof pages.body !== 'string' || !pages.body.includes('<urlset')) {
    errors.push(`官網 GitHub Pages sitemap 異常：HTTP ${pages.status}`);
  }

  const result = {
    ok: errors.length === 0,
    checkedAt: new Date().toISOString(),
    line: { status: line.status, bodyOk: line.body?.ok },
    master: { status: master.status, version: m.version, productCount: m.productCount },
    ai: { status: ai.status, version: ai.body?.version },
    geo: { status: geo.status, dateModified: graph.find((x) => x?.['@type'] === 'Dataset')?.dateModified || null },
    githubPages: { status: pages.status, sitemapOk: pages.ok && typeof pages.body === 'string' && pages.body.includes('<urlset') },
    errors,
  };

  console.log('[readonly-smoke]', JSON.stringify(result));
  if (errors.length) process.exit(1);
})().catch((error) => {
  console.error('[readonly-smoke] fatal', error?.stack || error);
  process.exit(1);
});
