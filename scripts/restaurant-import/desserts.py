"""Import audited Everbowl components and Jeff's Bagel Run source snapshots.

Requires beautifulsoup4 and pdfplumber. Run with --fetch to cache the official
sources in ignored work/restaurant-desserts/. Jeni's is a separate, visually
transcribed catalog; its exact source label images are linked per food.
"""
import json
import math
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

from bs4 import BeautifulSoup
import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'work' / 'restaurant-desserts'
OUT = ROOT / 'data' / 'restaurant-foods'
JEFFS_URL = 'https://d3i6xtoh90ar7z.cloudfront.net/website/JBR_Nutritional%20Information_120125.pdf'
EVERBOWL_URL = 'https://www.everbowl.com/nutritionals'
CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

def download(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()

if '--fetch' in sys.argv:
    (CACHE / 'jeffs.pdf').write_bytes(download(JEFFS_URL))
    raw = download(EVERBOWL_URL).decode()
    (CACHE / 'everbowl.html').write_text(raw)
    soup = BeautifulSoup(raw, 'html.parser')
    links = {a['href']: a.get_text(' ', strip=True) for a in soup.find_all('a', href=True)
             if '/nutritionals/' in a['href']}
    items = []
    for url, name in links.items():
        html = BeautifulSoup(download(url).decode(), 'html.parser')
        tables = [[[c.get_text(' ', strip=True) for c in row.find_all(['td', 'th'])]
                   for row in table.find_all('tr')] for table in html.find_all('table')]
        items.append({'name': name, 'url': url, 'tables': tables})
    (CACHE / 'everbowl-items.json').write_text(json.dumps(items, indent=2))

def save(slug, name, url, foods, notes, date=None):
    unique = {}
    for food in foods:
        food['name'] = ' '.join(food['name'].split())
        key = unicodedata.normalize('NFKD', food['name'] + ' ' + food['servingLabel'])
        key = key.encode('ascii', 'ignore').decode().lower().replace("'", '')
        food['id'] = re.sub('[^a-z0-9]+', '-', key).strip('-')
        for nutrient in ['calories', 'fat', 'carbs', 'protein']:
            assert math.isfinite(food[nutrient]) and food[nutrient] >= 0
        if food['id'] in unique:
            assert unique[food['id']] == food, ('conflicting duplicate', food)
        unique[food['id']] = food
    result = {'chain': name, 'sourceUrl': url, 'sourceKind': 'restaurant',
              'retrievedAt': '2026-09-20', 'foods': list(unique.values()), 'coverageNotes': notes}
    if date:
        result['sourceDate'] = date
    (OUT / (slug + '.json')).write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print(slug, len(result['foods']))

foods, quarantined = [], []
with pdfplumber.open(CACHE / 'jeffs.pdf') as pdf:
    for page in pdf.pages:
        words = [w for w in page.extract_words()
                 if w['upright'] and 7 < w['height'] < 10 and 160 < w['top'] < 560]
        rows = sorted([w for w in words if 282 < w['x0'] < 310 and
                       re.fullmatch(r'\d+(?:\.\d+)?', w['text'])], key=lambda w: w['top'])
        for i, calorie in enumerate(rows):
            y = calorie['top']
            y0 = (rows[i - 1]['top'] + y) / 2 if i else y - 16
            y1 = (rows[i + 1]['top'] + y) / 2 if i + 1 < len(rows) else y + 16
            def column(left, right):
                return ' '.join(w['text'] for w in words
                                if left <= w['x0'] < right and abs(w['top'] - y) < 3)
            name = ' '.join(w['text'] for w in sorted(words, key=lambda w: (round(w['top'] / 3), w['x0']))
                            if w['x0'] < 214 and y0 < w['top'] < y1)
            values = [v.removesuffix('g') for v in
                      [calorie['text'], column(345, 370), column(496, 525), column(589, 615)]]
            assert name and all(re.fullmatch(r'\d+(?:\.\d+)?', v) for v in values), (name, values)
            calories, fat, carbs, protein = map(float, values)
            food = dict(name=name.title(), servingLabel=column(215, 237) + ' ' + column(237, 282),
                        calories=calories, fat=fat, carbs=carbs, protein=protein)
            if 'Hot Pumpkin Spice Latte' in food['name']:
                quarantined.append({'food': food, 'reason': 'Hot pumpkin-spice section has published sugar counts above total carbs and/or large calorie-to-macro discrepancies. Not repaired or imported pending publisher clarification.'})
                continue
            grams = re.search(r'\((\d+)G\)', food['name'])
            if grams:
                food['servingGrams'] = int(grams[1])
                food['name'] = food['name'].replace('G)', 'g)')
            foods.append(food)
save('jeffs-bagel-run', "Jeff's Bagel Run", JEFFS_URL, foods, {
    'method': 'Fixed-coordinate text extraction of all 27 pages; wrapped names kept in their numeric row bands. Column headings and sample rows visually inspected.',
    'sourceLandingUrl': 'https://www.jeffsbagelrun.com/menu/other',
    'scope': 'All complete numeric rows except internally inconsistent Hot Pumpkin Spice Latte group. Calories and macros per listed serving; ounces are not converted into grams.',
    'quarantinedRows': quarantined,
}, '2025-12-01')

foods, skipped = [], []
for item in json.loads((CACHE / 'everbowl-items.json').read_text()):
    if not item['tables']:
        skipped.append({'name': item['name'], 'url': item['url'], 'reason': 'No nutrition table returned by published ingredient page.'})
        continue
    for table in item['tables']:
        headers = [cell.lower() for cell in table[0]]
        indices = [headers.index(key) for key in ['calories', 'total fat (g)', 'carbs (g)', 'protein (g)']]
        for row in table[1:]:
            if any(not re.fullmatch(r'\d+(?:\.\d+)?', row[i]) for i in indices):
                skipped.append({'name': item['name'], 'url': item['url'], 'reason': 'Incomplete or non-exact required macro field'})
                continue
            calories, fat, carbs, protein = [float(row[i]) for i in indices]
            food = dict(name=item['name'], servingLabel=row[0], calories=calories,
                        fat=fat, carbs=carbs, protein=protein, sourceUrl=item['url'])
            grams = re.fullmatch(r'(\d+)g', row[0])
            if grams:
                food['servingGrams'] = int(grams[1])
            foods.append(food)
save('everbowl', 'Everbowl', EVERBOWL_URL, foods, {
    'method': 'Named columns from first-party ingredient nutrition HTML tables.',
    'scope': 'Published base/topping portions only, not inferred customized bowl totals. Six ingredient pages and assembled bowl/smoothie labels did not expose complete values.',
    'skippedIngredientPages': skipped,
    'unavailablePdf': {'url': 'https://admin.everbowl.com/uploads/Nutritional_Information_Chart_091d1f7dec.pdf',
                       'reason': 'Direct fetch failed due to expired TLS certificate; browser retrieval returned 502.'},
})
