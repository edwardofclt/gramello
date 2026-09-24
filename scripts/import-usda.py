"""Normalize an official USDA FoodData Central JSON ZIP into a reviewed CC0 pack.
Usage: python3 scripts/import-usda.py input.zip output.json [--servings-output servings.json]
Missing macros are excluded, never filled with zero. No network calls are made.
"""
import argparse, hashlib, json, math, pathlib, re, zipfile

COUNTABLE = re.compile(r'^(?:(?:extra\s+)?(?:small|medium|large)|jumbo|regular|slices?|pieces?|items?|eggs?|fruits?|berries|berry|kernels?|nuts?|cloves?|spears?|stalks?|florets?|leaves|leaf|fillets?|steaks?|chops?|breasts?|thighs?|drumsticks?|wings?|patties|patty|links?|strips?|sticks?|bars?|cookies?|crackers?|biscuits?|muffins?|rolls?|buns?|bagels?|tortillas?|pancakes?|waffles?|sandwich(?:es)?|burgers?|frankfurters?|hot dogs?)\b')
YIELD_OR_BULK = re.compile(r'\b(?:yield|refuse|recipe|package|jar|can|carton|bottle|box|container|loaf|roast|head)\b')

def positive(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0

def valid_portions(item):
    return [p for p in item.get('foodPortions', []) if positive(p.get('gramWeight'))
            and positive(p.get('amount', 1)) and isinstance(p.get('modifier'), str) and p['modifier'].strip()]

def countable(portion):
    label = portion['modifier'].strip().lower()
    # Read the actual measure, not e.g. "eggs" inside "cup (4.86 large eggs)".
    # Yield descriptions and large shared items are not convenient portions.
    return bool(COUNTABLE.match(label) and not YIELD_OR_BULK.search(label)
                and portion['gramWeight'] <= 600)

def preferred_portion(item):
    portions = valid_portions(item)
    # Preserve a labeled product serving (e.g. "serving 1.66 oz bar") instead
    # of replacing it with a miniature/fun-size alternative from the same row.
    if portions and re.match(r'^serving\b.+\b(?:bar|cookie|cracker|piece|slice|sandwich)\b', portions[0]['modifier'], re.I):
        return portions[0]
    named = [p for p in portions if countable(p)]
    egg = bool(re.match(r'^eggs?\b', item.get('description', ''), re.I))
    def priority(portion):
        label = portion['modifier'].lower()
        # A large egg is the familiar default; medium/regular suits other foods.
        preferred = r'^large\b' if egg else r'\b(?:medium|regular)\b'
        size = 0 if re.search(preferred, label) else 2 if re.search(r'\b(?:extra|jumbo|small|large|thin|thick)\b', label) else 1
        return size, 0 if portion.get('amount', 1) == 1 else 1
    return min(named, key=priority) if named else next(iter(portions), None)

def serving(portion):
    amount, grams = portion.get('amount', 1), portion['gramWeight']
    # Keep the published count and weight paired; never guess an item weight.
    return dict(servingGrams=grams, servingLabel=f"{amount:g} {portion['modifier'].strip()} ({grams:g} g)"[:200])

def serving_options(item):
    preferred = preferred_portion(item)
    portions = sorted(valid_portions(item), key=lambda p: (p != preferred, not countable(p), p['gramWeight']))
    options, seen = [], set()
    for portion in portions:
        value = serving(portion)
        key = (value['servingLabel'], value['servingGrams'])
        if key in seen:
            continue
        seen.add(key)
        identity = str(portion.get('id') or hashlib.sha256(json.dumps(key).encode()).hexdigest()[:16])
        options.append(dict(id=f'usda-portion-{identity}', label=value['servingLabel'], grams=value['servingGrams']))
    return options

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
    portion = preferred_portion(item)
    if portion:
        food.update(serving(portion))
        food['servingOptions'] = serving_options(item)
    return food

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input')
    parser.add_argument('output')
    parser.add_argument('--servings-output')
    args = parser.parse_args()
    with zipfile.ZipFile(args.input) as source:
        name = next(n for n in source.namelist() if n.endswith('.json'))
        data = json.loads(source.read(name))
    items = [item for value in data.values() if isinstance(value,list) for item in value]
    foods = [food for item in items if (food := normalize(item))]
    foods.sort(key=lambda f:f['id'])
    pathlib.Path(args.output).write_text(json.dumps(foods, ensure_ascii=False, separators=(',',':'))+'\n')
    if args.servings_output:
        defaults = {}
        valid_ids = {food['id'] for food in foods}
        for item in items:
            portion = preferred_portion(item)
            food_id = f"usda-{item.get('fdcId')}"
            if food_id in valid_ids and portion:
                defaults[food_id] = dict(**serving(portion), servingOptions=serving_options(item))
        document = dict(source='https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip',
                        policyVersion=2, foods=dict(sorted(defaults.items())))
        pathlib.Path(args.servings_output).write_text(json.dumps(document, ensure_ascii=False, indent=2)+'\n')
        print(f'Wrote source-backed defaults and all published portions for {len(defaults)} foods.')
    print(f'Normalized {len(foods)} USDA foods; excluded {len(items)-len(foods)} incomplete records.')
