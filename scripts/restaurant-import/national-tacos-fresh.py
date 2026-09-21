"""Reviewed official Tacos 4 Life and Fresh Monkee extraction."""
from pathlib import Path
import re,pathlib,json
P=pathlib.Path('work/restaurant-national');O=pathlib.Path('data/restaurant-foods')
def save(k,c,url,date,rows):
 for f in rows:f['id']=re.sub('[^a-z0-9]+','-',f['name'].lower()).strip('-')
 (O/(k+'.json')).write_text(json.dumps(dict(chain=c,sourceUrl=url,sourceDate=date,retrievedAt='2026-09-20',foods=rows),indent=2,ensure_ascii=False)+'\n');print(k,len(rows))
rows=[]
for line in Path(__file__).with_name('national-tacos-reviewed.txt').read_text().splitlines():
 n,ca,fa,cb,pr=line.split('|');label='1 taco' if n.startswith('Tacos -') else '1 whole family pack' if n.startswith('Family Pack -') else '1 menu serving (size in item name)'
 rows.append(dict(name=n,calories=float(ca),fat=float(fa),carbs=float(cb),protein=float(pr),servingLabel=label))
save('tacos-4-life','Tacos 4 Life','https://cdn.prod.website-files.com/6058f6299e37a624883ccdf6/6410a88f681c3d32d93b7c59_NutritionalGuideMarch2023_smaller.pdf','2023-03',rows)
rows=[];name=''
for line in (P/'fresh-monkee.txt').read_text().splitlines():
 m=re.match(r'^(\d+ (?:oz\.|ball)) (.+)$',line)
 if m:
  v=m[2].split()
  if len(v)!=11:continue
  try:ca,fa,cb,pr=[float(v[i]) for i in [0,2,7,10]]
  except:continue
  if name=='PUPPY SHAKE':continue
  rows.append(dict(name=name.title()+' - '+m[1],calories=ca,fat=fa,carbs=cb,protein=pr,servingLabel=m[1]+(' (unsweetened almond milk base unless specified)' if 'oz.' in m[1] else '')))
 elif line.isupper() and len(line)>4 and not any(v in line for v in ['HIGH FIBER','SERVING CAL','CALORIES','SIZE FROM','NNUUT','LLea']):name=line
save('fresh-monkee','Fresh Monkee','https://freshmonkee.com/wp-content/uploads/2026/06/Fresh-Monkee-Nutrition-Guide.pdf','2026-06',rows)
