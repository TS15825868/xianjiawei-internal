#!/usr/bin/env python3
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[1]
GAO='食用時間可依個人使用習慣與作息時間安排'
DRINK_TIME='飲用時間可依個人使用習慣與作息時間安排'
DRINK30='每日 1-2罐'
DRINK180='每日一包'
GENERAL='所有產品的使用時間依個人使用習慣與作息時間安排'
OLD_GAO=('每日早上及下午各一小匙','建議早上與下午各一小匙','一般建議早上與下午各一小匙','早晚各一小匙','一天一次一小匙','每日一次一小匙')

def write(path,text):
 old=path.read_text(encoding='utf-8')
 if text!=old:path.write_text(text,encoding='utf-8');return True
 return False
changed=[]

def replace_current(text):
 out=text
 for old in OLD_GAO: out=out.replace(old,GAO)
 out=out.replace('食用時間與份量可依個人使用習慣與作息安排',GAO)
 out=out.replace('食用時間可依個人使用習慣與作息安排',GAO)
 out=out.replace('建議白天飲用',DRINK_TIME)
 out=out.replace('飲用時間可依個人使用習慣與作息安排',DRINK_TIME)
 out=out.replace('所有產品使用時間依個人使用習慣與作息安排',GENERAL)
 out=out.replace('所有產品使用時間依個人使用習慣與作息時間安排',GENERAL)
 out=out.replace('每日一罐',DRINK30).replace('每日1罐',DRINK30).replace('每日 1 罐',DRINK30).replace('每日1～2罐',DRINK30).replace('每日 1～2罐',DRINK30)
 return out

# Server-side D1/publishing product authority.
p=ROOT/'src/product-authority.js';s=replace_current(p.read_text(encoding='utf-8'))
s=s.replace("{id:'guilu-drink-30',name:'龜鹿飲30cc玻璃罐',allowedSpecs:['30cc／罐（小玻璃罐）'],ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆']}",f"{{id:'guilu-drink-30',name:'龜鹿飲30cc玻璃罐',allowedSpecs:['30cc／罐（小玻璃罐）'],ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆'],usagePrimary:'{DRINK30}；{DRINK_TIME}'}}")
s=s.replace("{id:'guilu-drink-180',name:'龜鹿飲180cc鋁袋',allowedSpecs:['180cc／包（鋁袋）'],ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆']}",f"{{id:'guilu-drink-180',name:'龜鹿飲180cc鋁袋',allowedSpecs:['180cc／包（鋁袋）'],ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆'],usagePrimary:'{DRINK180}；{DRINK_TIME}'}}")
s=s.replace("if(/建議白天飲用/.test(source))errors.push('龜鹿飲不設定固定白天時段；飲用時間請依個人使用習慣與作息安排。');",f"if(/建議白天飲用/.test(source))errors.push('龜鹿飲不設定固定白天時段；{DRINK_TIME}。');")
s=s.replace("errors.push('龜鹿膏不設定固定早上／下午時段；食用時間與份量可依個人使用習慣與作息安排。')",f"errors.push('龜鹿膏不設定固定早上／下午時段；{GAO}。')")
s=s.replace("errors.push('龜鹿飲30cc目前使用方式為「每日 1-2罐」；飲用時間依個人使用習慣與作息安排。')",f"errors.push('龜鹿飲30cc目前使用方式為「{DRINK30}」；{DRINK_TIME}。')")
s=s.replace("guiluGaoUsagePrimary:'食用時間與份量可依個人使用習慣與作息安排'",f"guiluGaoUsagePrimary:'{GAO}'")
s=s.replace("guiluDrink30UsagePrimary:'每日 1-2罐；飲用時間可依個人使用習慣與作息安排'",f"guiluDrink30UsagePrimary:'{DRINK30}；{DRINK_TIME}'")
s=s.replace("guiluDrink180UsagePrimary:'每日一包；飲用時間可依個人使用習慣與作息安排'",f"guiluDrink180UsagePrimary:'{DRINK180}；{DRINK_TIME}'")
if write(p,s):changed.append('src/product-authority.js')

