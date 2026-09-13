-- 仙加味貼文中心 2026-09-13 全面整理
-- 原則：已發布不動；目前兩篇待審核只整理文案並清除過期建議排程；66篇封存母庫停用所有舊圖，重新分類並保留為後續專屬配圖來源。
BEGIN TRANSACTION;

UPDATE social_posts
SET headline='今天整天在外、工作空檔多，還是晚上才回家？',
    copy='週三早上，出門前先看一下今天的生活動線：整天在外、工作空檔比較多，還是晚上才回到家。\n\n仙加味有不同產品型態，不必每天照同一套安排；先從自己今天怎麼過開始，再慢慢比較哪一種方式比較順手。想進一步確認差異，可以到 LINE 告訴我們你的日常情境，再一起把選擇縮小。\n\n仙加味｜補養，是一種節奏。',
    review_note='2026-09-13新版整理：文案已依生活情境、品牌連結與LINE導流優化；圖片沿用已核准Q版「怎麼選」情境，維持待審核，未自動核准／排程／發布。',
    proposed_scheduled_at=NULL,
    updated_at=CURRENT_TIMESTAMP
WHERE id='XJW-SOCIAL-20260909-0900-CHOOSE';

UPDATE social_posts
SET title='週五回家想煮一鍋熱湯，先把晚餐時間留出來',
    headline='下班前把食材想好，回家就能慢慢備料',
    copy='週五下午準備下班前，如果晚上想在家煮一鍋熱湯，可以先把要用的食材記下來，回家後就不用一邊找材料、一邊趕時間。\n\n仙加味把傳統漢方飲食文化整理成更貼近日常的料理內容；從備料、燉煮到一家人坐下來吃飯，都可以照自己的時間慢慢安排。想看更多日常料理搭配，也可以到 LINE 問我們。\n\n仙加味｜補養，是一種節奏。',
    category='料理搭配',
    review_note='2026-09-13新版整理：文案已強化週五晚餐情境、仙加味品牌連結與自然LINE導流；圖片沿用已核准Q版料理情境，維持待審核，未自動核准／排程／發布。',
    proposed_scheduled_at=NULL,
    updated_at=CURRENT_TIMESTAMP
WHERE id='XJW-SOCIAL-20260911-0900-RECIPE';

