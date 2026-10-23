# Instagram official API acceptance — 2026-10-22

This record contains no credentials or customer comment text.

## Verified

- User saved one n8n HTTP Bearer Auth credential, restricted to graph.instagram.com.
- GET /v25.0/me returned username xianjiawei.tw and user_id 17841478328163000. App-scoped id was also returned; it is not substituted for the verified user_id.
- Identity-only n8n workflow GCsknLdrK81wi4qp completed all three nodes.
- Isolated comments workflow PCN2mDcrCj8oDo08 is imported, saved, inactive, GET-only, and saves neither successful nor failed execution payloads.
- Media enumeration identified two posts with nonzero comments_count. Both comments queries returned an empty data array. No actual comment text or brand reply was obtained via this token.
- The summary explicitly separates commentsEndpointResponded=true from commentReadVerified=false. Full history, human attribution, reply capability and E2E remain false.
- A missing credential binding on the comment node was corrected through the n8n UI; the subsequent complete run reached the summary.
- 26 existing policy/storage tests passed again.
- Database inventory: original four workflows retain three active monitors and inactive immediate publishing. Three added read-only/QA workflows remain inactive. One httpBearerAuth credential exists; no PostgreSQL credential exists.
- All xjw_social.platform_control send switches remain false. comment_ledger remains empty.

## Not verified / blockers

- Empty comment data despite nonzero counts requires access-scope/App-mode investigation; no specific cause is established.
- Token expiry and exact granted scopes have not yet been established.
- Facebook and Threads official API identity, tokens and reply receipts remain unverified.
- The private Supabase schema exists, but a least-privilege n8n PostgreSQL credential is not yet bound. No restart/concurrency E2E through n8n is claimed.
- No official webhook, controlled reply receipt, or low-risk auto-send acceptance is complete.
- Meta page observation was restricted by browser credential protection; no bypass or further secret inspection was attempted.

## Preservation

No original workflow, Meta automation, Metricool schedule, posting system, subscription or paid resource was modified. All automatic customer sends remain disabled. No customer test reply was sent. Extra spend: NT$0 / US$0.

## 2026-10-23｜唯讀留言驗收的新測試對象與安全限制

此段是新查核結果，不改寫 2026-10-22 的歷史驗收結論。

- Metricool 已連線品牌 `6889683` 的 Instagram Feed 統計：2026-08-01 至 2026-10-23 共返回 17 篇；2026-09-19 這篇 `https://www.instagram.com/p/Dddia2NFGXr/` 記錄 1 則留言，其餘 16 篇記錄 0。這屬於 **Metricool 歷史彙總**，並非 Meta 官方 API 已讀到留言，也不代表該留言目前仍存在。
- 已更新 GitHub `docs/n8n/07-instagram-comments-readonly.json`：媒體 GET 多讀取 `permalink,timestamp`，只從 Meta 回傳的正整數留言數及 8～32 位數字媒體 ID 中選取貼文；若已知貼文仍在當前 API 頁面並符合條件，優先選取該篇，否則退回其他符合條件的貼文。
- 如果 Meta 對該已知貼文回傳 `comments_count=0`，**不能**使用 Metricool 的歷史 1 則留言補造合格結果。沒有可驗證貼文時直接失敗，不將空清單判定為留言讀取通過。
- GET `/<IG_MEDIA_ID>/comments` 成功且實際取得 `id`、`text` 才可將 `commentReadVerified` 判為 `true`。其餘 `replyPermissionVerified`、`completeHistoryVerified`、`humanAttributionVerified`、`e2eVerified` 一律保留 `false`。
- Meta 官方 Instagram Login 使用 `instagram_business_basic`、`instagram_business_manage_comments` 等權限；Facebook Login 使用不同主機與 scope。**不可混用，也不可從單次空留言結果推測權限一定過期。** 需經受保護 n8n 憑證端點實測及 App 模式／授權核對。官方參考：[Meta Instagram API with Instagram Login](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login)。
- GitHub Actions #39898810971：全部 147 項測試通過，0 失敗。這是 **GitHub 版本的自動測試，不是 n8n 線上流程版本已更新**。目前 Render 還運行舊版 `fb77b8c1`，未重跑執行 139、未修改 n8n 加密憑證、未發送任何留言。
