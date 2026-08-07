# 仙加味營運中控｜公開部署程式

這個公開倉庫只保存 Cloudflare Worker 與 ERP 前端介面原始碼。

## 不會存放在 GitHub 的內容

- 客戶姓名、電話、地址、Email
- 訂單、付款、採購、供應商、財務與成本資料
- 正式庫存數量、拜訪紀錄、稽核紀錄
- 待審貼文、排程結果、發布回傳與私人備註
- Facebook、Instagram、LINE OA、Google、OpenAI、Supabase、Cloudflare 等 Token 或密碼

正式營運資料只存在 Cloudflare D1；秘密只存在 Cloudflare Worker Secrets；ERP 登入由 Cloudflare Access 保護。公開原始碼不代表內部系統或資料可以公開存取。

## Cloudflare Build

```bash
npm install --ignore-scripts --no-audit --no-fund --no-package-lock
npm run deploy
```

部署時必須保留現有 Worker Variables、Secrets、D1 綁定與 Cloudflare Access 規則。
