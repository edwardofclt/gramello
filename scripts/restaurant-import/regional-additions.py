"""Additional official chain imports. Source files and method in regional.md."""
import json,re
from pathlib import Path
import pdfplumber
from nutritionix import save
ROOT=Path('work/restaurant-regional')
# North Italia uses eleven nutrient columns; first-party section headings
# distinguish kids, happy hour, gluten-free, vegetable-noodle and regular plates.
foods=[];section=''
with pdfplumber.open(ROOT/'north-italia.pdf') as pdf:
 for page in pdf.pages:
  for line in page.extract_text().splitlines():
   if re.search(r'(?: -){11}$',line):
    section=re.sub(r'(?: -){11}$','',line).strip();continue
   m=re.match(r'^(.*?)\s+((?:\d+(?:\.\d+)?\s+){10}\d+(?:\.\d+)?)$',line)
   if not m:continue
   name=m[1].replace('*','').strip();v=list(map(float,m[2].split()))
   if len(v)!=11:raise ValueError(line)
   label='1 listed menu portion'
   if '2 oz. pour' in section:label='2 fl oz pour'
   if section=='Salads includes dressing':label='1 salad including dressing'
   foods.append(dict(name=section+' — '+name,calories=v[0],fat=v[2],carbs=v[7],protein=v[10],servingLabel=label))
save('north-italia','North Italia','https://www.northitalia.com/wp-content/uploads/2026/04/North-Italia-Nutritional-Guide-04-2026-1.pdf',foods,'2026-04')
# Super Chix embeds the same public menu data its client renders in Next flight.
def walk(v):
 if isinstance(v,dict):
  if 'categories' in v:yield v['categories']
  for x in v.values():yield from walk(x)
 elif isinstance(v,list):
  for x in v:yield from walk(x)
foods=[];dates=[]
for m in re.finditer(r'self\.__next_f\.push\((.*?)\)</script>',(ROOT/'super-chix-live.html').read_text()):
 a=json.loads(m[1])
 if len(a)<2 or not isinstance(a[1],str) or 'total_fat_g' not in a[1]:continue
 for line in a[1].splitlines():
  try:decoded=json.loads(line.split(':',1)[1])
  except (ValueError,IndexError):continue
  for cats in walk(decoded):
   for cat in cats:
    for f in cat['items']:
     if not f['is_active']:continue
     ks=['calories','total_fat_g','total_carbs_g','protein_g'];override=f.get('display_overrides') or {}
     vals=[override.get(k,f.get(k)) for k in ks]
     # Published ranges and '<1' are not exact totals; never coerce them to zero.
     if not all(isinstance(v,(int,float)) or re.fullmatch(r'\d+(?:\.\d+)?',str(v)) for v in vals):continue
     c,fat,carb,pro=map(float,vals);name=f['group_name']+(' — '+f['variant_label'] if f.get('variant_label') else '')
     if cat['name']=='Kids Menu':name='Kids — '+name
     label='2 oz portion' if '2oz' in (f.get('note') or '') else '1 listed menu portion (size in name)'
     foods.append(dict(name=name,calories=c,fat=fat,carbs=carb,protein=pro,servingLabel=label));dates.append(f['updated_at'][:10])
save('super-chix','Super Chix','https://nutrition.superchix.com/menu',foods,max(dates))
# Postino's first-party nutrition page embeds its public EveryBite widget.
# Download response with the read-only GraphQL query documented in regional.md.
response=json.loads((ROOT/'postino-response.json').read_text())['data']['dishesByWidget']
assert len(response['data'])==response['count'], 'Pagination required'
foods=[]
for row in response['data']:
 for d in [row['dish']]+[v['dish'] for v in row['variants']]:
  n=d.get('nutrients') or {};vals=[n.get(k) for k in ['caloriesTotal','fatTotal','carbohydrates','protein']]
  if not all(re.fullmatch(r'\d+(?:\.\d+)?',str(v)) for v in vals):continue
  c,f,ca,p=map(float,vals);name=d['name']+(' — '+d['size'] if d.get('size') else '')
  label=d.get('servingSize') or '1 listed menu portion';g=d.get('servingSizeInGrams')
  food=dict(name=name,calories=c,fat=f,carbs=ca,protein=p,servingLabel=label)
  if isinstance(g,(int,float)) and g>0:food.update(servingGrams=g,servingLabel=label+' ('+str(g)+' g)')
  foods.append(food)
save('postino','Postino','https://app.everybite.com/widget/7d6e5b3d',foods)
# Known anomalous publisher rows remain held until the publisher fixes them.
held=json.loads(Path('docs/restaurant-import/regional-quarantine.json').read_text())['rows']
for key in ['north-italia','super-chix','postino']:
 p=Path('data/restaurant-foods/'+key+'.json');data=json.loads(p.read_text());rows=[r['food']for r in held if r['sourceUrl']==data['sourceUrl']]
 data['foods']=[f for f in data['foods'] if not any(all(f.get(k)==h.get(k) for k in ['name','calories','fat','carbs','protein'])for h in rows)]
 p.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
