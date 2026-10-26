# 仙加味免費發布流程（2026-10-13）

唯一人工審核仍在貼文中心：製作 → 自動檢查 → 待審核 → 登入者完成16項核准。
ChatGPT／AI檢查不能冒充人工核准。過去AI審核記錄不進正式排程。

## 實際分工

|執行者|工作|限制|
|---|---|---|
|Cloudflare Worker／D1|保存審核、內容指紋、UUID、提議日期、待Work佇列；每分鐘檢查過期與審核失效|不呼叫Metricool API，不呼叫ChatGPT工具，不會送出或取消外部排程|
|Work＋官方Metricool連接工具|查D1最新版本、查原UUID、核對圖檔與文案、檢查當月額度、更新／建立一次、重新查詢保存結果|需要Work正在執行；不是全天候背景程式|
|Metricool免費排程器|已保存且解除草稿的FB／IG／Threads在設定時間自動發布|每曆月20次，跨平台各計一次；連線、格式、額度均須有效|
|GitHub Actions|匯入Work查詢後的證據、重新核對D1版本與人工記錄、下載比較圖檔雜湊、保留備份、回寫逐平台結果|沒有Metricool查詢能力；沒有證據不標記成功|
|使用者|完成人工核准；額度不足時選擇Meta免費原生排程或減少頻率；必要時查證平台結果|不能以AI檢查取代核准|

## Work正式送出步驟

1. 從最新D1快照讀取佇列與16項人工核准，不使用ZIP覆蓋GitHub。
2. 先查Metricool原UUID、數字ID、日期與三平台；未知結果先查平台，禁止直接新增或重發。
3. 檢查當月實際已用額度。草稿不佔發布額度；跨三平台一篇要3次。
4. 檢查圖片URL、內容指紋與品牌規範。已有原UUID一律更新。建立新篇時使用D1預先保存的UUID；不得無結果重試建立。
5. 寫入後重新查詢Metricool，確認UUID唯一、copy一致、圖片相同、日期台北時區、draft=false、autoPublish=true、IG自動發布及三平台。
6. 將此次真實查詢結果存到 `ops/metricool-free-evidence/<unique-batch>.json`，透過已授權GitHub維護提交。工作流程只更新證據與D1，不發文。
7. 發布後由Work或使用者查到各平台實際ID、URL與結果，再送result證據。PENDING、缺URL、查不到結果均不得宣稱已發布。
8. 逾時或疑似重複立即停止新建立，保留錯誤與已知UUID。以原UUID查證結果；不要無限重試。

## 證據JSON

頂層 `{batch,source:"official_metricool_connector",brandId:"6889683",posts:[...]}`。
每筆 `{d1Id,sourceFingerprint,imageSource,imageSHA256,verifiedAt,publicationAt,result,remote}`。
`remote` 必須是官方工具重新查詢後的完整貼文；result為draft、scheduled或result。
draft只接受D1 pending_review；scheduled及result要求目前內容的完整人工核准。
已有Metricool識別資訊不可更換UUID。394674560受保護，不由此回填重排。
證據需6小時內、來源圖與Metricool圖檔逐位元相同；更新時保持D1版本租約。
工作流程的JSON回條是授權Work操作的記錄，不是Metricool發出的加密簽章。

## 狀態

* awaiting_work：已核准、等Work處理；不表示已正式排程。
* scheduled：已經外部查詢驗證設定保存。
* awaiting_verification：日期已到，結果待查證；不表示成功或失敗。
* cancel_required：核准或版本已失效，需要Work處理原外部排程；不能讓Worker假裝已取消。
* failed／unknown：保留原因，不重建、不自動重發。

立即發布會提出不受固定時段限制的Work請求，Work仍須查原UUID並更新。
免費架構無法在使用者按下按鈕後，由Worker直接喚起ChatGPT工具。
已有外部正式排程的圖文及狀態修改，先透過Work把原貼文退草稿、取得查詢證據，再修改D1，避免舊版本回流。

## 免費備援

Facebook／Instagram可用Meta Business Suite原生排程；Threads可用Threads原生排程。
這些需要另行登入、帳號權限、逐平台保存及查證；同篇同平台只採一條路徑。
官方Meta API可供自行開發，但需Meta App、相應帳號授權與權限／可能的App Review；現有Meta Page Token不等於同時取得IG與Threads發布權限。本次不替換正常Metricool排程。

官方依據：
https://help.metricool.com/main-differences-between-free-and-paid-plans-bl0v9
https://help.metricool.com/mcp-vs-api-access-what-is-the-difference-5y3ib

限制：沒有無人值守D1→Metricool→D1閉環；Work或人工仍需交接與查證。不得宣稱全天候自動同步。


## 2026-10-26｜Threads 連線狀態與免費排程必須有真實證據

仙加味的 Threads 正式發文路徑採用 Metricool 帳號 `xianjiawei.tw`，但 **Cloudflare Worker 沒有 Metricool 遠端正式排程 API 與回執**。連接帳號、排程草稿或存在 Webhook 參數，不代表貼文已核准或自動發布成功。以前把 Threads 回傳為 `connected:true`、`verified:true`、`externalSchedulerReady:true` 的假健康訊號已停用；維持 `metricool_external_publish_unverified`，直到真正透過 Metricool Connector 取得核准、排程 UUID 及遠端發表證據。

正式內容流程不變：新品與生活情境圖文逐篇符合 16 項品質審核、人工核准、唯一 UUID、免費方案剩餘額度與發布結果，才能標示 `scheduled` 或 `published`。對顧客公開的貼文不得由 Worker 推定為已送出；沒有遠端發送回執就保持待驗證／人工接手，不重複發布。
