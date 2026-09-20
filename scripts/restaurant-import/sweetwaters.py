"""Extract the currently linked Sweetwaters 2020 guide. Requires pdfplumber.
Usage: python sweetwaters.py /path/to/source.pdf
The guide remains linked by the brand; source age is explicit, not a 2026 revision.
"""
import json
import pathlib
import re
import sys
import unicodedata
import pdfplumber

SOURCE = 'https://www.sweetwaterscafe.com/sc-columbia-park-st/wp-content/uploads/2018/05/SW_BeverageFood_Nutrition_Sheet_1-30-2020.pdf'
foods = []
excluded = []
seen = set()
for page_index, page in enumerate(pdfplumber.open(sys.argv[1]).pages):
    for table in page.extract_tables():
        if not table or len(table[0]) != 12:
            continue
        current_name = None
        for row in table[1:]:
            if row[0]:
                current_name = ' '.join(row[0].split())
            if not current_name or not row[1]:
                continue
            size = ' '.join(row[1].split())
            values = [row[i] for i in (2, 11, 8, 3)]
            if not all(value and re.fullmatch(r'\d+(?:\.\d+)?', value.strip()) for value in values):
                excluded.append({'page': page_index+1, 'name':current_name, 'size': size, 'row': row, 'reason':'Non-numeric or incomplete required nutrients'})
                continue
            c, p, cb, f = map(float, values)
            # This guide has demonstrable print errors. Preserve them in audit, not the verified catalog.
            if abs(c - (4*p+4*cb+9*f)) > max(80, c*.35):
                excluded.append({'page':page_index+1,'name':current_name,'size':size,'row':row,'reason':'Publisher calorie/macro inconsistency; no correction inferred'})
                continue
            key = (current_name, size, c, p, cb, f)
            if key in seen:
                continue
            seen.add(key)
            food = {'id': re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFKD',current_name+'-'+size).encode('ascii','ignore').decode().lower()).strip('-'), 'name':current_name,'servingLabel':size,'calories':c,'protein':p,'carbs':cb,'fat':f}
            grams = re.search(r'(\d+(?:\.\d+)?)\s*g\b',size)
            if grams:food['servingGrams']=float(grams.group(1))
            foods.append(food)
# Different source rows occasionally repeat an id; make their source-page order explicit.
ids = set()
for food in foods:
    base=food['id'];n=2
    while food['id'] in ids:food['id']=base+'-'+str(n);n+=1
    ids.add(food['id'])
pathlib.Path('data/restaurant-foods/sweetwaters-coffee-tea.json').write_text(json.dumps({'chain':'Sweetwaters Coffee & Tea','sourceUrl':SOURCE,'sourceDate':'2020-01-30; guide still linked on official cafe page at retrieval','retrievedAt':'2026-09-20','foods':foods},indent=2,ensure_ascii=False)+'\n')
pathlib.Path('docs/restaurant-import/sweetwaters-excluded.json').write_text(json.dumps({'sourceUrl':SOURCE,'excluded':excluded},indent=2)+'\n')
print(len(foods),'imported;',len(excluded),'excluded')
