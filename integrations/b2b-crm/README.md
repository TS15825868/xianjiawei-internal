# B2B CRM independent delivery (staged, disabled)

## 2026-11-24 最小權限接收器

正式備份及原有隔離測試沿用既有回執。新接收器使用 [service-account/Code.gs](./service-account/Code.gs) 及同目錄的明確 OAuth 資訊清單，部署時使用整套來源。Apps Script 擁有者只授予指令碼對外發送 HTTP 請求的 scope。Sheets API 的資料權限由全新專用服務帳戶的檔案共用設定控制。只共用指定驗收試算表，不授予 Google Cloud 專案角色，不使用全網域委派，也不重用具有其他 Drive 權限的帳戶。

服務帳戶憑證以 Script Properties 的 `XJW_B2B_SHEETS_SERVICE_EMAIL` 與 `XJW_B2B_SHEETS_SERVICE_PRIVATE_KEY` 設定。試算表仍使用 `XJW_B2B_CRM_SPREADSHEET_ID`，Worker 既有 v2 HMAC、時間戳、目標證明與回執格式延用。寫入使用 RAW 值，避免公式解析，並在 Apps Script 鎖內檢查事件 ID 與摘要。切換前保留原專案與來源。

本機模擬測試已驗證 JWT 不委派、固定目標 URL、RAW 寫入、403 及未確認寫入時拒絕。Google Cloud Console 在 Work 瀏覽器無法開啟，尚無服務帳戶、正式憑證或部署回執。正式驗收需以該帳戶對指定檔讀取表頭成功，並對另一份不共用的無敏感測試檔取得拒絕。正式寫入、轉送及對客通知在驗收前維持停用。

## 2026-11-24 接收器與正式備份驗收狀態

