"""Import national Nutritionix rounded public tables; run from repository root.

Dependencies: requests, beautifulsoup4, ftfy. Review quarantine results before
regenerating database migrations. --fetch refreshes cached source HTML.
"""
import pathlib,json,re,collections,bs4,ftfy
P=pathlib.Path('work/restaurant-national');OUT=pathlib.Path('data/restaurant-foods')
def clean(s):return ' '.join(ftfy.fix_text(str(s)).replace('®','').replace('™','').split()).strip(' †*')
alcohol=re.compile(r'beer|wine|cocktail|alcohol|margarita|cantina|las vegas|spirit|draft|shooter|hootera|tropical|long island|bombs away|classics|mixed shots|straight shots|bourbon|brew|hard seltzer|mimosa|from the bar|social hour',re.I)
def parse(key,chain):
 source='https://www.nutritionix.com/'+key+'/menu/premium';s=bs4.BeautifulSoup((P/(key+'-premium.html')).read_text(),'html.parser');rows=[];excluded=[];category=''
 fields={re.sub(r'^.*?sort=','',x.get('href','')):i for i,x in enumerate(s.select('.tblCompare thead th a'))}
 for r in s.select('.tblCompare tbody tr'):
  h=r.find('h3')
  if h:category=clean(h.get_text(' ',strip=True))
  a=r.select_one('a.nmItem');cells=r.select('td.col')
  if not a or not cells:continue
  def value(field):return cells[fields[field]-1].get_text(' ',strip=True).replace(',','')
  def number(v):
   if not re.fullmatch(r'\d+(\.\d+)?',v):raise ValueError('nonexact nutrient: '+v)
   f=float(v);return int(f) if f.is_integer() else f
  name=clean(a.get_text(' ',strip=True));raw={k:value(v) for k,v in [('calories','calories'),('protein','protein'),('carbs','total_carb'),('fat','total_fat')]};reason=None
  try:n={k:number(v) for k,v in raw.items()}
  except ValueError as e:reason=str(e)
  if not reason:
   macro=n['protein']*4+n['carbs']*4+n['fat']*9
   if abs(macro-n['calories'])>max(80,n['calories']*.35) and not alcohol.search(category) and not re.search(r'Margarita|Dracula.s Juice',name,re.I):reason='Nonalcohol nutrient/calorie inconsistency exceeds both 80 kcal and 35%; not corrected by guessing.'
   if 'saturated_fat' in fields:
    try:
     sat=number(value('saturated_fat'))
     if sat>n['fat']+1:reason='Published saturated fat exceeds total fat by more than rounding tolerance.'
    except:pass
  if reason:excluded.append(dict(chain=chain,sourceUrl=source,name=name,category=category,published=raw,reason=reason));continue
  nid=re.search(r'-(?:item|ingredient)-(\d+)-',a.get('id',''))
  rows.append(dict(id='nutritionix-'+nid[1],name=name,**n,servingLabel='1 listed serving ('+category+'; size in item name)',_category=category))
 seen=set();unique=[];byname=collections.defaultdict(set)
 for r in rows:byname[r['name']].add(tuple(r[x] for x in ['calories','protein','carbs','fat']))
 for r in rows:
  if r['id'] in seen:continue
  seen.add(r['id'])
  if len(byname[r['name']])>1:r['name']=r['_category']+' - '+r['name']
  del r['_category'];unique.append(r)
 if not unique:raise ValueError('No complete usable foods; existing catalog not overwritten')
 text=s.get_text(' ',strip=True);d=re.search(r'Last Updated:\s*(\d\d/\d\d/\d{4})',text)
 data=dict(chain=chain,sourceUrl=source,source='Nutritionix',sourceKind='database',retrievedAt='2026-09-20',foods=unique)
 if d:data['sourceDate']=d[1][6:]+'-'+d[1][:2]+'-'+d[1][3:5]
 (OUT/(key+'.json')).write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
 return len(unique),excluded

if __name__ == '__main__':
 import argparse,requests,concurrent.futures
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--fetch',action='store_true');ap.add_argument('--chain',help='Nutritionix URL slug');args=ap.parse_args()
 manifest=json.loads(pathlib.Path('docs/restaurant-import/national-sources.json').read_text())
 targets=[r for r in manifest if r['sourceKind']=='database' and (not args.chain or r['sourceUrl'].split('/')[3]==args.chain)]
 if args.chain and not targets:ap.error('Unknown national Nutritionix source slug')
 P.mkdir(parents=True,exist_ok=True)
 def fetch(r):
  key=r['sourceUrl'].split('/')[3];response=requests.get(r['sourceUrl'],timeout=30);response.raise_for_status();(P/(key+'-premium.html')).write_bytes(response.content)
 if args.fetch:
  with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(fetch,targets))
 rejected=[]
 for r in targets:
  key=r['sourceUrl'].split('/')[3];count,excluded=parse(key,r['chain']);rejected.extend(excluded);print(key,count,'excluded',len(excluded))
 pathlib.Path('docs/restaurant-import/national-nutritionix-excluded.json').write_text(json.dumps(rejected,indent=2,ensure_ascii=False)+'\n')