UPDATE social_posts SET title='下午整理飲品區時，把鹿茸粉75g放回固定乾燥處', headline='下午整理飲品區時，把鹿茸粉75g放回固定乾燥處', copy='下午整理桌面或飲品區時，仙加味鹿茸粉75g／罐可以放在固定、乾燥的位置；使用後把罐蓋蓋好，再依正式包裝標示妥善保存。\n\n認識粉狀產品，可以先從規格、保存與取用習慣開始，而不是只看產品名稱。有看不懂的標示，再透過 LINE 詢問會更清楚。\n\n仙加味｜補養，是一種節奏。', updated_at=CURRENT_TIMESTAMP WHERE id='POST-LUERONG';
UPDATE social_posts SET title='晚上整理產品標示：鹿茸粉75g先從規格與保存看起', headline='晚上整理產品標示：鹿茸粉75g先從規格與保存看起', copy='晚上整理家裡的產品時，如果想看懂仙加味鹿茸粉，可以先從最基本的資訊開始：75g／罐，再把正式標示上的保存方式一起看清楚。\n\n不需要一次把資訊說得很複雜；先知道自己拿的是哪一種產品、怎麼保存，有疑問再透過 LINE 詢問，會更實際。\n\n仙加味｜補養，是一種節奏。', updated_at=CURRENT_TIMESTAMP WHERE id='XJW-GUILU-luerong-single-material';
UPDATE social_posts SET title='第一次看龜鹿膠，先從600g／32塊與料理情境認識', headline='第一次看龜鹿膠，先從600g／32塊與料理情境認識', copy='第一次看到仙加味龜鹿膠，可以先把產品型態與規格看清楚：600g（1斤）／盒、32塊裝，每塊約18.75g。\n\n龜鹿膠比較適合從家常料理與燉煮情境去理解，也不要和75g／盒、8塊裝的龜鹿湯塊混在一起。先分清楚產品，再看家裡平常怎麼料理會更容易。\n\n仙加味｜補養，是一種節奏。', updated_at=CURRENT_TIMESTAMP WHERE id='XJW-GUILU-jiao-hot-water';
UPDATE social_posts SET title='臨時不煮大鍋湯？先把龜鹿湯塊的規格與料理方式看懂', headline='臨時不煮大鍋湯？先把龜鹿湯塊的規格與料理方式看懂', copy='不是每次回家都有時間燉一大鍋湯。想認識仙加味龜鹿湯塊，可以先把它的塊狀型態、盒裝規格與家常料理情境看懂，再挑有空的日子安排進餐桌。\n\n龜鹿湯塊是75g／盒、8塊裝，每塊約9.375g。先看家裡平常怎麼煮、一次通常準備多少，比硬套固定做法更符合日常。\n\n仙加味｜補養，是一種節奏。', updated_at=CURRENT_TIMESTAMP WHERE id='XJW-GUILU-tangkuai-hot-water';
UPDATE social_posts SET title='下午整理桌面時，先從鹿茸粉75g的標示與保存開始', headline='下午整理桌面時，先從鹿茸粉75g的標示與保存開始', copy='下午工作告一段落，整理桌面時也可以順手看看仙加味鹿茸粉75g／罐的正式標示與保存方式。\n\n今天先看規格與保存，下一次再了解其他資訊，不用一次把所有內容塞在一起。有看不懂的欄位，直接到 LINE 問我們，慢慢確認會更清楚。\n\n仙加味｜補養，是一種節奏。', updated_at=CURRENT_TIMESTAMP WHERE id='XJW-SOCIAL-20260815-02-luerong-daily-drink';
UPDATE social_posts SET title='晚餐後想喝溫一點：180cc用隔水方式溫熱', headline='晚餐後想喝溫一點：180cc用隔水方式溫熱', updated_at=CURRENT_TIMESTAMP WHERE id='XJW-GUILU-drink180-warm';
UPDATE social_posts SET title='先看實際比例：30cc就是小玻璃裸罐', headline='先看實際比例：30cc就是小玻璃裸罐', updated_at=CURRENT_TIMESTAMP WHERE id='XJW-GUILU-drink30-small-jar';
UPDATE social_posts SET title='週五下班前整理抽屜：把沒喝的30cc帶回家妥善收好', headline='週五下班前整理抽屜：把沒喝的30cc帶回家妥善收好', updated_at=CURRENT_TIMESTAMP WHERE id='XJW-GUILU-drink30-storage';
UPDATE social_posts SET title='外出跑行程時，30cc放進有緩衝的小袋更安心', headline='外出跑行程時，30cc放進有緩衝的小袋更安心', updated_at=CURRENT_TIMESTAMP WHERE id='XJW-SOCIAL-20260815-02-drink-30-outside';
UPDATE social_posts SET title='今天會議排滿？龜鹿飲不必固定在某個分鐘', headline='今天會議排滿？龜鹿飲不必固定在某個分鐘', updated_at=CURRENT_TIMESTAMP WHERE id='XJW-SOCIAL-20260815-02-faq-flexible-time';
UPDATE social_posts SET title='到萬華散步想順路了解仙加味？先LINE確認再出發', headline='到萬華散步想順路了解仙加味？先LINE確認再出發', updated_at=CURRENT_TIMESTAMP WHERE id='XJW-SOCIAL-20260815-03-wanhua-visit-brand';
UPDATE social_posts SET title='從實際工序看時間與火候：每一步都需要現場確認', headline='從實際工序看時間與火候：每一步都需要現場確認', updated_at=CURRENT_TIMESTAMP WHERE id='XJW-SOCIAL-20260815-03-craft-time-and-heat';
UPDATE social_posts SET title='下午工作告一段落，用一罐30cc留個溫熱休息空檔', headline='下午工作告一段落，用一罐30cc留個溫熱休息空檔', updated_at=CURRENT_TIMESTAMP WHERE id='XJW-WORK-REST-001';
UPDATE social_posts SET copy='第一次打開仙加味龜鹿膏，不需要急著照別人的份量。可以先從半匙開始，選一個自己比較好記的時段，慢慢認識這種型態。\n\n如果當天覺得不適合，就先暫停，之後再依自己的生活狀況調整。重點是從較少份量開始，把安排做得簡單、清楚。\n\n仙加味｜補養，是一種節奏。', updated_at=CURRENT_TIMESTAMP WHERE id='XJW-GUILU-gao-first-half';
UPDATE social_posts SET copy='第一次打開仙加味龜鹿膏，可以先把流程做簡單：準備乾淨小匙，從半匙開始，再選一個自己好記的時段。\n\n取用後把罐蓋蓋好，開罐後冷藏。如果當天覺得不適合，就先暫停，之後再依自己的生活狀況調整。先把自己的使用節奏建立起來，比照抄別人的份量更實際。\n\n仙加味｜補養，是一種節奏。', updated_at=CURRENT_TIMESTAMP WHERE id='XJW-SOCIAL-20260815-03-gao-half-spoon-start';
UPDATE social_posts SET title='申請試喝前，先把收件方式與最新說明確認好', headline='申請試喝前，先把收件方式與最新說明確認好', copy='如果想先從仙加味龜鹿飲30cc試喝開始，申請前可以先把收件方式、目前試喝內容與運費說明確認好。\n\n試喝方案與寄送資訊以 LINE 當下最新說明為準；把收件資料準備好，再送出申請，流程會比較順。每人限申請一次。\n\n仙加味｜補養，是一種節奏。', updated_at=CURRENT_TIMESTAMP WHERE id='XJW-GUILU-trial-first';
UPDATE social_posts SET copy='送出試喝申請後，下一步不是馬上出貨。仙加味龜鹿飲為接單後製作，試喝組同樣約5～7個工作天出貨。\n\n如果最近剛好要出差、旅行或不方便收件，申請時可以先在 LINE 說明。把製作時間和收件行程一起想，會比臨時追物流更從容。\n\n仙加味｜補養，是一種節奏。', updated_at=CURRENT_TIMESTAMP WHERE id='XJW-GUILU-trial-shipping';
UPDATE social_posts SET copy='早上出門覺得涼，中午又變暖，早晚溫差大的日子很常見。這時仙加味更想提醒的是：產品安排可以跟著生活變，不需要一天從早到晚都照同一套。\n\n例如白天外出時帶一罐30cc小玻璃罐，到了晚上回家，再依當天的作息與飲食安排決定是否想換成其他型態。先看今天怎麼過，再做選擇。\n\n仙加味｜補養，是一種節奏。', updated_at=CURRENT_TIMESTAMP WHERE id='POST-WEATHER-TEMP';

