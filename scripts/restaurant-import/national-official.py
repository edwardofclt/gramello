"""Source-specific official restaurant PDF/HTML parsers.

Run from the repository root after downloading the source snapshots to
work/restaurant-national. See docs/restaurant-import/national.md.
"""
from pathlib import Path
import re,json,pathlib,bs4,pdfplumber,collections,unicodedata
P=pathlib.Path('work/restaurant-national');OUT=pathlib.Path('data/restaurant-foods');URLS=json.loads(Path(__file__).with_name('national-official-sources.json').read_text());STATS={}
def num(s):
 s=str(s).strip().replace(',','')
 if not re.fullmatch(r'\d+(?:\.\d+)?',s):raise ValueError(s)
 v=float(s);return int(v) if v.is_integer() else v
def clean(s):return ' '.join(str(s).replace('®','').replace('™','').replace('∆','').split()).strip(' †*')
def slug(s):return re.sub('[^a-z0-9]+','-',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).strip('-')
def save(key,chain,rows,date=None):
 foods=[];seen=set();ids=collections.Counter()
 for name,cal,fat,carb,pro,serving,grams in rows:
  try:v=[num(x) for x in [cal,pro,carb,fat]]
  except ValueError:continue
  name=clean(name)
  sig=(name,*v,serving,grams)
  if sig in seen:continue
  seen.add(sig);sid=slug(name+'-'+serving);ids[sid]+=1
  if ids[sid]>1:sid+='-'+str(ids[sid])
  f=dict(id=sid,name=name,calories=v[0],protein=v[1],carbs=v[2],fat=v[3],servingLabel=clean(serving))
  if grams:
   try:f['servingGrams']=num(grams)
   except:pass
  foods.append(f)
 data=dict(chain=chain,sourceUrl=URLS[key],retrievedAt='2026-09-20',foods=foods)
 if date:data['sourceDate']=date
 (OUT/(key+'.json')).write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n');STATS[key]=len(foods);print(key,len(foods))

def parse_five_guys():
 rows=[]
 with pdfplumber.open(P/'five-guys.pdf') as d:
  for page in d.pages:
   for table in page.extract_tables():
    for r in table:
     if len(r)>=13 and r[0] and r[2]:rows.append((r[0],r[2],r[4],r[9],r[12],f'{r[1]} g',r[1]))
 save('five-guys','Five Guys',rows,'2026-09')
def parse_arbys():
 rows=[]
 for line in (P/'arbys.txt').read_text().splitlines():
  m=re.match(r'^(.*?)\s+((?:\d+(?:\.\d+)?\s+){11}\d+(?:\.\d+)?)$',line)
  if not m:continue
  n=re.split(r'Contains:',m[1])[0].strip();v=m[2].split()
  rows.append((n,v[1],v[3],v[8],v[11],f'{v[0]} g',v[0]))
 save('arbys',"Arby's",rows,'2026-09')
def parse_longhorn():
 rows=[];section=''
 with pdfplumber.open(P/'longhorn-steakhouse.pdf') as d:
  for page in d.pages[2:]:
   for table in page.extract_tables():
    for r in table:
     if len(r)!=12:continue
     if r[0] and not r[1] and len(r[0])<60:section=clean(r[0]);continue
     if r[0] and r[1]:
      n=clean(r[0]);n=section.title()+' - '+n if section in ['LUNCH ENTRÉES','STEAKHOUSE LUNCH PLATES','LEGENDARY STEAKS','KIDS'] else n
      rows.append((n,r[1],r[3],r[8],r[11],'1 menu serving (see item description)',None))
 save('longhorn-steakhouse','LongHorn Steakhouse',rows,'2026-08-10')
