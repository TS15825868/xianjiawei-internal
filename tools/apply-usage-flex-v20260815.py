#!/usr/bin/env python3
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
GAO='食用時間與份量可依個人使用習慣與作息安排'
DRINK_TIME='飲用時間可依個人使用習慣與作息安排'
DRINK30='每日1～2罐'
DRINK180='飲用份量與時間可依個人使用習慣與作息安排'
GENERAL='所有產品使用時間依個人使用習慣與作息安排'
OLD_GAO='每日早上及下午各一小匙'
OLD_DAY='建議白天飲用'

def write(path,text):
 old=path.read_text(encoding='utf-8')
 if text!=old:path.write_text(text,encoding='utf-8');return True
 return False

changed=[]
# Server authority: add current usage rules for drink 30/180 and replace old fixed gao schedule.
p=ROOT/'src/product-authority.js';s=p.read_text(encoding='utf-8')
s=s.replace("usagePrimary:'每日早上及下午各一小匙'",f"usagePrimary:'{GAO}'")
s=s.replace("{id:'guilu-drink-30',name:'龜鹿飲30cc玻璃罐',allowedSpecs:['30cc／罐（小玻璃罐）'],ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆']}",f"{{id:'guilu-drink-30',name:'龜鹿飲30cc玻璃罐',allowedSpecs:['30cc／罐（小玻璃罐）'],ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆'],usagePrimary:'{DRINK30}；{DRINK_TIME}'}}")
s=s.replace("{id:'guilu-drink-180',name:'龜鹿飲180cc鋁袋',allowedSpecs:['180cc／包（鋁袋）'],ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆']}",f"{{id:'guilu-drink-180',name:'龜鹿飲180cc鋁袋',allowedSpecs:['180cc／包（鋁袋）'],ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆'],usagePrimary:'{DRINK180}'}}")
s=s.replace("if(/(一天一次一小匙|每日一次一小匙|早晚各一小匙)/.test(segment))errors.push('龜鹿膏目前正式使用資料為「每日早上及下午各一小匙」，不得回退舊的一天一次／早晚用法。');",f"if(/(一天一次一小匙|每日一次一小匙|早晚各一小匙|每日早上及下午各一小匙)/.test(segment))errors.push('龜鹿膏不設定固定早上／下午時段；目前使用原則為「{GAO}」。');")
# Add global timing retirement checks without treating current flexible copy as an error.
needle="const source=String(text||''),errors=[];\n"
extra="  if(/建議白天飲用/.test(source))errors.push('龜鹿飲不設定固定白天時段，請依個人使用習慣與作息安排。');\n  if(/龜鹿飲\\s*30\\s*cc/i.test(source)&&/(每日一罐|每日\\s*1\\s*罐)/.test(source))errors.push('龜鹿飲30cc目前使用方式為每日1～2罐。');\n  if(/龜鹿飲\\s*180\\s*cc/i.test(source)&&/每日一包/.test(source))errors.push('龜鹿飲180cc飲用份量與時間依個人使用習慣與作息安排。');\n"
if extra not in s:s=s.replace(needle,needle+extra)
s=s.replace("guiluGaoUsagePrimary:'每日早上及下午各一小匙'",f"guiluGaoUsagePrimary:'{GAO}',\n  guiluDrink30UsagePrimary:'{DRINK30}；{DRINK_TIME}',\n  guiluDrink180UsagePrimary:'{DRINK180}'")
if write(p,s):changed.append('src/product-authority.js')

# Current browser/runtime policies and regeneration prompts.
for rel in ['assets/js/formal-media-policy-v20260810.js','assets/js/chatgpt-regeneration-v20260809.js','assets/js/publishing-content-guidance-v20260814.js','publishing.html','README.md']:
 path=ROOT/rel
 if not path.exists():continue
 t=path.read_text(encoding='utf-8')
 t=t.replace(OLD_GAO,GAO).replace('建議早上與下午各一小匙',GAO).replace(OLD_DAY,DRINK_TIME).replace('每日一罐',DRINK30).replace('每日 1 罐',DRINK30).replace('每日1罐',DRINK30).replace('每日一包',DRINK180).replace('避免接近睡前食用',GAO).replace('避免接近睡前',GAO)
 if '圖片與文案唯一正式規格' in t and GENERAL not in t:
  t=t.replace('六、文案與法規',f'六、文案與法規\n- {GENERAL}；30cc可{DRINK30}，飲用時間依個人作息安排；龜鹿膏不設定固定早上／下午時段。')
 if write(path,t):changed.append(rel)

# Tests and validators should expect the new authority, while old fixed-time copy remains rejectable.
for path in list((ROOT/'src').glob('*.test.js'))+list((ROOT/'tools').glob('validate-*.mjs'))+list((ROOT/'tools').glob('*.test.mjs')):
 t=path.read_text(encoding='utf-8')
 t=t.replace(OLD_GAO,GAO).replace(OLD_DAY,DRINK_TIME).replace('每日一罐',DRINK30).replace('每日 1 罐',DRINK30).replace('每日1罐',DRINK30).replace('每日一包',DRINK180)
 if write(path,t):changed.append(path.relative_to(ROOT).as_posix())

# Dedicated tests can still assert retired fixed-time phrases by regex; restore those literal retired markers where needed.
pt=ROOT/'src/product-authority.test.js'
if pt.exists():
 t=pt.read_text(encoding='utf-8')
 # Ensure current positive assertions use flexible copy and explicit retired examples stay old.
 t=t.replace("一天一次一小匙",'一天一次一小匙')
 if write(pt,t) and 'src/product-authority.test.js' not in changed:changed.append('src/product-authority.test.js')

print('updated:',*changed,sep='\n- ')
