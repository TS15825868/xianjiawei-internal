# 仙加味營運中控｜公開部署程式

這個公開倉庫只保存 Cloudflare Worker 與內部系統前端原始碼。正式營運資料存放於 Cloudflare D1；登入由 Cloudflare Access 保護。GitHub 不保存真實客戶、訂單、付款、成本、庫存、拜訪或平台 Token。

## 正式執行架構

- Cloudflare Worker 正式最上層入口：`src/full-system-entry.js`
- 完整 ERP／D1／Access／產品與通路後端：`src/production-entry.js`
- 16項貼文審核與重新生成閉環：`src/publishing-review-gate-entry.js`
- 內容／圖片語意與重複檢查：`src/publishing-content-audit-entry.js`
- 立即發布／人工平台分流：`src/flexible-publish-entry.js`
- 產品與貼文寫入權威：`src/authority-entry.js`
- ERP API／媒體入口：`src/entry.js`
- ERP 核心 API：`src/worker.js`
- 社群發布：`src/social-publisher.js`
- 正式產品權威：`src/product-authority.js` + `config/official-products.json`

`full-system-entry.js` 是目前 Wrangler 正式入口：它把完整 ERP 與唯一正式貼文中心整合在同一個 Cloudflare Worker 中，但維持不同介面與責任。`production-entry.js` 保留完整 ERP／D1／Access 與後端能力；貼文操作仍走目前最新審核與內容守門鏈。`src/publishing-only-entry.js` 只作貼文中心相容層，不再負責封鎖 ERP 正常模組。

## 介面分工

- `/`、`/erp.html`：完整「仙加味營運中控」，保留產品、庫存、客戶、拜訪、訂單、採購、供應商、財務、任務、範本、文件、素材、平台授權與設定等內部模組。
- `/publishing.html`：唯一正式貼文審核發佈介面。
- ERP 的貼文／排程快捷入口導向 `/publishing.html`，避免同時維護兩套貼文操作邏輯。

官網不公開的成本、批發、庫存、合作商、客戶、寄賣、歷史營運資料與內部備註仍可保留於 ERP／D1；不得因官網不顯示就刪除或限制。

## 正式產品資料原則

目前對外只使用六項正式產品：

- 龜鹿膏：100g／罐；使用時間可依個人使用習慣與作息時間安排。
- 龜鹿飲30cc玻璃罐：30cc／罐（小玻璃罐）；小玻璃裸罐、無貼紙，不得稱瓶、不得改罐型或比例；每日 1–2 罐。
- 龜鹿飲180cc鋁袋：180cc／包（鋁袋）；維持狹長鋁袋原比例；每日一包。
- 龜鹿湯塊：75g （2兩）／盒｜8塊裝；每塊約9.375g只屬產品詳細／內部資料，不放產品圖、DM或貼文主規格。
- 龜鹿膠：600g （1斤）／盒｜32塊裝；每塊約18.75g只屬產品詳細／內部資料，不放產品圖、DM或貼文主規格。
- 鹿茸粉：75g／罐。

龜鹿飲30cc與180cc為接單後製作，約5～7個工作天出貨；此交期只適用龜鹿飲。

柒玄茶・龜鹿調飲粉目前只可保留於 ERP 內部／暫緩資料，不得出現在官網、LINE OA 產品卡、推薦、公開 AI 回答、公開貼文或主動回覆；待使用者日後明確重新啟用才恢復公開。

正式成分與順序納入後端驗證，新版正確資料優先於任何舊守門員或舊固定版本。

## 正式圖片角色

- 一般產品顧客主圖：官網目前 `images/customer-display-v20260812/` 正式產品圖。
- 詳細 DM：官網目前 `images/dm-final/` 六張高解析正式 DM。
- 試喝：`images/trial/trial-poster-small-boss-official-v20260814.jpg`。
- `images/products-v3/`：只作真實產品身份、包裝與比例校正參考，不再當一般顧客主圖。
- 產品本體不得 AI 重畫、裁切、拉伸、改標籤、改包裝或改比例。

## 貼文與發布

- 草稿 → 待審核 → 16項人工圖文審核 → 已核准 → 排程或立即發布。
- 立即發布不受固定排程時段卡住；已核准或已排程貼文都可直接走 `/api/posts/:id/publish-now`。
- 文案或圖片被修改、重新生成時，舊核准與排程自動失效；完成回填後回待審核。
- LINE VOOM 與沒有官方 API／Token 的平台保留人工發布／補登流程。
- 阻擋型內容／圖片守門在整套系統最終驗收前維持暫停，最低程式、權限、產品公開邊界與資料安全檢查仍保留。

## 不會存放在 GitHub 的內容

- 客戶姓名、電話、地址、Email
- 訂單、付款、採購、供應商、財務與成本資料
- 正式庫存數量、拜訪紀錄、稽核紀錄
- D1 內部貼文狀態、排程結果、發布回傳與私人備註
- Facebook、Instagram、LINE OA、Google、OpenAI、Cloudflare 等 Token 或密碼

## Cloudflare Build

```bash
npm install --ignore-scripts --no-audit --no-fund --no-package-lock
npm run deploy
```

部署時必須保留現有 Worker Variables、Secrets、D1 綁定與 Cloudflare Access 規則。

不部署時可先做完整程式驗收：

```bash
npm run check
npm run build:static
npm run guard:full
```

GitHub Actions 的程式驗收不等於 Cloudflare 已正式部署；只有實際 deploy workflow 成功，而且 `/`、`/erp.html`、`/publishing.html`、D1、Access 與 `deployment-status.json` 都通過正式驗收，才可稱為完整 ERP＋貼文中心已正式上線。
