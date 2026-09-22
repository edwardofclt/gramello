"""Import the audited September 2026 supplemental restaurant source snapshots.

Requires beautifulsoup4 and pdfplumber. Run with --fetch to download inputs.
Re-check columns and publisher serving labels before updating snapshot URLs.
"""
import json,re,unicodedata,os,math,sys,urllib.request
from pathlib import Path
from bs4 import BeautifulSoup
ROOT=str(Path(__file__).resolve().parents[2])
CACHE=str(Path(ROOT)/'work'/'restaurant-supplemental')
OUT=ROOT+'/data/restaurant-foods'

os.makedirs(CACHE,exist_ok=True)
os.makedirs(OUT,exist_ok=True)
PDF_SOURCES = {'jamba': 'https://assets.ctfassets.net/zqt8tllj2cy0/evcoqai6h6vOxuBZebEPF/5e40b19977920b2275a427e70e9f7915/Jamba_Nutrition_Spreadsheet_-_Sept_2026.pdf', 'cinnabon': 'https://assets.ctfassets.net/zqt8tllj2cy0/4CpaeuI6NC7VIT1noT7k78/3ea53d856d3d85ac02833bad8cde8fae/Nutritional_Guide_DOMESTIC_W2_2026_rev_7.2.pdf', 'auntie-annes': 'https://assets.ctfassets.net/zqt8tllj2cy0/10Ezjc1ozMDByK7cBBikSn/4ca91079eaac12bb63fcec420cd0ca46/AA_2103518_NutritionAllergenGuide_W2andW3_2026_HIGHRES-1.pdf', 'sbarro': 'https://sbarro.com/wp-content/uploads/2022/10/Sbarro-Nutrition-and-Allergen-Info-10.12.22.pdf'}
HTML_SOURCES={'charleys':'https://www.charleys.com/nutrition-info/','sarku':'https://www.sarkujapan.com/nutrition/','doc-popcorn':'https://docpopcorn.com/flavors/','dippin-dots':'https://www.dippindots.com/nutrition/'}
if '--fetch' in sys.argv:
 import pdfplumber
 def download(url):
  return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=60).read()
 for key,url in PDF_SOURCES.items():
  filename=Path(CACHE)/(key+'.pdf');filename.write_bytes(download(url))
  with pdfplumber.open(filename) as pdf:
   tables=[table for page in pdf.pages for table in page.extract_tables()]
  (Path(CACHE)/(key+'-tables.json')).write_text(json.dumps(tables))
 (Path(CACHE)/'pdf-sources.json').write_text(json.dumps(PDF_SOURCES))
 for key,url in HTML_SOURCES.items():
  raw=download(url).decode();(Path(CACHE)/(key+'.html')).write_text(raw)
  if key not in ['doc-popcorn','dippin-dots']:continue
  soup=BeautifulSoup(raw,'html.parser');products={a['href']:a.get_text(' ',strip=True) for a in soup.select('h3 a')};rows=[]
  for link,name in products.items():
   html=download(link).decode();text=BeautifulSoup(html,'html.parser').get_text(' ',strip=True)
   rows.append({'name':name,'url':link,'text':text})
  (Path(CACHE)/(key+'-products.json')).write_text(json.dumps(rows))

log={}
def slug(s):return re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower().replace("'",'')).strip('-')
def clean(s):return re.sub(r'\s+',' ',s or '').strip()
def num(s):
 s=clean(str(s or '')).removesuffix('g').replace(',','')
 if not re.fullmatch(r'\d+(?:\.\d+)?',s):raise ValueError(s)
 return float(s) if '.' in s else int(s)
