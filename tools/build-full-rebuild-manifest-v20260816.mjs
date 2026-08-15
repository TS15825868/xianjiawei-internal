import fs from 'node:fs';

const input=JSON.parse(fs.readFileSync('audits/live-posts-current.json','utf8'));
const posts=Array.isArray(input.posts)?input.posts:[];
const FOOTER='仙加味\n補養，是一種節奏。';
const blocked=['台興山產','治療','改善疾病','關節','卡卡','疲勞','精神不濟','補氣','生津','膠原蛋白','鈣質','預防疾病','保證功效'];

function includesAny(s,arr){return arr.some(x=>s.includes(x))}
function productsFor(t){
  const p=[];
  if(/30cc/.test(t))p.push('drink30');
  if(/180cc/.test(t))p.push('drink180');
  if(/龜鹿膏/.test(t))p.push('gao');
  if(/龜鹿湯塊|湯塊/.test(t))p.push('tangkuai');
  if(/龜鹿膠/.test(t))p.push('jiao');
  if(/鹿茸粉/.test(t))p.push('luerong');
  if(/六項產品/.test(t))return ['gao','drink30','drink180','tangkuai','jiao','luerong'];
  if(/龜鹿飲、龜鹿膏、湯塊與龜鹿膠/.test(t))return ['drink30','drink180','gao','tangkuai','jiao'];
  if(/30cc小玻璃罐與180cc鋁袋/.test(t))return ['drink30','drink180'];
  if(/龜鹿湯塊與龜鹿膠/.test(t))return ['tangkuai','jiao'];
  if(/日常節奏組｜膏與飲/.test(t))return ['gao','drink30'];
  return [...new Set(p)];
}

function sceneFor(p){
  const t=p.title, c=p.category;
  if(/萬華/.test(t))return 'wanhua_street';
  if(/四代/.test(t))return 'heritage_workbench';
  if(/火候|熬製/.test(t))return 'craft_simmer';
  if(/天氣悶熱/.test(t))return 'hot_outdoor';
  if(/下雨天/.test(t))return 'rainy_window';
  if(/早晚溫差/.test(t))return 'temperature_outdoor';
  if(/工作再忙|工作空檔/.test(t))return 'work_break';
  if(/四季/.test(t))return 'four_seasons';
  if(/保存/.test(t))return /鋁袋|30cc|鹿茸粉|龜鹿膏/.test(t)?'storage_shelf':'storage_general';
  if(/試喝/.test(t))return 'trial_table';
  if(/LINE|下單前|先了解/.test(t))return 'line_consult';
  if(/外出/.test(t))return 'outdoor_bag';
  if(/料理|雞湯|排骨湯|家常湯|燉煮/.test(t)||c==='料理搭配')return 'home_cooking';
  if(/溫熱|熱水|喝溫一點/.test(t)||c==='日常飲用')return 'warm_drink';
  if(/接單後|5～7個工作天|交期/.test(t)||c==='出貨說明')return 'made_to_order';
  if(/包裝|小玻璃罐|狹長鋁袋/.test(t))return 'package_detail';
  if(/成分|用料|原料|產品資訊/.test(t)||c==='產品知識')return 'ingredient_info';
  if(/怎麼選|挑選|差在哪|分清楚|比較/.test(t)||c==='產品比較'||c==='挑選方式')return 'compare_choose';
  if(/家庭|一斤大盒/.test(t))return 'family_table';
  if(/品牌|文化|傳統|日常節奏|補養，是一種節奏/.test(t)||includesAny(c,['品牌故事','品牌理念','飲食文化','龜鹿入門']))return 'brand_culture';
  if(/180cc/.test(t))return 'home_drink';
  if(/30cc/.test(t))return 'small_jar_daily';
  if(/龜鹿膏/.test(t))return 'gao_daily';
  if(/龜鹿膠/.test(t))return 'jiao_daily';
  if(/鹿茸粉/.test(t))return 'luerong_daily';
  if(/龜鹿湯塊|湯塊/.test(t))return 'tangkuai_daily';
  return 'daily_life';
}