def parse_firstwatch():
 rows=[];s=bs4.BeautifulSoup((P/'first-watch.html').read_text(),'html.parser')
 for r in s.select('tr.nutrition-data-row'):
  name=r.select_one('.nutrition-item-name');v=[x.get_text(' ',strip=True) for x in r.select('.nutrition-data-number')]
  if name and len(v)==12:rows.append((name.get_text(' ',strip=True),v[0],v[2],v[7],v[11],'1 menu serving',None))
 save('first-watch','First Watch',rows)
def parse_freddys():
 rows=[];s=bs4.BeautifulSoup((P/'freddys.html').read_text(),'html.parser')
 for r in s.select('.paragraph--type--nutrition-items'):
  def field(n):
   x=r.select_one('.field-item__field-'+n);return x.get_text(' ',strip=True) if x else ''
  rows.append((field('menu-item'),field('calories'),field('total-fat'),field('carbs'),field('protein'),'1 menu serving (size in item name)',None))
 save('freddys',"Freddy's Frozen Custard & Steakburgers",rows)
def parse_dunkin():
 rows=[]
 with pdfplumber.open(P/'dunkin.pdf') as d:
  for page in d.pages:
   for table in page.extract_tables():
    for r in table:
     if len(r)==17 and r[0] and r[2]:rows.append((r[0],r[2],r[3],r[8],r[12],r[1],None))
 save('dunkin',"Dunkin'",rows)
def parse_sonic():
 rows=[]
 with pdfplumber.open(P/'sonic.pdf') as d:
  for page in d.pages[2:]:
   for table in page.extract_tables():
    for r in table:
     v=[x for x in r if x is not None and str(x).strip()]
     if len(v)==11:rows.append((v[0],v[1],v[2],v[7],v[10],'1 menu serving (size in item name)',None))
 save('sonic','Sonic Drive-In',rows,'2026-09')
def parse_culvers():
 rows=[]
 for line in (P/'culvers.txt').read_text().splitlines():
  m=re.match(r'^(.*?)\s+((?:\d+(?:\.\d+)?\s+){9}\d+(?:\.\d+)?)$',line)
  if m:
   v=m[2].split();rows.append((m[1],v[0],v[1],v[6],v[9],'1 menu serving (size in item name)',None))
 save('culvers',"Culver's",rows)
def parse_cookout():
 rows=[];section=''
 for line in (P/'cook-out.txt').read_text().splitlines():
  m=re.match(r'^(.*?)\s+([\d.]+\s*(?:oz|fl oz).*?\))\s+((?:\d+(?:\.\d+)?\s+){13}\d+(?:\.\d+)?)$',line)
  if m:
   name,serv,numbers=m.groups();v=numbers.split();g=re.search(r'\(\s*([\d.]+) g\)',serv)
   if section and (name.startswith(('Small','Regular','Huge','Big Double')) or 'Add' in name):name=section+' - '+name
   # Published chicken style additions mix base totals, add-on weights, and internally inconsistent nutrition. Do not mislabel these as reliable servings.
   if 'Add' in name and section in ['Char-Grilled Chicken Breast','Hot Crispy Spicy Chicken Breast Fillet']:continue
   rows.append((name,v[0],v[1],v[6],v[9],serv,g[1] if g else None))
  elif len(line)>10 and not re.search(r'\d',line) and not line.isupper():section=line
 save('cook-out','Cook Out',rows)
def parse_olivegarden():
 rows=[];name='';section=''
 with pdfplumber.open(P/'olive-garden.pdf') as d:
  for page in d.pages[1:]:
   for table in page.extract_tables():
    for r in table:
     if len(r)!=11:continue
     if r[0] and all(x is None for x in r[1:]):
      if r[0].isupper():section=clean(r[0])
      else:name=clean(r[0])
      continue
     if name and r[0] and r[0][0].isdigit():
      title=name
      if section in ['LUNCH-SIZED FAVORITES','KIDS','KIDS MENU','LIGHTER PORTIONS','CREATE YOUR OWN PASTA','GLUTEN SENSITIVE MENU']:title=section.title()+' - '+name
      if title.startswith('add '):title=title[4:]+' (add-on)'
      rows.append((title,r[0],r[2],r[7],r[10],'1 menu serving (see item description)',None))
 save('olive-garden','Olive Garden',rows)