# Client ERP/publishing product authority.
p=ROOT/'assets/js/product-authority-guard.js';s=replace_current(p.read_text(encoding='utf-8'))
s=s.replace("usagePrimary:'食用時間與份量可依個人使用習慣與作息安排'",f"usagePrimary:'{GAO}'")
s=s.replace("usagePrimary:'每日 1-2罐；飲用時間可依個人使用習慣與作息安排'",f"usagePrimary:'{DRINK30}；{DRINK_TIME}'")
s=s.replace("usagePrimary:'每日一包；飲用時間可依個人使用習慣與作息安排'",f"usagePrimary:'{DRINK180}；{DRINK_TIME}'")
s=s.replace("guiluGaoUsagePrimary:'食用時間與份量可依個人使用習慣與作息安排'",f"guiluGaoUsagePrimary:'{GAO}'")
s=s.replace("guiluDrink30UsagePrimary:'每日 1-2罐；飲用時間可依個人使用習慣與作息安排'",f"guiluDrink30UsagePrimary:'{DRINK30}；{DRINK_TIME}'")
s=s.replace("guiluDrink180UsagePrimary:'每日一包；飲用時間可依個人使用習慣與作息安排'",f"guiluDrink180UsagePrimary:'{DRINK180}；{DRINK_TIME}'")
s=s.replace('飲用時間可依個人使用習慣與作息安排',DRINK_TIME).replace('食用時間與份量可依個人使用習慣與作息安排',GAO)
s=s.replace('所有產品使用時間依個人使用習慣與作息安排',GENERAL)
if write(p,s):changed.append('assets/js/product-authority-guard.js')

# Regeneration/publishing guidance must feed ChatGPT the same current rule.
for rel in ['assets/js/formal-media-policy-v20260810.js','assets/js/chatgpt-regeneration-v20260809.js','assets/js/publishing-content-guidance-v20260814.js','publishing.html','README.md']:
 path=ROOT/rel
 if path.exists() and write(path,replace_current(path.read_text(encoding='utf-8'))):changed.append(rel)

# Validators: positive authority follows current wording, old fixed phrases remain present only as reject examples.
p=ROOT/'tools/validate-client-product-authority.mjs';v=p.read_text(encoding='utf-8')
v=v.replace("usagePrimary:'食用時間與份量可依個人使用習慣與作息安排'",f"usagePrimary:'{GAO}'")
v=v.replace("usagePrimary:'每日 1-2罐；飲用時間可依個人使用習慣與作息安排'",f"usagePrimary:'{DRINK30}；{DRINK_TIME}'")
v=v.replace("usagePrimary:'每日一包；飲用時間可依個人使用習慣與作息安排'",f"usagePrimary:'{DRINK180}；{DRINK_TIME}'")
v=v.replace('龜鹿膏不設定固定早上／下午時段；食用時間與份量可依個人使用習慣與作息安排。',f'龜鹿膏不設定固定早上／下午時段；{GAO}。')
v=v.replace('飲用時間可依個人使用習慣與作息安排',DRINK_TIME)
if write(p,v):changed.append('tools/validate-client-product-authority.mjs')

p=ROOT/'src/product-authority.test.js';t=p.read_text(encoding='utf-8')
t=t.replace("PRODUCT_AUTHORITY.guiluGaoUsagePrimary,'食用時間與份量可依個人使用習慣與作息安排'",f"PRODUCT_AUTHORITY.guiluGaoUsagePrimary,'{GAO}'")
t=t.replace('食用時間與份量可依個人使用習慣與作息安排',GAO).replace('飲用時間可依個人使用習慣與作息安排',DRINK_TIME)
# Restore old fixed copy literals when they are intentionally used as negative tests.
if '每日早上及下午各一小匙' not in t:
 t=t.replace("assert.ok(validatePublicProductText('龜鹿膏：一天一次一小匙').length>0", "assert.ok(validatePublicProductText('龜鹿膏：一天一次一小匙').length>0")
if write(p,t):changed.append('src/product-authority.test.js')

# Deployment status documents verified Git authority only; Cloudflare blocker remains.
p=ROOT/'cloudflare-deploy-current-status.json'
if p.exists():
 data=json.loads(p.read_text(encoding='utf-8')); auth=data.setdefault('current_product_authority',{})
 auth['guilu_gao_usage']=GAO; auth['drink_30_usage']=f'{DRINK30}｜{DRINK_TIME}'; auth['drink_180_usage']=f'{DRINK180}｜{DRINK_TIME}'; data['updated_at_utc']='2026-08-14T16:45:00Z'
 if write(p,json.dumps(data,ensure_ascii=False,indent=2)+'\n'):changed.append('cloudflare-deploy-current-status.json')

server=(ROOT/'src/product-authority.js').read_text(encoding='utf-8'); front=(ROOT/'assets/js/product-authority-guard.js').read_text(encoding='utf-8')
for blob in (server,front):
 assert GAO in blob and f'{DRINK30}；{DRINK_TIME}' in blob and f'{DRINK180}；{DRINK_TIME}' in blob
assert '食用時間與份量可依個人使用習慣與作息安排' not in server
assert '食用時間與份量可依個人使用習慣與作息安排' not in front
print('updated:',*changed,sep='\n- ')
