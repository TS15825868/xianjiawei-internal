#!/usr/bin/env python3
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[1]
GAO='食用時間與份量可依個人使用習慣與作息安排'
DRINK_TIME='飲用時間可依個人使用習慣與作息安排'
DRINK30='每日 1-2罐'
DRINK180='每日一包'
GENERAL='所有產品使用時間依個人使用習慣與作息安排'
OLD_GAO='每日早上及下午各一小匙'
OLD_DAY='建議白天飲用'

def write(path,text):
 old=path.read_text(encoding='utf-8')
 if text!=old:path.write_text(text,encoding='utf-8');return True
 return False

changed=[]

# Browser/runtime product authority. Keep 180cc amount, remove fixed time-of-day rules.
p=ROOT/'assets/js/product-authority-guard.js';s=p.read_text(encoding='utf-8')
s=s.replace("usagePrimary:'每日早上及下午各一小匙'",f"usagePrimary:'{GAO}'")
s=s.replace("ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆'],image:image('images/customer-display-v20260812/guilu-drink-30cc.avif')",f"ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆'],usagePrimary:'{DRINK30}；{DRINK_TIME}',image:image('images/customer-display-v20260812/guilu-drink-30cc.avif')")
s=s.replace("ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆'],image:image('images/customer-display-v20260812/guilu-drink-180cc-product.jpg')",f"ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆'],usagePrimary:'{DRINK180}；{DRINK_TIME}',image:image('images/customer-display-v20260812/guilu-drink-180cc-product.jpg')")
s=s.replace("guiluGaoUsagePrimary:'每日早上及下午各一小匙',",f"guiluGaoUsagePrimary:'{GAO}',\n    guiluDrink30UsagePrimary:'{DRINK30}；{DRINK_TIME}',\n    guiluDrink180UsagePrimary:'{DRINK180}；{DRINK_TIME}',")
s=s.replace("if(/(一天一次一小匙|每日一次一小匙|早晚各一小匙)/.test(segment))errors.push('龜鹿膏目前正式使用方式為「每日早上及下午各一小匙」。');",f"if(/(一天一次一小匙|每日一次一小匙|早晚各一小匙|每日早上及下午各一小匙)/.test(segment))errors.push('龜鹿膏不設定固定早上／下午時段；{GAO}。');")
needle="const value=String(text||''),errors=[];\n"
extra=f"    if(/建議白天飲用/.test(value))errors.push('龜鹿飲不設定固定白天時段；{DRINK_TIME}。');\n    for(const segment of productSegments(value,'龜鹿飲30cc玻璃罐'))if(/(每日一罐|每日\\s*1\\s*罐)/.test(segment))errors.push('龜鹿飲30cc目前使用方式為「{DRINK30}」；{DRINK_TIME}。');\n"
if extra not in s:s=s.replace(needle,needle+extra)
s=s.replace("note.textContent='目前正式主規格：龜鹿膏100g／罐；30cc／罐（小玻璃罐）；180cc／包（鋁袋）；龜鹿湯塊75g／盒｜8塊裝；龜鹿膠600g（1斤）／盒｜32塊裝；鹿茸粉75g／罐。龜鹿膏目前使用方式為每日早上及下午各一小匙。一般顧客產品圖使用customer-display；詳細DM、試喝海報與products-v3身份／比例參考分開。未知尺寸不猜、不拉伸。';",f"note.textContent='目前正式主規格：龜鹿膏100g／罐；30cc／罐（小玻璃罐）；180cc／包（鋁袋）；龜鹿湯塊75g／盒｜8塊裝；龜鹿膠600g（1斤）／盒｜32塊裝；鹿茸粉75g／罐。{GENERAL}；30cc為{DRINK30}；180cc保留{DRINK180}；龜鹿飲不設定固定白天時段。一般顧客產品圖使用customer-display；詳細DM、試喝海報與products-v3身份／比例參考分開。未知尺寸不猜、不拉伸。';")
s=s.replace("usage.value=`${item.usagePrimary}；初次可先從半匙開始；可直接取用或以約100～300mL溫熱水化開；避免接近睡前食用。`;","usage.value=item.id==='guilu-gao'?`${item.usagePrimary}；初次可先從半匙開始；可直接取用或以約100～300mL溫熱水化開。`:item.usagePrimary;")
if write(p,s):changed.append('assets/js/product-authority-guard.js')