- 獨立 B2B Apps Script 專案已建立，沿用本目錄的 `Code.gs`，綁定既有驗收工作表，寫入旗標為 false。本機隔離驗證 8 項通過，包含簽章、時間戳、目標、重複寫入及公式字元處理。
- 已在 Google 提交 Web App 部署設定。Google OAuth 顯示應用程式尚未驗證，且獨立指令碼使用 `SpreadsheetApp.openById` 要求 `spreadsheets` OAuth 範圍，無法將該授權限定在單一試算表。現有專案授權只涵蓋指定試算表，因此未授予 OAuth 權限。尚無部署成功回執、正式金鑰設定、已部署端點拒絕回執或正式簽章唯讀驗收。自動轉送及對客通知仍停用。
- D1 正式備份與隔離還原已在 [Actions #6](https://github.com/TS15825868/xianjiawei-internal/actions/runs/45412018779) 通過：11,815,053 bytes、41 張業務表比對一致、外鍵及隔離演練逐筆保留檢查通過。正式庫逐筆指紋比對未執行，正式遷移未套用。

## 2026-11-23 confirmed live state (read-only)

- Cloudflare D1 lists all three expected B2B tables. Bounded production `COUNT(*)` checks returned **0 inquiries, 0 drafts, and 0 CRM deliveries**, with 0 rows written. This is a current snapshot, not a guarantee of future activity.
- The existing 2026-11-22 GitHub Actions run [44971113993](https://github.com/TS15825868/xianjiawei-internal/actions/runs/44971113993) successfully exported a full SQL snapshot (11,815,053 bytes) and passed its **then-current** isolated restore/schema rehearsal; its artifact did not contain the strengthened later full-table inventory, foreign-key, and row-preservation evidence. Do not mark the **latest** full-database backup/restore safety gate as passed on that historical receipt alone.
- Live Worker configuration still has B2B intake enabled, CRM delivery disabled, and no standalone CRM URL/secret/target-proof bindings. The existing isolated Sheet has the verified expected headers, but the independent Apps Script receiver deployment and signed readiness remain unverified. Never enable CRM forwarding or customer messaging before that acceptance.

## 2026-11-22 verified isolation status

- A separate existing Google Sheet titled **仙加味 B2B CRM 隔離驗收** was found using the connected Drive account. The sole **B2B商家合作** tab has the exact eight headers in `Code.gs` and a frozen header row. Only A1:H1 was read; no business-contact values or customer rows were inspected. **Reuse this isolated sheet; do not create a duplicate or switch the retail CRM target.**
- The production Cloudflare Worker settings were checked by binding *names/types only*. `XJW_B2B_INTAKE_ENABLED=true`; `XJW_B2B_CRM_ENABLED=false`; `XJW_B2B_NOTIFICATION_RETRY_ENABLED=false`. The three required Worker bindings `XJW_B2B_CRM_URL`, `XJW_B2B_CRM_SECRET`, and `XJW_B2B_CRM_TARGET_PROOF` were all absent. No secret value was read or printed.
- An isolated Google Sheet with correct headers is **not proof** that the standalone Apps Script Web App has been deployed, that it uses the approved Sheet, or that a signed readiness probe has passed. These remain unverified. Do not enable any production delivery or customer messaging.
- The proof is stored without identifiers/credentials in `ops/receipts/20261122-b2b-crm-receiver-readiness-source-check.json`. Continue by locating or deploying the **independent** Apps Script receiver, testing the signed read-only nonce and expected target proof, then verifying isolated delivery, duplicate suppression, and readback. All enabled production flags stay false until separate formal acceptance.

- This module is not the existing retail CRM Apps Script v46. Do not replace that project or its deployed endpoint.
- **Current production D1 schema already contains all three B2B tables**, including `business_inquiry_crm_delivery`, and their definitions were matched to the approved GitHub sources in `ops/receipts/20261122-b2b-live-d1-schema-exact-match.json`. Do not reapply the additive schema simply because older migration instructions still exist. For any future schema change, require a separate full backup and isolated rehearsal first. The existing `business_inquiries` and `business_inquiry_drafts` tables must remain unchanged.
- Create or locate the separate Apps Script project from integrations/b2b-crm/Code.gs, initially bound by XJW_B2B_CRM_SPREADSHEET_ID to the **existing verified isolated spreadsheet**, not the production spreadsheet or its backup. Set XJW_B2B_CRM_SECRET to a securely generated shared secret of at least 32 characters. Run setupB2bCrmSheet manually. Enable XJW_B2B_CRM_ENABLED only in the isolated project and verify deployment and signed readback before any production target is configured.
- Worker secrets: XJW_B2B_CRM_URL (standalone script.google.com/macros/s/.../exec), XJW_B2B_CRM_SECRET. Leave XJW_B2B_CRM_ENABLED unset or false until approved production acceptance. Existing intake flag is also required. No existing retail endpoint, contact notification, or customer message is used.
- Stable inquiry ID + payload digest provides receiver deduplication, including lost acknowledgments. Mismatched IDs never count as success. D1 leases, backoff, bounded attempts, and held status guard concurrency and prevent retry storms. Held records require operator evidence; no automatic reset.
- Acceptance still required: actual standalone Apps Script deployment, isolated signed delivery/readback/retry/duplicate verification, production credentials, and end-to-end acceptance. **The current D1 table migration is not outstanding**; the latest full-database backup/restore acceptance is documented in the November 24 section. Retail order synchronization/v46 acceptance remains separate.

## Read-only receiver acceptance before activation
- The receiver supports an exact signed `{action:"readiness",nonce:"<32 lowercase hex>"}` request even when receipt writes are disabled. It returns only the nonce, protocol version, write-enabled flag, and HMAC target proof; it never returns a Sheet ID or row data.
- Set `XJW_B2B_CRM_TARGET_PROOF` as a Worker secret only after the isolated and later formal target have been explicitly verified. It is the lowercase hexadecimal HMAC-SHA256 using the shared CRM secret over the UTF-8 string `xjw-b2b-crm-v2\nreadiness-target\n<approved spreadsheet ID>` (actual LF separators). Do not print the proof or key in CI logs.
- Call `probeBusinessInquiryCrm` with the exact endpoint, shared secret and expected proof. Confirm a matching signed nonce, correct target and receiverEnabled=false. This function performs no D1 or spreadsheet writes; it is not scheduled or exposed as a public route.
- This preflight does not replace the actual isolated Web App delivery, duplicate, retry, and row readback acceptance. Do not enable production delivery on the strength of preflight alone.

- Protocol v2 is mandatory: each signed delivery includes the approved target proof, the receiver checks it before opening the write target, and successful/duplicate acknowledgments must echo it. A wrong target holds the event without writing; a missing proof prevents transport. Earlier protocol v1 is incompatible by design; as of 2026-11-22 no standalone B2B receiver deployment has been independently verified. Do not use v1 for deployment.
