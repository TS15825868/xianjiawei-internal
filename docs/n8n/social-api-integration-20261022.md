# 三平台官方串接與正式 PostgreSQL 去重進度

基準 main：d2085237c52e3d351b51a400f6405fb40d4b31b7。

## 已部署至既有資料庫

既有 Supabase xianjiawei 建立獨立私有 schema `xjw_social`，包含 `platform_control`、`comment_ledger`、`reply_ledger`。沒有修改 n8n 系統資料表、建立新服務或新增費用。

- migration：`xjw_social_private_comment_ledger`；可重建 SQL：`comment-ledger-postgres.sql`。
- 建議唯一鍵：平台、帳號、貼文、留言、對話版本。發送保留鍵固定到留言層級，避免新對話版本重送同一留言。
- 保存父留言、串 ID、人工接手、人工／AI 回覆 ID、狀態、發送時間、遠端回覆 ID、錯誤及重試狀態。
- sent 必須同時有平台回覆 ID 及發送時間；unknown 不可標成功。正式發送方法尚未實作／啟用。
- 三平台 enabled/e2e_verified/overlap_verified 均 false；未驗收不能單獨開啟 enabled。
- 三表 RLS 開啟且無客戶端 policy，schema/table 權限從 PUBLIC/anon/authenticated 撤銷。安全顧問的「RLS enabled no policy」資訊項符合本次預設拒絕的用途；未更動既有 n8n 函式警告。
- 在正式資料庫交易測試重複 INSERT ON CONFLICT，第二次取得 0 筆；ROLLBACK 後留言表 0 筆。這證明遠端原子唯一鍵，**不是 n8n 重啟驗收**。
- `comment-pg-store.cjs` 使用注入的 server-side query 及參數綁定。processComment 現在把 event/version 傳給 finish，不用記憶體 key map。尚未綁入 n8n Postgres Credential；不得宣稱已正式接線。
- 程式測試 26 組通過，原 21 組完整保留。

## Meta 官方 App 實際唯讀盤點

沿用「仙加味社群發布系統」（App 1942797873088151），連結既有仙加味商家資產。App 尚未發佈／調整中，不另建 App。

| 平台 | 實際畫面 |
|---|---|
| Facebook | pages_show_list、pages_read_engagement、pages_read_user_content、pages_manage_metadata、pages_manage_engagement 顯示可供測試；權限列表不是 Token 有效性或端到端回執證據。 |
| Instagram | instagram_business_basic、instagram_business_manage_messages 可供測試；instagram_business_manage_comments 已依使用者確認新增，回讀為可供測試。IG Login API 頁沒有完成 Webhook callback，提示接收 Webhook 需要 App 發佈。 |
| Threads | threads_basic 可供測試；threads_read_replies、threads_manage_replies 已依使用者確認新增，回讀均為可供測試。 |

三項必要權限已新增；尚未確認產生有效 Token，未讀取 Token、顯示 App secret、變更 Meta 自動回覆或發送客戶訊息。新／擴大 API 資料存取權限需在實際操作前確認。新增 manage_replies 也包含隱藏／取消隱藏及回覆控制範圍；manage_comments 也涵蓋留言管理，不能將其描述為只讀。

## 下一個阻礙與啟用守門

須完成既有 App 的必要權限及官方帳號授權，將正式憑證透過安全介面保存至 n8n；不要求聊天提供 Token。資料庫 Postgres 綁定同樣使用受保護的 Credential。App 審閱／發佈要求照官方流程完成，不繞過。

仍待：官方完整分頁 adapter、簽章驗證入口、n8n 正式資料庫綁定、重啟後去重、受控回覆回執及逐平台發送驗收。目前自動發送保持關閉。

原有四條 n8n 工作流、離線 QA 流程、LINE OA、ERP、貼文中心及 Metricool 排程本次均未更動。額外支出 NT$0。


## 使用者同意後的正式操作

使用者明確同意前三項新增權限後，已在既有 App 點選新增並逐項回讀確認為可供測試：instagram_business_manage_comments、threads_read_replies、threads_manage_replies。沒有新增其他權限或發佈 App。

Instagram API 帳號清單已顯示 xianjiawei.tw（17841478328163000）；Webhook 訂閱關閉。點選產生權杖後，頁面及分頁清單未出現授權視窗，未確認 Token 已產生。需要官方帳號授權操作，不要求聊天提供密碼或 Token。三平台自動回覆仍保持關閉；本次額外支出 NT$0。
