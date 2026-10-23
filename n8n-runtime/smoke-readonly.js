const TIMEOUT_MS = 90000;

async function fetchResource(url, headers = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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

// Transport failures must not prevent checks of independently hosted backups.
// Return only a generic reason; raw TLS/network errors can include private data.
async function observeResource(url, headers = {}, timeoutMs = TIMEOUT_MS) {
  try { return await fetchResource(url, headers, timeoutMs); }
  catch { return { status: 0, ok: false, body: null, transportFailure: true }; }
}

(async () => {
  const errors = [];
  const lineUrl = process.env.XJW_LINE_HEALTH_URL || 'https://ts-line.onrender.com/healthz';

  const receiptEndpoints = [
    { key: 'supabase', label: 'Supabase Meta 收件備援',
      url: 'https://iphexhvjhsmelbgwzhhr.supabase.co/functions/v1/xjw-social-receipt',
      allowed: [{ status: 503, code: 'receipt_disabled' }, { status: 400, code: 'verification_rejected' }] },
    { key: 'cloudflare', label: 'Cloudflare Meta 收件備援',
      url: 'https://xianjiawei-social-receipt-fallback.tung314069.workers.dev/',
      allowed: [{ status: 503, code: 'disabled' }, { status: 503, code: 'verification_required' },
        { status: 400, code: 'invalid_event' }] }
  ];

  // Start all seven read-only GETs together. A Render cold-start or endpoint
  // timeout cannot hide the Supabase/Cloudflare fail-closed status. The maximum
  // wait is bounded by the slowest GET, not the sum of seven independent waits.
  const [line, master, ai, geo, pages, ...receiptChecks] = await Promise.all([
    observeResource(lineUrl),
    observeResource('https://ts15825868.github.io/xianjiawei/public-product-master.json'),
    observeResource('https://ts15825868.github.io/xianjiawei/ai-answers.json'),
    observeResource('https://ts15825868.github.io/xianjiawei/geo-data.json'),
    observeResource('https://ts15825868.github.io/xianjiawei/sitemap.xml'),
    ...receiptEndpoints.map(item => observeResource(item.url, {}, 25000))
  ]);
  // A 200 HTML/login page or missing ok flag is NOT a healthy LINE API.
  if (!(line.status >= 200 && line.status < 300) || line.body?.ok !== true) {
    errors.push(`LINE healthz 異常：HTTP ${line.status}，ok 未明確為 true`);
  }
  if (line.body?.credentialsConfigured !== true) {
    errors.push('LINE OA 已配置憑證狀態未通過');
  }
  if (line.body?.orderOpen !== true) {
    errors.push('LINE OA 接單功能未開啟');
  }

  const m = master.body || {};
  const expected = ['guilu-gao','guilu-drink-30','guilu-drink-180','luerong-fen'];
  const ids = Array.isArray(m.products) ? m.products.map((p) => p.id) : [];
  if (!master.ok) errors.push(`產品母資料 HTTP ${master.status}`);
  if (m.brand?.name !== '仙加味') errors.push('公開產品母資料品牌錯誤');
  if (m.authority !== 'user-confirmed-current') errors.push('產品母資料 authority 錯誤');
  if (!ids.length || Number(m.productCount) !== ids.length || new Set(ids).size !== ids.length || ids.some(id => !id)) errors.push('產品母資料 productCount／ID 不一致');
  if (!expected.every(id => ids.includes(id))) errors.push('產品母資料缺少核心產品');
  if (Number(line.body?.productCount) !== ids.length) errors.push('LINE 產品筆數與公開母資料不一致');
  const p30 = Array.isArray(m.products) ? m.products.find((p) => p.id === 'guilu-drink-30') : null;
  if (p30 && (!Array.isArray(p30.usage) || !p30.usage.some(x => /每日\s*1\s*[～–-]\s*2\s*罐/.test(String(x))))) errors.push('30cc 每日 1～2 罐使用資料不一致');

  if (!ai.ok) errors.push(`AI answers HTTP ${ai.status}`);
  if (ai.body?.sourceOfTruth !== 'public-product-master.json') errors.push('AI answers 未指向產品母資料');

  if (!geo.ok) errors.push(`GEO data HTTP ${geo.status}`);
  const graph = Array.isArray(geo.body?.['@graph']) ? geo.body['@graph'] : [];
  const org = graph.find((x) => x?.['@type'] === 'Organization');
  const list = graph.find((x) => x?.['@type'] === 'ItemList');
  if (org?.name !== '仙加味') errors.push('GEO Organization 品牌錯誤');
  if (Number(list?.numberOfItems) !== ids.length) errors.push('GEO ItemList 與最新公開產品數不一致');

  // 直接驗證 GitHub Pages 正式公開站，不依賴匿名 GitHub Actions API，避免 rate-limit 403。
  if (!pages.ok || typeof pages.body !== 'string' || !pages.body.includes('<urlset')) {
    errors.push(`官網 GitHub Pages sitemap 異常：HTTP ${pages.status}`);
  }

  // A disabled Meta receiver is intentionally NOT customer-response-ready.
  // The safety check only proves uncredentialed GET cannot be accepted or sent.
  // Both endpoints are public; this probe never carries tokens, user payloads
  // or invokes any POST, and does not depend on Render's wake-up cycle.
  const receipts = {};
  for (const [index, item] of receiptEndpoints.entries()) {
    const observation = receiptChecks[index];
    const safe = observation.body?.sent === false && observation.body?.accepted !== true &&
      item.allowed.some(expected => observation.status === expected.status && observation.body?.code === expected.code);
    receipts[item.key] = {
      status: observation.status, code: typeof observation.body?.code === 'string' ? observation.body.code : null,
      safelyBlocked: safe, transportFailure: observation.transportFailure === true, liveSendingVerified: false
    };
    if (!safe) errors.push(`${item.label} 未通過無憑證唯讀拒絕驗證：HTTP ${observation.status}`);
  }

  const result = {
    ok: errors.length === 0,
    checkedAt: new Date().toISOString(),
    line: { status: line.status, bodyOk: line.body?.ok, transportFailure: line.transportFailure === true },
    master: { status: master.status, version: m.version, productCount: m.productCount },
    ai: { status: ai.status, version: ai.body?.version },
    geo: { status: geo.status, dateModified: graph.find((x) => x?.['@type'] === 'Dataset')?.dateModified || null },
    githubPages: { status: pages.status, sitemapOk: pages.ok && typeof pages.body === 'string' && pages.body.includes('<urlset'), transportFailure: pages.transportFailure === true },
    metaReceipts: receipts,
    errors,
  };

  console.log('[readonly-smoke]', JSON.stringify(result));
  if (errors.length) process.exit(1);
})().catch((error) => {
  console.error('[readonly-smoke] fatal', error?.stack || error);
  process.exit(1);
});

