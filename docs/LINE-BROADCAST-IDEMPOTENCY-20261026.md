# LINE OA 廣播重試防重複安全修復（2026-10-26）

問題：舊程式每次 HTTP 廣播重試都以 `crypto.randomUUID()` 新產生 `X-Line-Retry-Key`。LINE 官方文件明確指出 HTTP 5xx 或 timeout 可能已接受訊息；更換 Retry Key 會造成同一篇貼文的群發訊息重送。

修正：依已核准正式貼文 ID 產生 SHA-256 派生的穩定 RFC4122 v4 格式 UUID，`LINE OA`、`LINE OA 廣播` 共用同一 logical retry key。**第一次請求與每次合法重試都使用相同識別碼**；不存取客戶資料、Channel Secret 或用戶清單，不新增 D1 資料表。

若官方回應 **HTTP 409 且包含 `x-line-accepted-request-id`**，視為先前同一請求已接受並保存原受理 ID；沒有此 Header 的 409 必須停下交人工確認。避免在首次已送出超過 23 小時或首次發送紀錄缺失後再次自動廣播；LINE 官方 Retry Key 有效期僅 24 小時。

此項只修正已有的審核後 LINE 群發可靠性，**不啟用未核准貼文、不新增對客自動客服，也不代表 LINE 2026-10-24 的新版 Render 服務已成功部署**。官方來源： https://developers.line.biz/en/docs/messaging-api/retrying-api-request/ 。
