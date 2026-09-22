"""Normalize an official USDA FoodData Central JSON ZIP into a reviewed CC0 pack.
Usage: python3 scripts/import-usda.py input.zip output.json
Missing macros are excluded, never filled with zero. No network calls are made.
"""
import json, math, pathlib, sys, zipfile

def normalize(item):
    nutrients = {n.get('nutrient', {}).get('id'): n.get('amount') for n in item.get('foodNutrients', [])}
    values = {name: nutrients.get(key) for name, key in [('calories', 1008), ('protein', 1003), ('carbs', 1005), ('fat', 1004)]}
    if any(not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v) or v < 0 for v in values.values()):
        return None
    fdc = item.get('fdcId')
    if not isinstance(fdc, int) or not item.get('description'): return None
    food = dict(id=f'usda-{fdc}', name=item['description'], source='USDA FoodData Central',
                sourceUrl=f'https://fdc.nal.usda.gov/food-details/{fdc}/nutrients', sourceKind='database', verified=True,
                nutritionBasis='100g', servingGrams=100, servingLabel='100 g', **values)
    # A published household portion describes one selectable serving, while
    # nutrient values stay per 100 g. Unknown serving units are never converted.
    portion = next((p for p in item.get('foodPortions', []) if isinstance(p.get('gramWeight'), (int,float)) and p['gramWeight'] > 0 and p.get('modifier')), None)
    if portion:
        food['servingGrams'] = portion['gramWeight']
        food['servingLabel'] = f"{portion.get('amount', 1)} {portion['modifier']} ({portion['gramWeight']} g)"[:200]
    return food

if __name__ == '__main__':
    with zipfile.ZipFile(sys.argv[1]) as source:
        name = next(n for n in source.namelist() if n.endswith('.json'))
        data = json.loads(source.read(name))
    items = [item for value in data.values() if isinstance(value,list) for item in value]
    foods = [food for item in items if (food := normalize(item))]
    foods.sort(key=lambda f:f['id'])
    pathlib.Path(sys.argv[2]).write_text(json.dumps(foods, ensure_ascii=False, separators=(',',':'))+'\n')
    print(f'Normalized {len(foods)} USDA foods; excluded {len(items)-len(foods)} incomplete records.')
