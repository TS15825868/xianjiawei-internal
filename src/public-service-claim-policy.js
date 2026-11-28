// Current public promotional claims only; does not change legally required disclosure or internal logistics.
const PUBLIC_SERVICE_CLAIM=/營業時間|門市時間|門市營業|實體門市|門市地址|店面地址|門市導航|門市自取|到店取貨|到店自取|現場販售|預約取貨|預約面交|固定取貨|固定自取|歡迎來店|歡迎到店|歡迎到門市|週日公休|週六.{0,8}(?:取貨|自取|面交)|(?:10[:：]00\s*[-－–—~～至]\s*20[:：]00|09[:：]30\s*[-－–—~～至]\s*18[:：]30)|(?:可|能|歡迎|接受|開放|支援|安排|提供)(?:以|預約|現場|到店|門市|直接|親自){0,2}(?:自取|面交|取貨)|自行製造|自家工廠|自有工廠|食品製造工廠/u;
export function hasUnconfirmedPublicServiceClaim(value){return PUBLIC_SERVICE_CLAIM.test(String(value??'').normalize('NFKC'));}
