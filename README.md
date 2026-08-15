# 仙加味營運中控｜公開部署程式

這個公開倉庫只保存 Cloudflare Worker 與內部系統前端原始碼。正式營運資料存放於 Cloudflare D1；登入由 Cloudflare Access 保護。GitHub 不保存真實客戶、訂單、付款、成本、庫存、拜訪或平台 Token。

## 正式執行架構

- Cloudflare Worker 正式入口：`src/production-entry.js`
- 16項貼文審核與重新生成閉環：`src/publishing-review-gate-entry.js`
- 立即發布／人工平台分流：`src/flexible-publish-entry.js`
- 產品與貼文寫入權威：`src/authority-entry.js`
- 既有 ERP API／媒體入口：`src/entry.js`
- ERP 核心 API：`src/worker.js`
- 社群發布：`src/social-publisher.js`
- 正式產品權威：`src/product-authority.js` + `config/official-products.json`

`production-entry.js` 是完整頂層入口；它保留 ERP 模組、Cloudflare Access、D1、產品權威、16項圖文審核、平台健康檢查、排程與真正立即發布。`src/publishing-only-entry.js` 只保留作相容／歷史程式檢查，不再作正式 Wrangler 入口。

## 介面分工

- `/`：完整「仙加味營運中控」，保留產品、庫存、客戶、拜訪、訂單、採購、供應商、財務、任務、範本、文件、素材與設定等內部模組。
- `/publishing.html`：唯一正式貼文審核發佈介面。
- ERP 的貼文／排程快捷入口會導向 `/publishing.html`，避免同時維護兩套貼文操作邏輯。

官網不公開的成本、批發、庫存、合作商與歷史營運資料，仍可保留於 ERP／D1；不得因官網不顯示就刪除或限制。

## 正式產品資料原則

- 六個正式產品、六個正式主規格。
- 龜鹿膏：100g／罐；目前使用方式為「食用時間可依個人使用習慣與作息時間安排」。
- 龜鹿飲30cc玻璃罐：30cc／罐（小玻璃罐）；小玻璃裸罐、無貼紙，不得稱瓶、不得改罐型或比例。
- 龜鹿飲180cc鋁袋：180cc／包（鋁袋）；維持狹長鋁袋原比例。
- 龜鹿湯塊：75g／盒｜8塊裝；每塊約9.375g只屬產品詳細／內部資料，不放產品圖、DM或貼文主規格。
- 龜鹿膠：600g （1斤）／盒｜32塊裝；每塊約18.75 g只屬產品詳細／內部資料，不放產品圖、DM或貼文主規格。
- 鹿茸粉：75g／罐。
- 正式成分順序納入後端驗證。

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
- 阻擋型內容／圖片守門在整套系統最終驗收前維持暫停，最低程式與資料安全檢查仍保留。

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

GitHub Actions 的程式驗收不等於 Cloudflare 已正式部署；只有實際 deploy workflow 成功且 live health／deployment status 驗證通過，才可稱為正式上線。
