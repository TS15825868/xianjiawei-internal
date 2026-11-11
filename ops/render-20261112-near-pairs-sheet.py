from PIL import Image,ImageOps,ImageDraw
import json,hashlib
from pathlib import Path
r=json.loads(Path('ops/receipts/20261112-current-vs-archived-all-49.json').read_text())
pairs=r['imageNearPairs']
assert r['pendingScanned']==49 and len(pairs)==10 and r['exactFileDuplicates']==0
w,h=1280,330
canvas=Image.new('RGB',(w,h*len(pairs)),(247,244,237))
draw=ImageDraw.Draw(canvas)
def fit(path,box):
 p=Path(path)
 if not p.is_file() or '..' in p.parts:raise RuntimeError('source missing or unsafe')
 with Image.open(p) as img:
  im=ImageOps.exif_transpose(img).convert('RGB')
  im.thumbnail((610,275))
  x,y=box
  canvas.paste(im,(x+(610-im.width)//2,y+(275-im.height)//2))
for i,p in enumerate(pairs):
 y=i*h
 fit(p['currentPath'],(10,y+40))
 fit(p['referencePath'],(650,y+40))
 draw.text((10,y+7),f"{i+1}. PENDING {p['current'][:44]}",fill=(10,31,59))
 draw.text((650,y+7),f"{p['referenceStatus'].upper()} {p['reference'][:45]}",fill=(10,31,59))
 draw.text((540,y+312),f"dHash {p['dhash64']} | aHash {p['averageHash64']}",fill=(90,20,20))
out=Path('ops/visual-review/20261112-10-near-pairs-sheet.jpg')
out.parent.mkdir(parents=True,exist_ok=True)
canvas.save(out,quality=88)
print(json.dumps({'pairs':len(pairs),'file':str(out),'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}))
