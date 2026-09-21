"""Parse cached official sources. Run from repository root; see national.md."""
import pathlib,json,re,pdfplumber,sys
P=pathlib.Path('work/restaurant-national');O=pathlib.Path('data/restaurant-foods');
import ftfy
def clean(s):return ' '.join(ftfy.fix_text(str(s)).replace('®','').replace('™','').split()).strip(' †*')

def nid(s):return re.sub('[^a-z0-9]+','-',s.lower()).strip('-')
def save(key,chain,source,rows):
 seen=set();out=[]
 for r in rows:
  i=nid(r['name']);j=2;base=i
  while i in seen:i=base+'-'+str(j);j+=1
  seen.add(i);r['id']=i;out.append(r)
 d=dict(chain=chain,sourceUrl=source,retrievedAt='2026-09-20',foods=out);(O/(key+'.json')).write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n');print(key,len(rows),flush=True)

def handels():
 rows=[];name='';skipped=[]
 for line in (P/'handels-web.txt').read_text().splitlines():
  t=re.sub(r'^L\d+: ','',line)
  if t.startswith('{'):
   d=json.loads(t)
   if any(d.get(k) is None for k in ['Calories','TotalFat','TotalCarbohydrate','Protein']):skipped.append(name);continue
   rows.append(dict(name=clean(name),calories=d['Calories'],fat=d['TotalFat'],carbs=d['TotalCarbohydrate'],protein=d['Protein'],servingLabel=d['ServingSize']))
  elif re.search(r'\s[\d,-]+ calories$',t):name=re.sub(r'\s+[\d,-]+ calories$','',t)
 save('handels-homemade-ice-cream',"Handel’s Homemade Ice Cream",'https://handelsicecream.com/nutritional-info/',rows)
 (P/'handels-skipped.json').write_text(json.dumps(skipped,indent=2))

def sweetfrog():
 rows=[]
 configs=[('sweetfrog-frozen','https://www.sweetfrog.com/assets/pdf/Nutrition_Statement_Frozen_Desserts.pdf',13,2,3,8,12),('sweetfrog-toppings','https://www.sweetfrog.com/assets/pdf/Nutrition_Statement_Toppings.pdf',14,3,4,9,13),('sweetfrog-optional','https://www.sweetfrog.com/assets/pdf/Nutritional_Information_Optional_Products.pdf',13,2,3,8,12)]
 for k,url,width,ci,fi,carbi,pi in configs:
  category=''
  with pdfplumber.open(P/(k+'.pdf')) as pdf:
   for p in pdf.pages:
    for table in p.extract_tables():
     for r in table:
      if len(r)!=width:continue
      if r[0] and all(not x for x in r[1:]):category=clean(r[0]);continue
      if not r[0] or not r[ci]:continue
      try:v=[float(re.sub(r'\s','',r[i])) for i in [ci,fi,carbi,pi]]
      except:continue
      label=clean(r[1]) if k=='sweetfrog-optional' else clean(r[1])+' oz'+(' ('+clean(r[2])+')' if k=='sweetfrog-toppings' else '')
      f=dict(name=category+' - '+clean(r[0]),calories=v[0],fat=v[1],carbs=v[2],protein=v[3],servingLabel=label,sourceUrl=url)
      g=re.search(r'(\d+)\s*g\b',label)
      if g:f['servingGrams']=int(g[1])
      rows.append(f)
 save('sweetfrog','sweetFrog','https://www.sweetfrog.com/menu/nutrition/index.php',rows)
if __name__ == '__main__':
 handels();sweetfrog()
