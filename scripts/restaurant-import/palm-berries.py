"""Audited transcription of the 20 labels in Palm Berries' currently linked PDF.

Each tuple was checked visually against the rendered source PDF on 2026-09-20.
No gram weight is inferred from an ounce-sized bowl or smoothie container.
Run from the repository root. Re-audit labels before refreshing this snapshot.
"""
import json
import pathlib
import re

SOURCE = 'https://palmberriesllc.com/wp-content/uploads/2022/06/Palmberries-Nutrition-Facts.pdf'
# name, printed serving ounces, calories, protein g, carbohydrate g, total fat g
ROWS = [
    ('Sami Bowl',12,720,12,122,26),
    ('Queen City Bowl',12,460,6,96,9),
    ('Sunset Bowl',12,520,7,111,8),
    ('Protein Bowl',12,630,22,102,18),
    ('Palm Bowl',12,630,9,102,25),
    ('Dragon Bowl',12,450,8,102,5),
    ('Classic Base',12,300,3,67,5),
    ('Very Berry Base',8,190,2,44,3),
    ('Tropical Base',8,200,2,46,3),
    ('Superhuman Base',8,230,13,35,5),
    ('Pure Base',12,240,2,48,6),
    ('Pink Base',12,290,5,64,1),
    ('Green Sip Smoothie',16,310,6,76,1),
    ('Horizon Smoothie',16,440,4,116,0.5),
    ('Brazillian Smoothie',16,560,5,121,10),
    ('Queen Dream Smoothie',16,400,4,88,7),
    ('Acerola Smoothie',16,310,3,77,0.5),
    ('Koo Pu Smoothie',16,490,5,115,6),
    ('Flamingo Smoothie',16,490,5,113,0.5),
    ('Gainz Smoothie',16,560,38,69,17),
]
foods = [dict(id=re.sub('[^a-z0-9]+','-',name.lower()).strip('-'), name=name,
    servingLabel=f'{size} oz',calories=cal,protein=p,carbs=c,fat=f)
    for name,size,cal,p,c,f in ROWS]
pathlib.Path('data/restaurant-foods/palm-berries.json').write_text(json.dumps({
    'chain':'Palm Berries','sourceUrl':SOURCE,'retrievedAt':'2026-09-20',
    'sourceDate':'Undated guide at 2022/06 upload path; still linked on official menu at retrieval',
    'coverageNotes':{'sourceLandingUrl':'https://palmberriesllc.com/our-menu/',
        'method':'All 20 complete nutrition labels transcribed and visually reviewed across 3 PDF pages.',
        'scope':'6 specialty bowls, 6 bases without toppings, and 8 smoothies; menu may include additional seasonal items.',
        'servingBasis':'Printed serving ounces retained, including mixed 8 oz and 12 oz base servings; no gram weight inferred.',
        'sourceSpelling':'Brazillian retained as printed in source.'},'foods':foods},indent=2)+'\n')
print('Palm Berries:',len(foods),'published servings')