def parse_dominos():
 rows=[]
 with pdfplumber.open(P/'dominos.pdf') as d:
  for page in d.pages[1:19]:
   context='';name='';section=''
   for table in page.extract_tables():
    for r in table:
     if r and r[0] and 'Ingredient Nutrition' in r[0]:context=clean(r[0]);continue
     if len(r) not in [13,14]:continue
     if r[0] and all(not x for x in r[1:]):section=clean(r[0]);continue
     if len(r)==13 and r[2]:
      title=clean(r[0]);base=context.split('Ingredient Nutrition')[0].replace('*VARIANCE','').strip()
      if re.match(r'^\d',r[2]):
       frac=re.search(r'(\d/\d+) of (Pizza|Hoagie)',context)
       serving=(frac[1]+' of '+frac[2].lower()) if frac else '1 published serving'
       title=base+' - '+section.title()+' - '+title
       rows.append((title,r[2],r[3],r[8],r[12],serving,r[1]))
     elif len(r)==14 and r[3]:
      if r[0]:name=clean(r[0])
      title=name+' (Hand Tossed)' if 'Specialty Pizzas' in context else section.title()+' - '+name
      rows.append((title,r[3],r[4],r[9],r[13],r[1],r[2]))
 save('dominos',"Domino's",rows,'2026-01')
def parse_papajohns():
 rows=[];s=bs4.BeautifulSoup((P/'papa-johns.html').read_text(),'html.parser');serv=[]
 for table in s.select('table'):
  label=table.get('aria-label','')
  if label=='Serving Size Information':
   r=table.select('tbody tr')[0];serv=[x.get_text(' ',strip=True) for x in r.select('td')];continue
  if label!='Nutritional Facts Information':continue
  heading=table.find_previous('h5');name=heading.get_text(' ',strip=True) if heading else ''
  # Product heading h5 is above the local h4 nutrition label.
  data={}
  for r in table.select('tbody tr'):
   a=r.find(['th','td']);data[a.get_text(' ',strip=True)]=[x.get_text(' ',strip=True).removesuffix('g') for x in r.select('td')]
  if not all(k in data for k in ['Total Calories','Total Fat','Total Carbohydrate','Protein']):continue
  headers=table.select('thead tr');crust=[];size=[]
  if headers:
   for h in headers[0].select('th')[1:]:crust.extend([h.get_text(' ',strip=True)]*int(h.get('colspan',1)))
   if len(headers)>1:size=[h.get_text(' ',strip=True) for h in headers[1].select('th')[1:]]
  for i,c in enumerate(data['Total Calories']):
   title=name
   if i<len(crust):title+=' - '+crust[i]
   if i<len(size) and size[i]!='N/A':title+=' - '+size[i]
   if all(i<len(data[k]) for k in ['Total Fat','Total Carbohydrate','Protein']):rows.append((title,c,data['Total Fat'][i],data['Total Carbohydrate'][i],data['Protein'][i],serv[i] if i<len(serv) else '1 published serving',None))
 save('papa-johns','Papa Johns',rows)
def parse_nutritionix(key,chain):
 s=bs4.BeautifulSoup((P/(key+'-premium.html')).read_text(),'html.parser');rows=[]
 fields={re.sub(r'^.*?sort=','',x.get('href','')):i for i,x in enumerate(s.select('.tblCompare thead th a'))}
 for r in s.select('.tblCompare tbody tr'):
  a=r.select_one('a.nmItem');cells=r.select('td.col')
  if not a or not cells:continue
  def value(field):return cells[fields[field]-1].get_text(' ',strip=True)
  rows.append((a.get_text(' ',strip=True),value('calories'),value('total_fat'),value('total_carb'),value('protein'),'1 menu serving (size in item name)',None))
 URLS[key]='https://www.nutritionix.com/'+key+'/menu/premium'
 text=s.get_text(' ',strip=True);m=re.search(r'Last Updated:\s*(\d\d/\d\d/\d{4})',text);date=m[1][6:]+'-'+m[1][:2]+'-'+m[1][3:5] if m else None
 save(key,chain,rows,date)
 outfile=OUT/(key+'.json');data=json.loads(outfile.read_text());data.update(source='Nutritionix',sourceKind='database');outfile.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
