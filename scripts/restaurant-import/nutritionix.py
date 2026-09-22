"""Import a Nutritionix restaurant menu with explicit database provenance.
Usage: python scripts/restaurant-import/nutritionix.py slug 'Chain name'
Requires lxml and curl. Preserves rounded published numbers; skips missing macros.
"""
import json,re,unicodedata
from lxml import html
from pathlib import Path
OUT=Path('data/restaurant-foods')
def slugify(s):return re.sub('[^a-z0-9]+','-',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).strip('-')
def save(slug,chain,url,foods,date=None):
 seen=set();out=[]
 for f in foods:
  f['name']=' '.join(f['name'].replace('®','').replace('™','').split());id=slugify(f['name']+' '+f['servingLabel']);key=(id,f['calories'],f['protein'],f['carbs'],f['fat'])
  if key in seen:continue
  seen.add(key);f['id']=id
  if id in [x['id'] for x in out]:f['id']=id+'-'+str(len(out))
  out.append(f)
 data=dict(chain=chain,sourceUrl=url,retrievedAt='2026-09-20',foods=out)
 if date:data['sourceDate']=date
 (OUT/(slug+'.json')).write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n');print(slug,len(out))
def txt(e):return ' '.join(' '.join(e.itertext()).split())
def num(s):return float(re.search(r'\d+(?:\.\d+)?',s.replace(',','')).group())

import subprocess,concurrent.futures,sys
def get(item):
 key,chain=item;url='https://www.nutritionix.com/'+key+'/menu/premium';path=Path('work/restaurant-regional/'+key+'-nix.html')
 if not path.exists():
  p=subprocess.run(['curl','-sSL','-A','Mozilla/5.0','--max-time','30','--fail',url,'-o',str(path)],capture_output=True)
  if p.returncode:return key,0,'fetch '+str(p.returncode)
 try:
  s=html.fromstring(path.read_text());fields={a.get('href','').split('sort=')[-1]:i for i,a in enumerate(s.xpath('//table[contains(@class,"tblCompare")]/thead//th//a'))};foods=[]
  if not all(k in fields for k in ['calories','total_fat','total_carb','protein']):return key,0,'no table'
  for r in s.xpath('//table[contains(@class,"tblCompare")]/tbody//tr'):
   a=r.xpath('.//a[contains(@class,"nmItem")]');cells=r.xpath('./td[contains(@class,"col")]')
   if not a or not cells:continue
   vals=[txt(cells[fields[k]-1]) for k in ['calories','total_fat','total_carb','protein']]
   if any(not re.fullmatch(r'\d+(?:\.\d+)?',v) for v in vals):continue
   c,f,ca,p=map(float,vals);foods.append(dict(name=txt(a[0]),servingLabel='1 menu serving (size in name)',calories=c,fat=f,carbs=ca,protein=p))
  if not foods:return key,0,'no complete values'
  save(key,chain,url,foods)
  out=OUT/(key+'.json');data=json.loads(out.read_text());data['source']='Nutritionix';data['sourceKind']='database'
  published=re.search(r'Last Updated:\s*(\d\d/\d\d/\d{4})',txt(s))
  if published:data['sourceDate']=published[1][6:]+'-'+published[1][:2]+'-'+published[1][3:5]
  quarantine=Path('docs/restaurant-import/regional-quarantine.json')
  if quarantine.exists():
   held=[r['food'] for r in json.loads(quarantine.read_text())['rows'] if r['sourceUrl']==url]
   data['foods']=[f for f in data['foods'] if not any(all(f.get(k)==h.get(k) for k in ['name','calories','fat','carbs','protein']) for h in held)]
  out.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
  return key,len(data['foods']),'ok'
 except Exception as e:return key,0,str(e)

if __name__ == '__main__':
 if len(sys.argv) != 3:
  raise SystemExit("usage: nutritionix.py SLUG 'Chain name'")
 Path('work/restaurant-regional').mkdir(parents=True, exist_ok=True)
 result=get((sys.argv[1],sys.argv[2]))
 print(result)
 if not result[1]:raise SystemExit(1)
