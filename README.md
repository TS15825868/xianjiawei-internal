# 仙加味營運中控｜公開部署程式

這個公開倉庫只保存 Cloudflare Worker 與 ERP 前端介面原始碼。正式營運資料存放於 Cloudflare D1；登入由 Cloudflare Access 保護。

## 正式執行入口

- Cloudflare Worker 入口：`src/authority-entry.js`
- 既有 ERP API／媒體／產品權威入口：`src/entry.js`
- ERP 核心 API：`src/worker.js`
- 社群發布：`src/social-publisher.js`
- 正式產品權威：`src/product-authority.js` + `config/official-products.json`

`authority-entry.js` 會在產品或貼文的部分更新送進核心 API 前，先讀取 D1 現有資料並合併後再驗證，避免只改成分／使用方式時繞過六項正式產品權威。

## 正式產品資料原則

- 六個正式產品、六個正式規格。
- 龜鹿湯塊只有 75g／盒深藍盒；8塊裝、每塊約9.375g。
- 600g（1斤）／盒是龜鹿膠淡紫盒，不是龜鹿湯塊。
- 30cc正式名稱為「龜鹿飲30cc玻璃罐」，不可稱瓶；裸罐、無貼紙、無外盒、無外袋、金色蓋。
- 正式成分順序與龜鹿膏「每日早上及下午各一小匙」也納入後端驗證。
- 產品圖片只使用正式原圖等比例呈現，不重畫、不裁切、不改包裝。

## 貼文與發布

- 新文案與新圖先進待審核。
- AI／品牌守門在整套系統尚未完成最終驗收前維持提示模式。
- 正式產品主檔硬性錯誤仍會阻止寫入。
- 審核通過後可排程或使用 ERP 真正的「立即發布」。
- LINE VOOM 保留人工發布／補登流程。
- 公開 GitHub Pages 發布中心不保存平台 Token，也不假裝本機紀錄等於真正平台發布成功。

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

不想部署時，可只做本機／手動驗收：

```bash
npm run check
npm run build:static
```

GitHub Actions 的 `仙加味 ERP 正式程式手動驗收` 只在人工觸發時執行，不會自動部署 Cloudflare。