UPDATE social_posts
SET category=CASE
      WHEN category IN ('試喝流程','試喝交期','試喝收件','試喝紀錄') THEN '試喝'
      WHEN category IN ('新手諮詢','LINE下單前','來店情境','萬華來訪') THEN 'LINE諮詢'
      WHEN category IN ('接單製作','接單交期') THEN '交期說明'
      WHEN category IN ('家常料理','家庭料理','帶餐情境','飲食文化','湯塊使用') THEN '料理搭配'
      WHEN category IN ('龜鹿膏收納','辦公室收納','飲品保存','梅雨收納','換季整理') THEN '保存整理'
      WHEN category IN ('產品選擇','行程選擇','生活搭配','型態情境','容量比較','規格比較') THEN '怎麼選'
      WHEN category IN ('產品標示','包裝辨識','30cc包裝','規格整理','原料資訊','資訊透明','30cc實物','規格管理','龜鹿膠規格','湯塊規格') THEN '產品知識'
      WHEN category IN ('溫熱飲用','初次使用','早晨飲用','龜鹿膠使用','時間FAQ','鹿茸粉下午','龜鹿膏初次','飲用溫度') THEN '使用方式'
      WHEN category IN ('品牌日常','傳統工序','家族工序') THEN '品牌故事'
      ELSE '生活情境'
    END,
    image_url='',
    image_alt='',
    image_source='2026-09-13新版整理｜舊圖全數停用｜待專屬新情境圖',
    image_approved=0,
    image_width=0,
    image_height=0,
    image_bytes=0,
    image_quality_status='low',
    proposed_scheduled_at=NULL,
    review_note='2026-09-13文案全面整理完成；舊圖全數停用。待依本篇情境製作唯一新圖；固定Q版小老闆、小鹿與小烏龜分開；若出現產品，只能用正式產品原圖等比例合成，不得AI重畫。完成新圖後一律回待審核，需16項人工審核，不自動核准／排程／發布。',
    rejection_reason='舊圖已作廢；目前保留為文案母庫，等待專屬新情境圖。',
    updated_at=CURRENT_TIMESTAMP
WHERE status='archived';

COMMIT;
