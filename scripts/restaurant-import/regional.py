"""Reproduce the regional first-party nutrition imports from downloaded source documents.

See docs/restaurant-import/regional.md for download URLs, required filenames,
column mappings, serving rules, source caveats, and known exclusions.
Requires Python 3 with lxml and pdfplumber. Inputs live in ignored
work/restaurant-regional; outputs are tracked data/restaurant-foods/*.json.
This deliberately fails on missing source files; never substitutes estimates.
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
foods=[];doc=html.fromstring(Path('work/restaurant-regional/showmars.html').read_text())
for row in doc.xpath('//tr[@data-name]'):
 cells=[txt(x) for x in row.xpath('./th|./td')]
 if len(cells)!=12 or not re.match(r'^[0-9]',cells[1]):continue
 foods.append(dict(name=cells[0],calories=num(cells[1]),fat=num(cells[2]),carbs=num(cells[7]),protein=num(cells[10]),servingLabel='1 menu serving'))
save('showmars','Showmars','https://showmars.com/nutritional-info/',foods,'Fall 2025')
foods=[];doc=html.fromstring(Path('work/restaurant-regional/cfa.html').read_text())
for row in doc.xpath('//tr'):
 cells=row.xpath('./td')
 if len(cells)!=12:continue
 name_nodes=cells[0].xpath('.//a[@data-wp-text="context.menu_item.title"]|.//span[@data-wp-text="context.menu_item.title"]')
 if name_nodes:name=txt(name_nodes[-1])
 else:name=txt(cells[0])
 vals=[txt(x) for x in cells]
 foods.append(dict(name=name,calories=num(vals[2]),fat=num(vals[3]),carbs=num(vals[8]),protein=num(vals[11]),servingLabel='1 serving ('+str(int(num(vals[1])))+' g)',servingGrams=num(vals[1])))
save('chick-fil-a','Chick-fil-A','https://www.chick-fil-a.com/nutrition-allergens',foods)

import pdfplumber
foods=[]
with pdfplumber.open('work/restaurant-regional/bojangles.pdf') as pdf:
 for table in pdf.pages[0].extract_tables():
  section=''
  for r in table:
   if r[0] and r[0].isupper():section=r[0]

   if len(r)<13 or not r[0] or not r[2] or not re.fullmatch(r'\d+(?:\.\d+)?',r[2]):continue
   foods.append(dict(name=('Kids meal (water, green beans, biscuit): ' if section.startswith('KIDS') else '')+r[0].replace('\n',' ').replace('*','').strip()+' — '+r[1],servingLabel=r[1] if r[1]!='1' else '1 item',calories=float(r[2]),fat=float(r[4]),carbs=float(r[8]),protein=float(r[11])))
save('bojangles','Bojangles','https://storyblok.pleinaircdn.com/f/110020/x/6c7b2a7e6a/m25-099-2025_02-nutritiongudeupdates_bobitessalad_master.pdf',foods,'2025')
# The PDF embeds subset Calibri without a Unicode map; decode its CID sequence and visually cross-check the rendered page.
mapping={1:' ',**{i+24:chr(97+i) for i in range(26)},**{i+58:str(i) for i in range(10)},50:'.',51:'/',52:'-',53:'(',54:')'}
# Used uppercase glyphs in this subset, matched to the printed item names.
mapping.update(dict(zip(range(2,24),'ABCDEFGHIJKLMNPQRSTVWY')))
mapping.update({47:'y',48:'z'})
decode=lambda s:re.sub(r'\(cid:(\d+)\)',lambda m:mapping.get(int(m[1]),'?'),s)
with pdfplumber.open('work/restaurant-regional/viva.pdf') as pdf:txt=decode(pdf.pages[0].extract_text())
Path('work/restaurant-regional/viva-decoded.txt').write_text(txt)
foods=[];section=''
for line in txt.splitlines():
 m=re.match(r'^(.*?) ((?:\d+(?:\.\d+)?\s+){10}\d+(?:\.\d+)?)$',line)
 if not m:
  if line in ['Pollo a la Brasa','Salads','Sandwiches & Wraps','In The Mix','Sides (Single portion)','Kids','Sweet Things','Sauces(2 oz)','Beverages']:section=line
  continue
 name=m[1].replace('Balasmic','Balsamic');v=list(map(float,m[2].split()))
 if section=='Kids' and not name.startswith('Kids '):name='Kids '+name
 if section=='Sauces(2 oz)':serv='2 oz'
 elif section=='Sides (Single portion)':serv='1 side portion'
 elif '2 oz ramekin' in name:serv='1 ramekin (2 oz)'
 else:serv='1 menu serving'
 if name.startswith('Add '):serv='1 protein add-on'
 foods.append(dict(name=name,servingLabel=serv,calories=v[0],fat=v[2],carbs=v[7],protein=v[10]))
save('viva-chicken','Viva Chicken','https://vivachicken.com/wp-content/uploads/2026/05/NutritionalAllergenListVivaChicken05.26.26.pdf',foods,'2019-06-07 (printed revision; current linked guide filename 2026-05-26)')
# Panera publishes values in fixed columns; calorie baselines define rows, preserving wrapped names.
foods=[]
with pdfplumber.open('work/restaurant-regional/panera.pdf') as pdf:
 for p in pdf.pages:
  ws=p.extract_words(extra_attrs=['size'])
  anchors=[w for w in ws if 328<w['x0']<355 and re.fullmatch(r'\d+',w['text']) and w['top']>170]
  for i,w in enumerate(anchors):
   y=w['top'];lower=(anchors[i-1]['top']+y)/2 if i else y-15;upper=(anchors[i+1]['top']+y)/2 if i+1<len(anchors) else y+16
   near=[q for q in ws if lower<=q['top']<upper]
   # names are 9 point regular text; section headers are larger and must not enter item names.
   namewords=[q['text'] for q in near if q['x0']<209 and abs(q['size']-11.04)<0.15]
   servwords=[q['text'] for q in near if 209<=q['x0']<328 and q['upright']]
   name=' '.join(namewords);serv=' '.join(servwords)
   vals=[]
   for a,b in [(393,417),(556,581),(652,678)]:
    ns=[q['text'] for q in ws if a<q['x0']<b and abs(q['top']-y)<1.2]
    vals.append(float(ns[0]) if len(ns)==1 and re.fullmatch(r'\d+(?:\.\d+)?',ns[0]) else None)
   if not name or not serv or None in vals:print('skip panera',p.page_number,name,serv,vals);continue
   f=dict(name=name,servingLabel=serv,calories=float(w['text']),fat=vals[0],carbs=vals[1],protein=vals[2]);g=re.search(r'(\d+)\s*g\)',serv)
   if g:f['servingGrams']=float(g[1])
   foods.append(f)
save('panera-bread','Panera Bread','https://www.panerabread.com/content/dam/panerabread/documents/c8-26-nutrition-guide.pdf',foods,'2026-09-02')

import pdfplumber
foods=[]
with pdfplumber.open('work/restaurant-regional/moes.pdf') as pdf:
 for p in pdf.pages:
  for table in p.extract_tables():
   for r in table:
    if len(r)==11 and r[0] and r[1] and re.fullmatch(r'(?:\d*\.)?\d+',r[1]):
     foods.append(dict(name=r[0],servingLabel='1 listed portion',calories=float(r[1]),fat=float(r[2]),carbs=float(r[7]),protein=float(r[10])))
save('moes','Moe’s Southwest Grill','https://assets.ctfassets.net/zqt8tllj2cy0/229Bgcvw5c0RwcUkhyghXG/d3722a14b4b1dd925316a8936200f5bd/MOES_1906368_Nutrition_Chart_2026_R4.pdf',foods,'2026')
# Tropical Smoothie pages have different column layouts (smoothies vs food).
foods=[]
with pdfplumber.open('work/restaurant-regional/tropical.pdf') as pdf:
 for p in pdf.pages:
  txt=p.extract_text()
  if p.page_number>2:continue
  section=''
  for line in txt.splitlines():
   if line in ['SMOOTHIES','KIDS SMOOTHIES (12 OZ.)','SUPPLEMENTS','FRESH ADD-INS','BOTTLED BEVERAGES']:section=line
   n=15 if p.page_number==1 else 11
   m=re.match(r'^(.*?) ((?:(?:(?:\d*\.)?\d+|N/A)\s+){'+str(n-1)+r'}(?:(?:\d*\.)?\d+|N/A))$',line)
   if not m:continue
   name=re.sub(r'(?:\s+(?:[1-9]|10))+$','',m[1]);v=[float(x) if x!='N/A' else None for x in m[2].split()]
   if p.page_number==1:
    serving='12 fl oz smoothie' if section=='KIDS SMOOTHIES (12 OZ.)' else '24 fl oz smoothie' if section=='SMOOTHIES' else '1 listed portion'
    foods.append(dict(name=name,servingLabel=serving,calories=v[0],fat=v[3],carbs=v[8],protein=v[13]))
    if v[1] is not None and v[9] is not None:foods.append(dict(name=name+' with Splenda',servingLabel=serving,calories=v[1],fat=v[3],carbs=v[9],protein=v[13]))
   else:
    foods.append(dict(name=name,servingLabel='1 menu serving',calories=v[0],fat=v[2],carbs=v[7],protein=v[10]))
save('tropical-smoothie-cafe','Tropical Smoothie Cafe','https://www.tropicalsmoothiecafe.com/nutrition/nutrition-guide.pdf',foods,'2026-05-14')

import pdfplumber
foods=[];section='4 oz chicken salad scoop'
with pdfplumber.open('work/restaurant-regional/csc.pdf') as pdf:
 for p in pdf.pages[1:5]:
  ws=p.extract_words()
  def kids(w):return (p.page_number==3 and w['top']>500) or (p.page_number==4 and w['top']<110)
  anchors=[w for w in ws if ((180<w['x0']<198) if kids(w) else (143<w['x0']<165)) and re.fullmatch(r'\d+',w['text'])]
  for w in anchors:
   y=w['top'];before=p.crop((0,max(0,y-80),145,y)).extract_text() or ''
   for l in before.splitlines():
    if l.startswith('Our Famous Chicken'):section='4 oz chicken salad scoop'
    elif l.startswith('Pimento Cheese'):section='4 oz pimento cheese scoop'
    elif l=='Sandwiches':section='sandwich'
    elif l.startswith('Fresh Sides'):section='4 oz side or 1 bag chips'
    elif l=='Cup':section='1 cup soup'
    elif l=='Bowl':section='1 bowl soup'
    elif l=='Kids Meals':section='kids portion'
    elif l=='Sweet Treats':section='1 listed dessert'
    elif l=='Drinks':section='listed drink size'
   if section=='listed drink size':continue # source leaves fat/protein blank; do not invent zero.
   name=' '.join(q['text'] for q in ws if q['x0']<140 and abs(q['top']-y)<1.5)
   if not name:continue
   vals=[]
   for a,b in ([(255,280),(448,478),(562,591)] if kids(w) else [(228,252),(437,467),(562,591)]):
    ns=[q['text'] for q in ws if a<q['x0']<b and abs(q['top']-y)<1.5]
    vals.append(float(ns[0]) if len(ns)==1 and re.fullmatch(r'\d+(?:\.\d+)?',ns[0]) else None)
   if None in vals:print('skip csc',name,vals);continue
   if kids(w):
    section='kids portion';name='Kids '+name
    if name.startswith('Kids Half Sandwich:'):name+=' (excludes chicken salad)'
   if section in ['sandwich','kids portion'] and name.startswith(('Sandwich:','Signature BLT','Melt with')):name+=' (excludes chicken salad)'
   serving=section
   if section=='sandwich':serving='1 listed sandwich component'
   if name=='Pickle Spear':serving='1 pickle spear'
   if name=='Crackers':serving='1 serving crackers'
   if section=='4 oz side or 1 bag chips':serving='1 bag chips' if 'Chips' in name or name in ['Baked Lays','Doritos'] else '4 oz side'
   foods.append(dict(name=name,servingLabel=serving,calories=float(w['text']),fat=vals[0],carbs=vals[1],protein=vals[2]))
save('chicken-salad-chick','Chicken Salad Chick','https://storyblok.pleinaircdn.com/f/297321/x/2be8a2157f/nutritional-and-allergy-information.pdf',foods,'2026-08-03')

import pdfplumber
foods=[]
with pdfplumber.open('work/restaurant-regional/salsaritas.pdf') as pdf:
 for p in pdf.pages[:2]:
  for tab in p.extract_tables():
   for r in tab:
    if len(r)!=13 or not r[2] or not re.fullmatch(r'\d+(?:\.\d+)?',r[2]):continue
    if r[0]=='Queso - 2oz. Portion':continue
    if any('<' in (r[x] or '') for x in [4,9,12]):continue
    foods.append(dict(name=r[0],servingLabel=r[1].replace(' W',' by weight').replace(' V',' by volume'),calories=float(r[2]),fat=float(r[4]),carbs=float(r[9]),protein=float(r[12])))
save('salsaritas','Salsarita’s Fresh Mexican Grill','https://salsaritas.com/wp-content/uploads/2023/01/Nutritional-Data-Salsaritas-March2023.pdf',foods,'2023-03 (filename); 2022-08 printed revision')

import pdfplumber
foods=[]
def val(x):
 x=x.split('\n')[-1].strip()
 return float(x) if re.fullmatch(r'(?:\d*\.)?\d+',x) else None
with pdfplumber.open('work/restaurant-regional/jimmyjohns.pdf') as pdf:
 for p in pdf.pages[3:]:
  pagetitle=(p.extract_text() or '').splitlines()[1]
  for tab in p.extract_tables():
   # Ingredient portion tables contain merged cells that shift rows across pages; import assembled foods and drinks only.
   if any('Portion' in str(r) for r in tab[:2]):continue
   title=pagetitle
   if tab[0][1] and not any(val(x or '') is not None for x in tab[0]):title=tab[0][1]
   title=re.sub(r'\s*\(C[O0]NT\.\)','',title)
   prev=''
   for r in tab[2:]:
    name=r[0] or prev
    if r[0]:prev=r[0]
    if not name:continue
    cells=[x for x in r[1:] if x is not None and x!=''];portion=''
    if len(cells)==12 and val(cells[0]) is None:portion=cells.pop(0)
    if len(cells)==22:
     for z,size in [(0,'30 fl oz'),(1,'32 fl oz')]:
      v=[val(x) for x in cells[z::2]]
      if any(v[i] is None for i in [0,2,7,10]):continue
      foods.append(dict(name=name,servingLabel=size,calories=v[0],fat=v[2],carbs=v[7],protein=v[10]))
     continue
    if len(cells)!=11:continue
    v=[val(x) for x in cells]
    if any(v[i] is None for i in [0,2,7,10]):continue
    suffix=title.title()
    if portion:suffix+=' — '+portion
    foods.append(dict(name=name+' — '+suffix,servingLabel=portion+' portion' if portion else '1 menu serving ('+title.lower()+')',calories=v[0],fat=v[2],carbs=v[7],protein=v[10]))
save('jimmy-johns','Jimmy John’s','https://resources.jimmyjohns.com/downloadable-files/NutritionGuide.pdf',foods,'2024-07-22 (nutrition guide effective date)')

foods=[]
for item in json.loads(Path('work/restaurant-regional/smoothieking-data.json').read_text())['smoothies']:
 for v in item.get('nutritionInfoSmoothieEnhancer',{}).get('nutritionInfo') or []:
  if any(not re.fullmatch(r'\d+(?:\.\d+)?',str(v.get(k,''))) for k in ['calories','fat','carbs','protein']):continue
  foods.append(dict(name=item['title'],servingLabel=str(v['servingSize'])+' oz',calories=float(v['calories']),fat=float(v['fat']),carbs=float(v['carbs']),protein=float(v['protein']),sourceUrl='https://www.smoothieking.com'+item['uri']))
save('smoothie-king','Smoothie King','https://www.smoothieking.com/nutrition/',foods)