function poseFor(scene){
  if(['wanhua_street','outdoor_bag','line_consult','made_to_order','brand_culture'].includes(scene))return 'wave';
  if(['home_cooking','ingredient_info','family_table','craft_simmer'].includes(scene))return 'tray';
  if(['compare_choose','package_detail','trial_table'].includes(scene))return 'thumb';
  return 'main';
}

function copyFor(p){
  const t=p.title, h=(p.headline||'').replace(/[。！？!?]+$/,'');
  let a='',b='';
  if(/工作再忙/.test(t)){a='忙碌的日子，不一定要把每一段時間都排滿。喝口溫水、離開螢幕幾分鐘，都是把節奏重新放回自己手上的小方法。';b='仙加味想談的日常補養，不是追趕進度，而是讓簡單、做得到的習慣慢慢留在生活裡。';}
  else if(/仙加味，從萬華開始/.test(t)){a='仙加味從萬華一路走到今天，家裡四代都和鹿角、熬製與漢方飲食文化有關。2008年完成品牌註冊後，我們開始把熟悉的老工序整理成更容易理解的日常資訊。';b='如果有機會走到西昌街，歡迎看看我們怎麼把傳統留下，也怎麼把產品規格、使用方式與生活情境說得更清楚。';}
  else if(/有空，來萬華走走/.test(t)){a='西昌街是仙加味每天工作的地方，也是品牌故事最自然的起點。來店不用先懂很多，看看產品、聊聊規格與日常使用方式就好。';b='地址：台北市萬華區西昌街52號。若想確認營業時間或到店前先詢問，可由官方LINE聯繫。';}
  else if(/從萬華開始，也歡迎從萬華認識我們/.test(t)){a='從萬華開始，仙加味把四代累積的鹿角與熬製經驗，整理成今天更清楚的產品與生活內容。';b='老店的價值不只在「做很久」，而是在每一代都願意把熟悉的事情重新說明，讓下一個人更容易理解。';}
  else if(/四代做同一門工作/.test(t)){a='四代做同一門工作，留下的不只是手法，也包括看料、處理、火候與等待的判斷。';b='今天的仙加味把這些經驗整理成更清楚的規格與使用資訊，希望傳承不是一句口號，而是看得見的細節。';}
  else if(/傳統熬製/.test(t)){a='傳統熬製常談時間與火候，是因為前處理、加熱、濃縮與收尾都需要節奏。';b='我們不把工序說得神祕，而是把每個環節當成飲食文化的一部分，讓大家知道一份產品從原料到完成，大致經過哪些步驟。';}
  else if(/天氣悶熱/.test(t)){a='天氣悶熱時，外出最重要的是先把水帶好，依活動量分次補充，也替自己保留可以休息、避曬的空檔。';b='季節提醒不用複雜，從補水、防曬和調整步調開始，就是很實際的日常安排。';}
  else if(/下雨天/.test(t)){a='下雨天把行程放慢一點，留在室內喝杯溫熱飲、整理手邊的事，也是一種舒服的生活節奏。';b='雨天的日常不一定要特別做什麼，讓環境安靜下來，也讓自己有一點從容。';}
  else if(/早晚溫差/.test(t)){a='早晚溫差明顯時，外出多帶一件薄外套，喝水與飲食也依當天感受調整。';b='照顧生活節奏，很多時候就是把天氣變化放進今天的安排裡。';}
  else if(/四季日常節奏/.test(t)){a='季節一直在變，日常也可以跟著調整：春天整理步調、夏天留意清爽與補水、秋天回到規律、冬天多一些溫熱。';b='不用一次改很多，從每天做得到的小事開始，讓補養回到生活本身。';}
  else if(/用料看得懂/.test(t)){a='看產品時，原料、規格、包裝與保存方式都應該說得清楚。仙加味希望資訊是可以被理解、被比較，也可以慢慢確認的。';b='不誇大、不急著說服；先把資料整理好，讓每個人依自己的生活需求做選擇。';}
  else if(/想先試喝|試喝組|先試喝，再決定/.test(t)){a='第一次接觸龜鹿飲，可以先從30cc小玻璃罐試喝組開始：3罐試喝品免費，運費自付。';b='龜鹿飲為接單後製作，約5～7個工作天安排出貨。先確認口感與使用方式，再決定後續怎麼選，會更自在。';}
  else if(/運費與交期/.test(t)){a='龜鹿飲30cc試喝組提供3罐試喝品，試喝品免費、運費自付。';b='龜鹿飲採接單後製作，約5～7個工作天安排出貨；這項交期只適用龜鹿飲。';}
  else if(/LINE|下單前/.test(t)){a='規格、使用方式、試喝、製作交期或下單流程，如果還有不確定的地方，可以先從官方LINE問清楚。';b='先把需求說明白，再決定要哪一種產品，比急著下單更重要。';}
  else if(/30cc小玻璃罐與180cc鋁袋/.test(t)){a='同樣是龜鹿飲，30cc與180cc先從容量、包裝與生活情境來分。30cc是小玻璃罐，180cc是狹長鋁袋。';b='想輕巧攜帶可以先看30cc；想以較完整份量安排居家或工作空檔，可以再看180cc。';}
  else if(/龜鹿湯塊與龜鹿膠/.test(t)){a='龜鹿湯塊與龜鹿膠都是塊狀產品，但規格完全不同：湯塊是75g／盒、8塊裝；龜鹿膠是600g（1斤）／盒、32塊裝。';b='先把盒裝大小與每盒數量分清楚，再依料理方式與家庭使用習慣選擇，最不容易混淆。';}
  else if(/龜鹿飲、龜鹿膏、湯塊與龜鹿膠差在哪/.test(t)){a='龜鹿飲、龜鹿膏、龜鹿湯塊與龜鹿膠，是同一套飲食文化裡不同的日常型態：即飲、膏狀、較小盒塊狀與家庭大盒裝。';b='先看自己最常出現的生活場景，再看規格與使用方式，比只記產品名稱更容易選。';}
  else if(/六項產品/.test(t)){a='仙加味目前六項主產品，各自有清楚的型態與規格：龜鹿膏100g／罐、龜鹿飲30cc小玻璃罐、180cc鋁袋、龜鹿湯塊75g／盒8塊裝、龜鹿膠600g（1斤）／盒32塊裝、鹿茸粉75g／罐。';b='先把產品「是什麼」看清楚，再看怎麼放進自己的日常，選擇就會簡單很多。';}
  else if(/30cc/.test(t)){
    if(/保存/.test(t)){a='30cc龜鹿飲是小玻璃罐即飲型態。未開封依包裝標示、避免高溫與日光直射；開罐後就以儘速飲用為原則。';b='保存方式和包裝一起看，使用起來會更清楚，也不需要另外猜測。';}
    else if(/溫熱/.test(t)){a='30cc小玻璃罐可以直接飲用，也可以依自己的習慣做溫熱安排。';b='如果想喝溫一點，可用隔水方式慢慢加溫，不需要改變原本的小份量即飲節奏。';}
    else if(/5～7個工作天|等/.test(t)){a='龜鹿飲採接單後安排製作，所以30cc不是大量預先備貨後直接出貨。';b='完成製作後約5～7個工作天安排出貨；這項交期屬於龜鹿飲的製作流程。';}
    else if(/小玻璃罐|輕巧|包裝/.test(t)){a='30cc／罐（小玻璃罐），重點就在「小」與「即飲」：罐型小巧、裸罐呈現，拿取與攜帶都直觀。';b='先認清正式小玻璃罐外觀與容量，再把它放進外出、工作或日常飲用的情境裡理解。';}
    else if(/工作空檔|外出/.test(t)){a='30cc小玻璃罐份量輕巧，適合放進外出包、工作桌邊或行程空檔。';b='不用替產品設定一個固定時刻，依自己的使用習慣與作息安排即可。';}
    else {a='龜鹿飲30cc採小玻璃罐即飲型態，外觀小巧、拿取直接，是最容易從日常場景開始理解的規格。';b='需要時可直接飲用，也可以做溫熱安排；先看包裝與生活方式，再決定是否適合自己。';}
  }
  else if(/180cc/.test(t)){
    if(/保存/.test(t)){a='180cc龜鹿飲採鋁袋包裝。未開封依包裝標示保存，避免高溫與日光直射；開封後以儘速飲用為原則。';b='鋁袋和玻璃罐的使用感受不同，保存時也先從完整包裝與開封狀態來判斷。';}
    else if(/溫熱/.test(t)){a='180cc鋁袋可以直接飲用，也可依習慣隔水加熱或溫熱後飲用。';b='不需要把飲用固定在某個時段，依自己的生活節奏安排即可。';}
    else if(/接單後|5～7個工作天/.test(t)){a='180cc與30cc同屬龜鹿飲，都是接單後安排製作。';b='製作完成後約5～7個工作天安排出貨；這是龜鹿飲才適用的交期說明。';}
    else if(/狹長鋁袋|鋁袋/.test(t)){a='180cc／包採狹長直立鋁袋，和30cc小玻璃罐是兩種完全不同的包裝比例。';b='正式呈現時會維持鋁袋原本的狹長比例，不拉寬、不放大成巨大包裝；從真實外觀看使用情境最準確。';}
    else {a='180cc／包（鋁袋）屬於較完整份量的即飲型態，適合從居家、工作空檔等場景理解。';b='可直接飲用，也能依習慣做溫熱安排；先看容量與包裝，再決定怎麼放進自己的日常。';}
  }
  else if(/龜鹿膏/.test(t)){
    if(/第一次|半匙/.test(t)){a='第一次接觸龜鹿膏，可以先從少量開始觀察自己的使用習慣；若想更容易掌握，半匙是一個簡單的起點。';b='龜鹿膏100g／罐，可直接取用，也能用溫熱水化開，時間依個人作息安排。';}
    else if(/保存/.test(t)){a='龜鹿膏是罐裝膏狀產品，取用時保持器具乾淨，開罐後依正式保存資訊處理。';b='把取用與保存一起看，比只記住「100g／罐」更完整。';}
    else if(/直接吃|溫熱水/.test(t)){a='龜鹿膏100g／罐，可以直接取用，也可以用約100～300mL溫熱水化開後飲用。';b='兩種方式沒有高下之分，依自己的口感偏好與生活習慣安排即可。';}
    else if(/一天裡|固定節奏/.test(t)){a='龜鹿膏不需要鎖定在別人的固定時段，重點是找到自己願意長期維持的使用習慣。';b='100g罐裝適合放在固定的居家位置，依自己的作息安排取用。';}
    else {a='認識龜鹿膏，可以先看三件事：100g／罐、膏狀取用，以及可直接取用或搭配溫熱水。';b='先把型態與使用方式看清楚，再依自己的生活習慣安排，會比只記名稱更實際。';}
  }
  else if(/龜鹿膠/.test(t)){
    if(/18\.75|每塊/.test(t)){a='龜鹿膠600g（1斤）／盒，共32塊裝，換算每塊約18.75g。';b='這個數字是規格換算，方便理解每塊大約的份量；實際使用仍以產品型態與料理安排為主。';}
    else if(/家庭/.test(t)){a='龜鹿膠600g（1斤）／盒、32塊裝，是仙加味較大的家庭盒裝。';b='從家庭料理、分塊取用與固定備用來理解，比把它和75g龜鹿湯塊混在一起更清楚。';}
    else if(/熱水|料理/.test(t)){a='龜鹿膠除了放進家常湯品，也可依產品型態用熱水化開。';b='大盒裝的重點是分塊取用與家庭使用情境，依自己的料理習慣安排即可。';}
    else {a='龜鹿膠正式規格為600g（1斤）／盒、32塊裝，每塊約18.75g。';b='先把它和75g／盒的龜鹿湯塊分清楚，再看家庭料理與取用方式，資訊會比較不混亂。';}
  }
  else if(/鹿茸粉/.test(t)){
    if(/保存/.test(t)){a='鹿茸粉為75g／罐的粉狀產品。開封後留意密封、避免受潮與高溫，並依正式包裝資訊保存。';b='粉狀產品最怕保存環境混亂，固定一個乾燥、好拿取的位置會更方便。';}
    else if(/成分|資訊可以很簡單/.test(t)){a='鹿茸粉的產品資訊很直接：成分為鹿茸，規格75g／罐，粉狀型態。';b='資訊簡單不代表說明可以省略；把原料、規格與保存方式分開寫清楚，就是最基本的產品透明。';}
    else if(/調整份量|日常飲品/.test(t)){a='鹿茸粉75g／罐，粉狀型態讓使用方式保留較多彈性。';b='可依自己的飲食習慣搭配溫開水、牛奶、豆漿或其他日常飲品，不必把它固定成單一喝法。';}
    else {a='認識鹿茸粉，可以先從「單一原料、75g／罐、粉狀型態」三件事開始。';b='資訊愈簡單，愈適合把規格、保存與日常搭配說清楚。';}
  }
  else if(/龜鹿湯塊|湯塊/.test(t)){
    if(/家常湯|雞湯|排骨湯/.test(t)){a='龜鹿湯塊75g／盒、8塊裝，最直觀的情境就是放進熟悉的家常湯品。';b='雞湯、排骨湯等料理都可以從「一鍋湯怎麼搭配」去理解，不需要把傳統飲食文化說得很複雜。';}
    else if(/熱水|保溫壺/.test(t)){a='不煮湯時，龜鹿湯塊也可以從熱水、保溫壺等簡單方式理解塊狀產品的使用。';b='正式規格75g／盒、8塊裝，每塊約9.375g；依自己的飲食與料理習慣安排即可。';}
    else {a='龜鹿湯塊正式規格為75g／盒、8塊裝，每塊約9.375g。';b='先看盒裝與塊數，再看要用在熱水、保溫壺或家常湯品，產品型態就會很清楚。';}
  }
  else if(/料理，也是一種日常搭配/.test(t)){a='料理不一定要複雜。從雞湯、排骨湯等熟悉的家常味開始，就能理解龜鹿飲食文化為什麼會一直留在餐桌上。';b='把傳統放進今天的生活，不是照搬以前，而是找到自己願意做、也做得到的方式。';}
  else if(/溫熱飲食、燉煮文化/.test(t)){a='龜鹿文化和溫熱飲食、燉煮習慣一直有很深的連結。從湯品、熱水與慢火料理去看，會比只看產品名稱更容易理解。';b='仙加味想保留的是這份飲食文化的脈絡，再用今天更清楚的方式呈現。';}
  else if(/傳統龜鹿文化/.test(t)){a='傳統不一定等於難懂。把工序、產品型態、規格與生活情境拆開說明，龜鹿文化就能更貼近今天的日常。';b='我們保留傳承，也持續把說明方式做得更現代、更清楚。';}
  else if(/第一次認識龜鹿/.test(t)){a='第一次認識龜鹿，不必先背很多名詞。先看飲食文化、產品型態，再想自己平常的生活方式，會比較好理解。';b='把三件事分開看：它從哪裡來、現在有哪些形式、哪一種情境最接近自己的日常。';}
  else if(/為什麼有人把龜鹿放進日常/.test(t)){a='有人把龜鹿放進日常，通常不是因為追求複雜的儀式，而是找到自己習慣的型態與使用方式。';b='從即飲、膏狀到料理用塊狀產品，先理解生活情境，再看規格，選擇會更有方向。';}
  else if(/在家、外出、工作空檔/.test(t)||/生活方式開始/.test(t)){a='選產品前，可以先想自己最常出現的場景：在家、外出、工作空檔，或是家常料理。';b='從生活方式倒推產品型態，比先背名稱更容易，也比較不會買了之後不知道怎麼安排。';}
  else if(/一定要固定早上/.test(t)||/想怎麼安排/.test(t)){a='使用時間不需要照著別人的固定表。先看產品本身的使用方式，再依自己的作息與飲食習慣安排。';b='能自然放進生活、願意長期維持的節奏，比硬把自己綁在某個時刻更重要。';}
  else if(/把溫熱飲用/.test(t)||/想喝溫一點/.test(t)){a='有些日子想直接喝，有些時候想溫一點，都可以依自己的生活節奏調整。';b='龜鹿飲可直接飲用，也可以隔水加熱或溫熱後飲用；不必把喝法變成複雜規則。';}
  else if(/規格要寫得這麼清楚/.test(t)){a='容量、重量、包裝與每盒數量分開寫清楚，是避免產品被混在一起最簡單的方法。';b='30cc小玻璃罐、180cc鋁袋、75g湯塊與600g龜鹿膠，各自都有不同外觀與比例；規格清楚，圖片也才不會畫錯。';}
  else if(/保存方式先看清楚/.test(t)){a='不同產品型態，開封前後的保存方式也不一樣。先看包裝標示、是否已開封，再決定要放在哪裡。';b='保存資訊清楚，產品的日常使用才不需要靠猜。';}
  else if(/看產品，不只看名稱/.test(t)){a='看產品不只看名稱，也要把規格、成分、型態與使用方式分開確認。';b='資訊拆開後，才能真正比較不同產品，而不是只看包裝或一句宣傳。';}
  else if(/補養，是一種節奏/.test(t)){a='補養不需要照著別人的時間表。有人習慣在家慢慢安排，有人重視外出方便，也有人喜歡從料理開始。';b='找到適合自己的方式，讓它自然成為生活的一部分，就是仙加味想說的「節奏」。';}
  else {a=h?`${h}。`:t+'。';b='把規格、型態與生活情境分開看，資訊會更清楚，也比較容易找到適合自己的日常安排。';}
  return `${a}\n\n${b}\n\n${FOOTER}`;
}