# Client validator must validate the new authority while keeping old copy as rejected examples.
p=ROOT/'tools/validate-client-product-authority.mjs';v=p.read_text(encoding='utf-8')
v=v.replace("must(source.includes(\"usagePrimary:'每日早上及下午各一小匙'\"),'前端龜鹿膏主要使用資料必須是目前正式用法');",f"must(source.includes(\"usagePrimary:'{GAO}'\"),'前端龜鹿膏主要使用資料必須依個人習慣與作息');\nmust(source.includes(\"usagePrimary:'{DRINK30}；{DRINK_TIME}'\"),'前端30cc使用方式必須是目前確認版本');\nmust(source.includes(\"usagePrimary:'{DRINK180}；{DRINK_TIME}'\"),'前端180cc需保留每日一包並依個人作息安排時間');")
v=v.replace("must(source.includes('龜鹿膏目前正式使用方式為「每日早上及下午各一小匙」'),'前端必須把目前龜鹿膏用法設為權威值');",f"must(source.includes('龜鹿膏不設定固定早上／下午時段；{GAO}。'),'前端必須移除龜鹿膏固定早上／下午時段');\nmust(source.includes('龜鹿飲不設定固定白天時段'),'前端必須移除龜鹿飲固定白天時段');\nmust(source.includes('龜鹿飲30cc目前使用方式為「{DRINK30}」'),'前端必須拒絕30cc舊每日一罐用法');")
v=re.sub(r"console\.log\('PASS：前端產品權威.*?\);",f"console.log('PASS：前端產品權威已同步目前六項主規格與個人作息原則；龜鹿膏不鎖固定早晚、30cc為{DRINK30}、180cc保留{DRINK180}、龜鹿飲不鎖固定白天時段。');",v,flags=re.S)
if write(p,v):changed.append('tools/validate-client-product-authority.mjs')

# Product/runtime guidance only: do not rewrite negative-test literals globally.
for rel in ['assets/js/formal-media-policy-v20260810.js','assets/js/chatgpt-regeneration-v20260809.js','assets/js/publishing-content-guidance-v20260814.js','publishing.html','README.md']:
 path=ROOT/rel
 if not path.exists():continue
 t=path.read_text(encoding='utf-8')
 t=t.replace(OLD_GAO,GAO).replace('建議早上與下午各一小匙',GAO).replace(OLD_DAY,DRINK_TIME).replace('每日一罐',DRINK30).replace('每日 1 罐',DRINK30).replace('每日1罐',DRINK30).replace('每日1～2罐',DRINK30).replace('每日 1～2罐',DRINK30).replace('避免接近睡前食用',GAO).replace('避免接近睡前',GAO)
 if write(path,t):changed.append(rel)

# Deployment status is documentation of current Git authority; Cloudflare credentials remain unchanged.
p=ROOT/'cloudflare-deploy-current-status.json'
if p.exists():
 data=json.loads(p.read_text(encoding='utf-8'))
 auth=data.setdefault('current_product_authority',{})
 auth['guilu_gao_usage']=GAO
 auth['drink_30_usage']=f'{DRINK30}｜{DRINK_TIME}'
 auth['drink_180_usage']=f'{DRINK180}｜{DRINK_TIME}'
 data['updated_at_utc']='2026-08-14T16:35:00Z'
 if write(p,json.dumps(data,ensure_ascii=False,indent=2)+'\n'):changed.append('cloudflare-deploy-current-status.json')

# Hard checks against accidental rollback.
front=(ROOT/'assets/js/product-authority-guard.js').read_text(encoding='utf-8')
assert f"usagePrimary:'{GAO}'" in front
assert f"usagePrimary:'{DRINK30}；{DRINK_TIME}'" in front
assert f"usagePrimary:'{DRINK180}；{DRINK_TIME}'" in front
assert '龜鹿飲不設定固定白天時段' in front
server=(ROOT/'src/product-authority.js').read_text(encoding='utf-8')
assert f"guiluGaoUsagePrimary:'{GAO}'" in server
assert f"guiluDrink30UsagePrimary:'{DRINK30}；{DRINK_TIME}'" in server
assert f"guiluDrink180UsagePrimary:'{DRINK180}；{DRINK_TIME}'" in server
print('updated:',*changed,sep='\n- ')
