"""Parse cached official sources. Run from repository root; see national.md."""
import pathlib,sys,json,re,bs4
P=pathlib.Path('work/restaurant-national');O=pathlib.Path('data/restaurant-foods');
import ftfy
def clean(s):return ' '.join(ftfy.fix_text(str(s)).replace('®','').replace('™','').split()).strip(' †*')

def save(k,c,url,rows):
 seen=set()
 for r in rows:
  i=re.sub('[^a-z0-9]+','-',r['name'].lower()).strip('-');j=2;b=i
  while i in seen:i=b+'-'+str(j);j+=1
  seen.add(i);r['id']=i
 (O/(k+'.json')).write_text(json.dumps(dict(chain=c,sourceUrl=url,retrievedAt='2026-09-20',foods=rows),indent=2,ensure_ascii=False)+'\n');print(k,len(rows))
s=bs4.BeautifulSoup((P/'condado.html').read_text(),'html.parser');rows=[];cat=''
for tr in s.select('table.condado-table tbody tr'):
 if 'category-header' in tr.get('class',[]):cat=tr.get_text(' ',strip=True).title();continue
 r={e.get('data-label'):e.get_text(' ',strip=True) for e in tr.select('[data-label]')}
 try:v={k:float(r[x]) for k,x in [('calories','Calories'),('fat','Total Fat (g)'),('carbs','Carbs (g)'),('protein','Protein (g)')]}
 except:continue
 label=r['Serving Size'];rows.append(dict(name=cat+' - '+clean(r['Item']),**v,servingLabel=label if label and label!='-' else '1 menu item'))
save('condado-tacos','Condado Tacos','https://condadotacos.com/menu-food/nutrition/',rows)
s=re.sub(r'L\d+:\s*','',(P/'lean-web.txt').read_text());rows=[]
pat=r'### ([^\n]+)[\s\S]*?Calories\s+(\d+)\s+Protein\s+(\d+) g\s+Fat\s+(\d+) g\s+Carbs\s+(\d+) g'
for name,cal,p,f,c in re.findall(pat,s):
 # First source heading before meal is outside the item block; assign by nearest preceding item heading.
 rows.append(dict(name=clean(name),calories=int(cal),protein=int(p),fat=int(f),carbs=int(c),servingLabel='1 prepared meal'))
# Restrict matches to the meals region to avoid headings outside nutrition cards.
block=s.split('## Our Meals.')[-1].split('*Menus vary')[0];rows=[]
for name,cal,p,f,c in re.findall(pat,block):rows.append(dict(name=clean(name),calories=int(cal),protein=int(p),fat=int(f),carbs=int(c),servingLabel='1 prepared meal'))
save('lean-kitchen','Lean Kitchen','https://leankitchenco.com/charlotte/',rows)