def parse_outback():
 rows=[]
 with pdfplumber.open(P/'outback.pdf') as d:
  for page in d.pages:
   for table in page.extract_tables():
    for r in table:
     if len(r)==14 and r[0] and r[3]:
      if 'Ahi Tuna' in r[0] and str(r[3]).strip()=='660':continue
      serving=' '.join(str(x).strip() for x in r[1:3] if x and str(x).strip()) or '1 menu serving'
      rows.append((r[0],r[3],r[5],r[10],r[13],serving,None))
 URLS['outback-steakhouse']=URLS['outback'];save('outback-steakhouse','Outback Steakhouse',rows,'2026-09')
def parse_redrobin():
 rows=[]
 for line in (P/'red-robin.txt').read_text().splitlines():
  m=re.match(r'^(.*?)\s+((?:\d+(?:\.\d+)?\s+){10}\d+(?:\.\d+)?)$',line)
  if m:
   v=m[2].split();rows.append((m[1],v[0],v[2],v[7],v[10],'1 menu serving (sides/dressing only if specified)',None))
 save('red-robin','Red Robin',rows,'2023-10-02')
def parse_littlecaesars():
 rows=[];section=''
 for line in (P/'little-caesars.txt').read_text().splitlines():
  m=re.match(r'^(.*?)\s+((?:\d+(?:\.\d+)?\s+){10}\d+(?:\.\d+)?)(?:\s+a)*$',line)
  if m:
   v=m[2].split();name=section.title()+' - '+m[1]
   rows.append((name,v[0],v[2],v[7],v[10],'1 whole pizza' if 'PIZZAS' in section else '1 whole menu item/order (size in name)',None))
  elif line.isupper() and len(line)>6 and not line.startswith(('NUTRITION','PRODUCT','MENU OPTIONS')):section=line
 save('little-caesars','Little Caesars',rows)
def parse_bww():
 rows=[];base='';section=''
 with pdfplumber.open(P/'buffalo-wild-wings.pdf') as d:
  for page in d.pages:
   for table in page.extract_tables():
    for r in table:
     if len(r)!=11:continue
     if r[0] and all(x is None for x in r[1:]):section=clean(r[0]);continue
     if r[0] and r[1]:
      name=clean(r[0])
      if 'add Signature Sauce' in name:base=name.split(',')[0];name=base+' (without sauce)'
      elif section in ['SIGNATURE SAUCES','DRY RUBS'] and base:name=name+' ('+section.title()+' for '+base.lower()+')'
      rows.append((name,r[1],r[2],r[7],r[10],'1 menu serving (size in item name)',None))
 save('buffalo-wild-wings','Buffalo Wild Wings',rows,'2026-08-18')

if __name__ == '__main__':
 import argparse
 parsers={'five-guys':parse_five_guys,'arbys':parse_arbys,'longhorn-steakhouse':parse_longhorn,'first-watch':parse_firstwatch,'freddys':parse_freddys,'dunkin':parse_dunkin,'sonic':parse_sonic,'culvers':parse_culvers,'cook-out':parse_cookout,'olive-garden':parse_olivegarden,'dominos':parse_dominos,'outback-steakhouse':parse_outback,'little-caesars':parse_littlecaesars,'buffalo-wild-wings':parse_bww}
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('chain',choices=sorted(parsers));args=ap.parse_args();parsers[args.chain]()