def save(sl,chain,url,foods,date=None,notes=None):
 seen={};ds=[];quarantined=[]
 for f in foods:
  f['name']=clean(f['name']);
  if (sl,f['name']) in [('charleys','Catering - Chips'),('sarku-japan','MM Lemonade (44 oz)'),('jamba','Cloud Whip')]:
   quarantined.append({'name':f['name'],'reason':'Publisher row is internally inconsistent; calories disagree materially with stated macros. Excluded pending publisher clarification.'});continue
  f['id']=slug(f['name']+'-'+f['servingLabel']);
  if f['id'] in seen:
   if seen[f['id']] != f:raise ValueError(('duplicate conflicting',f))
   continue
  for v in ['calories','fat','carbs','protein']:assert math.isfinite(f[v]) and f[v]>=0,(sl,f)
  seen[f['id']]=f;ds.append(f)
 data={'chain':chain,'sourceUrl':url,'sourceKind':'restaurant','retrievedAt':'2026-09-20','foods':ds}
 if date:data['sourceDate']=date
 if notes:data['coverageNotes']=notes
 if quarantined:data.setdefault('coverageNotes',{})['quarantinedRows']=quarantined
 if sl=='cinnabon':data['coverageNotes']['excludedSection']='Carvel co-branded location variants, because qualifying local store is Cinnabon/Jamba.'
 open(OUT+'/'+sl+'.json','w').write(json.dumps(data,indent=2,ensure_ascii=False)+'\n');log[sl]={'count':len(ds),'notes':notes};print(sl,len(ds))
# Official HTML tables: column semantics inspected against source headings, not inferred from calories.
for k,sl,chain,url in [('charleys','charleys','Charleys Cheesesteaks','https://www.charleys.com/nutrition-info/'),('sarku','sarku-japan','Sarku Japan','https://www.sarkujapan.com/nutrition/')]:
 soup=BeautifulSoup(open(CACHE+'/'+k+'.html').read(),'html.parser');foods=[];skipped=[];category=''
 for ti,table in enumerate(soup.find_all('table')):
  rows=[[clean(c.get_text(' ',strip=True)) for c in r.find_all(['th','td'])] for r in table.find_all('tr')]
  cat=rows[0][0];base='';wing='';drink_size=''
  if k=='charleys' and cat=='WINGS':wing='Boneless Wing' if 'BONELESS' in rows[1][0] else 'Classic Wing'
  for row in rows[1:]:
   if len(row)<12:continue
   name=row[0];serving='1 menu serving (size in item name)'
   if k=='charleys':
    if cat=='BEVERAGES':
     dm=re.match(r'^(KIDS|REGULAR|LARGE) \(([^)]+)\) (.+)$',name)
     if dm:drink_size=dm[1].title()+' ('+dm[2]+')';name=dm[3]
     serving=drink_size if not re.search(r'\d+ oz',name) else '1 drink (size in item name)'
    if wing:name=wing+' - '+re.sub(r'^(BONELESS|CLASSIC) \(1 Piece\) ','',name);serving='1 piece'
    elif cat not in ['CHEESESTEAKS','BEVERAGES','Lemonades','PROTEIN BOX']:name=cat.title()+' - '+name
   else:
    if name.startswith('with '):name=base+' '+name
    elif name=='Entire tray':name=base+' - Entire Tray';serving='Entire tray'
    elif re.fullmatch(r'\(\d+ oz\)',name):name=re.sub(r' \(\d+ oz\)$','',base)+' '+name
    else:base=name.split(' with ')[0]
    if cat=='PARTY TRAYS' and serving!='Entire tray':serving='1 person serving (tray serves '+re.search(r'Serves (\d+)',name)[1]+')'
   try:cal,fat,carbs,protein=[num(row[i]) for i in [1,3,8,11]]
   except ValueError:skipped.append(name);continue
   foods.append(dict(name=name,calories=cal,fat=fat,carbs=carbs,protein=protein,servingLabel=serving))
 save(sl,chain,url,foods,notes={'method':'Official HTML nutrition table; all four requested numeric fields required.','skippedNonExactRows':skipped})
