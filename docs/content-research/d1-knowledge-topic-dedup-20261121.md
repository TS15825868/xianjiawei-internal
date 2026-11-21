# 仙加味｜161 篇 D1 歷史貼文與知識圖卡選題初步去重（2026-11-21）

**實際來源**：Cloudflare D1 `xianjiawei-internal-db` 唯讀 SQL；總數 161（published 8、pending_review 46、archived 107）。本次查詢以 title、copy 的關鍵詞篩選，31 篇命中。**這是文字主題初篩，不是 161 篇全文語意／圖片感知雜湊去重，也不是正式發布核准。**

## 直接命中的歷史題材與處理

| 新候選方向 | D1 已有近似內容 | 狀態 | 決策 |
|---|---|---|---|
| 乾紅棗家常甜湯／備料 | `XJW-CAND-20270115`「冬日早晨，為甜湯準備紅棗」 | pending_review | **暫緩**新建同角度貼文；若另作食材資料卡，須改為明確不同的產地／標示查證角度 |
| 多種乾燥食材圖鑑 | `XJW-CAND-20270105`「在萬華店認識幾味乾燥食材」及 `XJW-CONV-chat-no-standard-answer`「從一張食材圖卡開始」 | pending_review | **暫緩**泛食材辨識總覽，避免只是換圖重發 |
| 家常湯食材備料 | `XJW-20913aa0-9cfb-49f0-acae-15005a51bbaa`「這週要煮哪一道家常湯？」 | published | 新角度須是可查證的具體操作知識，不重用原文或圖片 |
| 食材保存／包裝標示 | `XJW-CONV-cny-fridge-clean`「年前整理冰箱的一個角落」、`XJW-CAND-20270330`「春天整理食品櫃的一個下午」及多篇 archived 的產品保存／標示貼文 | pending_review / archived | 避免「看標示／收好食材」泛角度；必須有新資訊點 |
| 茶包浸泡時間 | 此次 title／copy 關鍵詞初篩未找到同題 D1 貼文 | — | **優先沿用** GitHub 既有 `k-tea-steep-01`，不建立第二篇；仍須全文與圖片歷史去重 |
| 食品與藥材身分區別 | 本次關鍵詞初篩未證實同題 | — | 可保留研究候選，但需最新台灣官方法規、原料逐項核對及審核，不能直接發 |

## 建議保留的原創差異化角度
1. 「買紅棗時，包裝上的產地與保存資訊怎麼看？」——具體消費資訊，需以官方食農及食品標示資料核對；不得僅換標題重述已存在的紅棗備料貼文。
2. 「茶包浸泡時間與濃淡，先看包裝說明」——承接 `k-tea-steep-01`；圖片及文案先做正式去重與 16 項品質驗證。
3. 「認識食品與中藥材的不同」——資訊型而非處方型；必須查最新現行法規，不能把預告草案當作已生效。

## 唯讀 SQL 證據
```sql
SELECT status,COUNT(*) AS n FROM social_posts GROUP BY status;
SELECT id,title,category,status,substr(copy,1,260) AS excerpt
FROM social_posts
WHERE title LIKE '%紅棗%' OR title LIKE '%枸杞%' OR title LIKE '%食材%'
   OR title LIKE '%茶%' OR title LIKE '%料理%'
   OR copy LIKE '%保存%' OR copy LIKE '%浸泡%'
LIMIT 90;
```
查詢回傳 31 篇；對上述候選主題做保守人工比對。未執行寫入 SQL，未修改 D1 狀態或發布授權。

## 下一關卡
必須補齊全部 161 篇文案相似度、圖片 SHA-256／感知雜湊、候選實體素材來源、授權與品質驗證。不能把本文件當成去重完成或准予發布的證據。新增費用 NT$0。