const rebuilt=posts.map((p,i)=>{
  const copy=copyFor(p);
  const scene=sceneFor(p);
  const products=productsFor(p.title+' '+p.headline);
  return {
    id:p.id,
    order:i+1,
    original_status:p.status,
    title:p.title,
    headline:p.headline,
    category:p.category,
    copy,
    scene,
    mascot_pose:poseFor(scene),
    products,
    image_path:`images/posts/rebuild-v20260816/${p.id}.webp`,
    image_url:`https://ts15825868.github.io/xianjiawei/images/posts/rebuild-v20260816/${p.id}.webp`,
    image_alt:`仙加味小老闆｜${p.title}｜完整單一情境與正式產品原圖`,
    image_source:'2026-08-16角色設定基準鎖定｜小老闆使用使用者核准2D Q版母圖｜產品使用正式實物原圖等比例縮放｜非AI重畫產品｜人工待審核'
  };
});

for(const p of rebuilt){
  for(const word of blocked){if((p.title+p.headline+p.copy).includes(word))throw new Error(`blocked wording ${word}: ${p.id}`)}
}
const copies=rebuilt.map(p=>p.copy.replace(/\s+/g,' ').trim());
if(new Set(copies).size!==copies.length)throw new Error('duplicate rebuilt copy detected');
const paths=rebuilt.map(p=>p.image_path);
if(new Set(paths).size!==paths.length)throw new Error('duplicate image path detected');
if(rebuilt.length!==77)throw new Error(`expected 77 posts, got ${rebuilt.length}`);

const out={version:'2026-08-16-full-rebuild-v1-reference-locked',generated_at_utc:new Date().toISOString(),total:rebuilt.length,mascot_reference:'user-approved-20260816-character-sheet',product_rule:'formal real product artwork only; uniform scale; no AI redraw; 30cc small glass jar and 180cc pouch proportions locked',posts:rebuilt};
fs.writeFileSync('audits/full-rebuild-manifest-current.json',JSON.stringify(out,null,2)+'\n');
console.log(`PASS: built ${rebuilt.length} unique copies and ${new Set(paths).size} unique image targets.`);
