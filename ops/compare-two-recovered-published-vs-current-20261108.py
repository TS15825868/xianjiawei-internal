import os,json,hashlib,io,urllib.request,urllib.parse
from pathlib import Path
from PIL import Image
cfg=json.loads(Path('ops/request-compare-two-recovered-published-media-20261108.json').read_text())
assert cfg['schema']=='xjw-current-pending-vs-two-recovered-published-v1' and not cfg['allowD1Writes'] and not cfg['allowPublishing']
account=os.environ['CLOUDFLARE_ACCOUNT_ID'];token=os.environ['CLOUDFLARE_API_TOKEN']
import re
wrangler=Path('wrangler.jsonc').read_text()
db=re.search(r'"database_id"\s*:\s*"([a-f0-9-]+)"',wrangler).group(1)
sql="""SELECT p.id,p.title,p.image_url,p.status,p.image_quality_status,
 r.id as latest_review_id,r.image_sha256 as review_image_sha256,
 r.decision as review_decision,r.content_fingerprint as review_fingerprint
 FROM social_posts p LEFT JOIN social_post_quality_reviews r
 ON r.id=(SELECT x.id FROM social_post_quality_reviews x WHERE x.post_id=p.id ORDER BY x.reviewed_at DESC LIMIT 1)
 WHERE p.status='pending_review' ORDER BY p.id"""
url='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query'
req=urllib.request.Request(url,data=json.dumps({'sql':sql}).encode(),headers={'authorization':'Bearer '+token,'content-type':'application/json'},method='POST')
with urllib.request.urlopen(req,timeout=30) as response:payload=json.load(response)
assert payload['success'] and payload['result'][0]['success']
pending=payload['result'][0]['results']
assert len(pending)==68,('Unexpected D1 pending count: do not make stale dedup conclusions',len(pending))
def hash_file(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def dhash(path):
 with Image.open(path) as raw:
  im=raw.convert('L').resize((9,8),Image.Resampling.LANCZOS)
  value=0
  for y in range(8):
   for x in range(8):value=(value<<1)|(1 if im.getpixel((x,y))>im.getpixel((x+1,y)) else 0)
  return value
ref=[
('4003809463882866913_78424002938','assets/historical-published/instagram/2026-10-09/4003809463882866913_78424002938.jpg','b25f76805c3637883769d514a3e0428f87f2e0032902c311c86ae27ecdceeb90'),
('4003900963899413608_78424002938','assets/historical-published/instagram/2026-10-09/4003900963899413608_78424002938.jpg','151266c7d292d9d50e1bd13568781d5a9f0c8dbc3c7227be0d6056e0ba55594a')]
sources=[]
for id,filename,sha in ref:
 p=Path(filename)
 assert p.is_file() and hash_file(p)==sha,('Published historical mirror SHA mismatch: stop',id)
 sources.append({'postId':id,'path':filename,'sha256':sha,'dhash':format(dhash(p),'016x')})
rows=[]
for row in pending:
 id=row['id'];u=row.get('image_url') or ''
 item={'id':id,'title':row.get('title'),'imageURL':u,'quality':row.get('image_quality_status'),'aiDecision':row.get('review_decision'),'imageSHA256':None,'currentImageVerified':False,'latestAiImageHashMatched':False,'distances':[]}
 try:
  parsed=urllib.parse.urlsplit(u)
  if parsed.netloc!='raw.githubusercontent.com' or not parsed.path.startswith('/TS15825868/xianjiawei-internal/main/'):raise ValueError('non-local image URL host/path')
  local=urllib.parse.unquote(parsed.path.split('/main/',1)[1])
  source=Path(local)
  if not source.is_file():raise ValueError('Image path not tracked in GitHub main checkout')
  checksum=hash_file(source)
  item['imageSHA256']=checksum
  if checksum!=row.get('review_image_sha256'):raise ValueError('Current image SHA differs from latest AI review')
  item['currentImageVerified']=True;item['latestAiImageHashMatched']=True
  d=dhash(source);item['dhash']=format(d,'016x')
  item['distances']=sorted([{'publishedPost':s['postId'],'hamming64':(d^int(s['dhash'],16)).bit_count()} for s in sources],key=lambda x:x['hamming64'])
  item['lowestHamming64']=item['distances'][0]['hamming64']
 except Exception as e:item['blocker']=str(e)[:180]
 rows.append(item)
valid=[r for r in rows if r['currentImageVerified']]
sortedCandidates=sorted(valid,key=lambda x:x['lowestHamming64'])
summary={'schema':cfg['schema'],'checkedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'baseCommit':os.environ.get('GITHUB_SHA'),'sources':sources,'pendingCount':len(pending),'verifiedCurrentImageCount':len(valid),'imageMissingOrVersionMismatched':len(pending)-len(valid),'exactOriginalByteDuplicates':sum(any(d['publishedPost']==s['postId'] and r['imageSHA256']==s['sha256'] for d in r['distances'] for s in sources) for r in valid),'withinPerceptualHamming12':sum(r['lowestHamming64']<=12 for r in valid),'withinPerceptualHamming16':sum(r['lowestHamming64']<=16 for r in valid),'closestToTwoRecoveredImages':[{'id':r['id'],'distance':r['lowestHamming64'],'closestPublished':r['distances'][0]['publishedPost']} for r in sortedCandidates[:20]],'allRows':rows,'scope':'Two exactly recovered previously inaccessible 2026-10-09 IG historical published photos vs all currently pending D1 images. Not a complete 178-image history review and does not certify semantic nonduplication.','d1Mutations':0,'aiApprovals':0,'manualApprovals':0,'schedules':0,'publications':0}
Path('compare-two-published-vs-current-report.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print('TWO_PUBLISHED_VS_CURRENT_68',json.dumps({k:summary[k] for k in ['pendingCount','verifiedCurrentImageCount','imageMissingOrVersionMismatched','exactOriginalByteDuplicates','withinPerceptualHamming12','withinPerceptualHamming16','closestToTwoRecoveredImages']},ensure_ascii=False))