# PDF tables from pdfplumber. Mappings are tied to each publisher's table headings.
sources=json.load(open(CACHE+'/pdf-sources.json'))
for k,chain,date in [('jamba','Jamba','2026-09'),('cinnabon','Cinnabon','2026'),('sbarro','Sbarro','2022-10-12')]:
 foods=[];skipped=[];category=''
 for ti,table in enumerate(json.load(open(CACHE+'/'+k+'-tables.json'))):
  for row in table:
   if not row[0]:continue
   if k=='jamba':
    if len(row) not in [14,16]:continue
    offset=len(row)-14;ix=[1,4+offset,9+offset,12+offset];serving='1 menu serving (size in item name)';name=row[0]
   elif k=='cinnabon':
    if len(row)!=14:continue
    if clean(row[2])=='Calories':category=clean(row[0])
    if 'Carvel co-branded' in category:continue
    ix=[2,3,8,12];serving=clean(row[1]);name=row[0]
   else:
    if len(row)!=17:continue
    ix=[3,5,10,13];serving=clean(row[1]);name=re.sub(r'^SBARRO ','',clean(row[0]))
   try:cal,fat,carbs,protein=[num(row[i]) for i in ix]
   except ValueError:
    if row[ix[0]] and re.search(r'\d',str(row[ix[0]])):skipped.append(clean(row[0]))
    continue
   f=dict(name=name,calories=cal,fat=fat,carbs=carbs,protein=protein,servingLabel=serving)
   if k=='sbarro':
    try:f['servingGrams']=num(row[2])
    except ValueError:pass
   foods.append(f)
 save(k,chain,sources[k],foods,date,{'method':'Official linked US nutrition PDF; publisher serving and calories retained.','skippedNonExactRows':skipped,'sourceLandingUrl':{'jamba':'https://www.jamba.com/','cinnabon':'https://www.cinnabon.com/','sbarro':'https://sbarro.com/us-nutritional-information/'}[k]})
# Auntie Anne's spread uses separate but row-aligned left (food/portion/calories) and right (macros) tables.
ts=json.load(open(CACHE+'/auntie-annes-tables.json'));foods=[]
for i in range(0,22,2):
 left,right=ts[i],ts[i+1];assert len(left)==len(right)
 for l,r in zip(left[1:],right[1:]):
  name=clean(l[0]);serving=clean(l[1]);m=re.fullmatch(r'(\d+) servings \((\d+) each\)',serving)
  if m:serving=f'1 serving ({m[2]} pieces; bucket contains {m[1]} servings)'
  elif serving.startswith('Approx '):serving=serving+' pieces'
  foods.append(dict(name=name,calories=num(l[2]),fat=num(r[0]),carbs=num(r[5]),protein=num(r[9]),servingLabel=serving))
save('auntie-annes',"Auntie Anne's",sources['auntie-annes'],foods,'2026',{'method':'Row-aligned tables in official linked US guide. Bucket values are per stated serving, not entire bucket.','sourceLandingUrl':'https://www.auntieannes.com/'})
# Product labels: each explicit serving-size block becomes its own record.
for k,chain in [('doc-popcorn','Doc Popcorn'),('dippin-dots',"Dippin' Dots")]:
 foods=[];skipped=[]
 for p in json.load(open(CACHE+'/'+k+'-products.json')):
  if 'text' not in p:skipped.append(p['url']);continue
  blocks=re.split(r'Serving size\s+',p['text'],flags=re.I)[1:]
  for block in blocks:
   try:
    serving=clean(block.split(' Calories')[0]);cal=num(re.search(r'Calories\s+(\d+)',block)[1]);fat=num(re.search(r'Total Fat\s+(\d+(?:\.\d+)?)\s*g',block)[1]);carbs=num(re.search(r'Total Carbohydrates?\s+(\d+(?:\.\d+)?)\s*g',block)[1]);protein=num(re.search(r'Protein\s+(\d+(?:\.\d+)?)\s*g',block)[1])
   except (TypeError,ValueError):skipped.append(p['url']);continue
   if len(serving)>140:skipped.append(p['url']);continue
   f=dict(name=p['name'],calories=cal,fat=fat,carbs=carbs,protein=protein,servingLabel=serving,sourceUrl=p['url'])
   gm=re.search(r'\((?:about )?(\d+(?:\.\d+)?)\s*g\)',serving)
   if gm:f['servingGrams']=num(gm[1])
   foods.append(f)
 save(k,chain,'https://docpopcorn.com/flavors/' if k=='doc-popcorn' else 'https://www.dippindots.com/nutrition/',foods,notes={'method':'Official product nutrition label; values per explicit serving, not bulk bag.','skippedPages':sorted(set(skipped))})
open(CACHE+'/import-log.json','w').write(json.dumps(log,indent=2))
