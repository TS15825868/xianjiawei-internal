import json,os,math,pathlib,urllib.request,re
from PIL import Image,ImageOps,ImageDraw,ImageFont
cfg=json.loads(pathlib.Path('ops/request-near-visual-pairs-review-20261108.json').read_text())
if cfg.get('schema')!='xjw-inspect-12-near-perceptual-pairs-v1' or cfg.get('readOnly') is not True or cfg.get('allowReviewDecisionWrite') is not False or cfg.get('allowDelete') is not False or cfg.get('allowPublish') is not False or cfg.get('sourceRun')!=42479318932:
 raise RuntimeError('Unsafe visual check request')
source=pathlib.Path('near-source/current-vs-archived-visual-report.json')
report=json.loads(source.read_text());pairs=report.get('imageNearPairs',[])
if len(pairs)!=12 or report['pendingScanned']!=68 or report['exactFileDuplicates']!=0:raise RuntimeError('Unexpected source report; do not inspect incorrect identities')
out=pathlib.Path('near-pair-review');out.mkdir(exist_ok=True)
acct=os.environ.get('CLOUDFLARE_ACCOUNT_ID');token=os.environ.get('CLOUDFLARE_API_TOKEN')
db=re.search(r'"database_id"\s*:\s*"([a-f0-9-]+)"',pathlib.Path('wrangler.jsonc').read_text()).group(1)
if not acct or not token:raise RuntimeError('D1 credentials missing')
dburl=f'https://api.cloudflare.com/client/v4/accounts/{acct}/d1/database/{db}/query'
sql="SELECT id,title,copy,status,image_url FROM social_posts WHERE status IN ('pending_review','archived','published') ORDER BY id"
req=urllib.request.Request(dburl,data=json.dumps({'sql':sql}).encode(),method='POST',headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
with urllib.request.urlopen(req,timeout=45) as resp:payload=json.load(resp)
if payload.get('success') is not True or payload['result'][0].get('success') is not True:raise RuntimeError('D1 query failed')
rows=payload['result'][0]['results'];byId={x['id']:x for x in rows}
if len(rows)!=sum(int(x['count']) for x in report['counts']):raise RuntimeError('D1 total count drift')
prefix='https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/'
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
contents=[]
def image_of(p,approved):
 if not p.startswith(('assets/post-images/','media/social-candidates/')) or '..' in pathlib.Path(p).parts:raise RuntimeError('Unapproved image path')
 if not approved.startswith(prefix) or approved[len(prefix):]!=p:raise RuntimeError('D1 image path changed; requires fresh audit')
 with Image.open(p) as im:return ImageOps.contain(ImageOps.exif_transpose(im).convert('RGB'),(550,455))
for n,pair in enumerate(pairs):
 a=byId.get(pair['current']);b=byId.get(pair['reference'])
 if not a or not b or a['status']!='pending_review' or b['status']!=pair['referenceStatus']:raise RuntimeError('D1 pair statuses/ids changed')
 left=image_of(pair['currentPath'],a['image_url']);right=image_of(pair['referencePath'],b['image_url'])
 card=Image.new('RGB',(1140,548),'#f7f4ed');draw=ImageDraw.Draw(card)
 for x,img in [(10,left),(580,right)]:card.paste(img,(x+(550-img.width)//2,9+(455-img.height)//2))
 for i,(id,value) in enumerate([(a['id'],0),(b['id'],570)]):
  draw.text((12+value,472),f'#{n+1:02} '+id[:43],fill='#102841',font=font)
 draw.text((12,501),f'dHash {pair["dhash64"]} / aHash {pair["averageHash64"]}  exact={pair["exactFile"]}',fill='#51252b',font=font)
 draw.line([(570,0),(570,548)],fill='#c5bda9',width=3)
 contents.append({'index':n+1,'current':{'id':a['id'],'title':a['title'],'copy':a['copy'],'path':pair['currentPath']},'reference':{'id':b['id'],'title':b['title'],'copy':b['copy'],'status':b['status'],'path':pair['referencePath']},'dHash64':pair['dhash64'],'aHash64':pair['averageHash64'],'exact':pair['exactFile']})
 sheetno=n//4;offset=n%4
 if offset==0:
  canvas=Image.new('RGB',(1140,548*4),'#f7f4ed')
 canvas.paste(card,(0,548*offset))
 if offset==3 or n==len(pairs)-1:
  canvas.save(out/f'pair-sheet-{sheetno+1:02}.jpg',quality=87,optimize=True)
(out/'pair-current-captions.json').write_text(json.dumps({'sourceRun':42479318932,'runTime':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'pairs':contents,'d1Writes':0,'approvals':0,'publications':0,'deletions':0},ensure_ascii=False,indent=2)+'\n')
print('PAIR_CONTACT_SHEETS',json.dumps({'pairs':len(contents),'sheets':math.ceil(len(contents)/4),'ids':[x['current']['id']+' VS '+x['reference']['id'] for x in contents]},ensure_ascii=False))
