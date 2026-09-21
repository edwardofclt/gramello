"""Fetch the public McDonalds item API for cached official full-menu product IDs."""
import requests,pathlib,json,bs4,concurrent.futures,sys,importlib,importlib.util
p=pathlib.Path('work/restaurant-national');s=bs4.BeautifulSoup((p/'mcdonalds.html').read_text(),'html.parser');ids=list(dict.fromkeys(x.get('data-product-id') for x in s.select('[data-product-id]')));rows=[];fail=[]
def get(pid):
 try:
  url='https://www.mcdonalds.com/dnaapp/itemDetails?country=US&language=en&showLiveData=true&item='+pid;r=requests.get(url,timeout=20);d=r.json()['item'];(p/('mcd-'+pid+'.json')).write_text(json.dumps(d));return d
 except:fail.append(pid);return None
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:data=list(ex.map(get,ids))
spec=importlib.util.spec_from_file_location('national_official',pathlib.Path(__file__).with_name('national-official.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
for d in data:
 if not d:continue
 n={x['nutrient_name_id']:x['value'] for x in d.get('nutrient_facts',{}).get('nutrient',[])}
 if all(k in n for k in ['calories','protein','carbohydrate','fat']):rows.append((d['item_marketing_name'] or d['item_name'],n['calories'],n['fat'],n['carbohydrate'],n['protein'],'1 menu serving (size in item name)',None))
m.save('mcdonalds',"McDonald's",rows);print('ids',len(ids),'fail',fail)
