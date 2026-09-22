"""Reconcile researched catalogs and source audits without promoting location evidence.

Run from the repository root before generating restaurant seed SQL. This does
not turn map candidates into confirmed businesses or fill missing nutrition.
"""
import json
import pathlib
import re
import unicodedata
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parents[2]
REPORTS = ROOT / 'docs/restaurant-import'
path = REPORTS / 'coverage.json'
coverage = json.loads(path.read_text())

def normalized(value):
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '', value.lower())

# Explicit filename aliases; location eligibility still comes from the inventory.
ALIASES = {'hwy-55-burgers-shakes-fries': 'hwy55.json'}
AUDIT_ALIASES = {
    'chickiespetes': 'chickiespetessportsgrill',
    'chickiesandpetes': 'chickiespetessportsgrill',
    'burtonsgrill': 'burtonsgrillbar',
    'postino': 'postinowinecafe',
}
audits = {}
for file in sorted(REPORTS.glob('*.json')):
    if not any(term in file.name for term in ('source-audit', 'blockers')) or file.name.startswith('usda-'):
        continue
    document = json.loads(file.read_text())
    rows = document if isinstance(document, list) else document.get('chains', document.get('audits', document.get('blocked', [])))
    if not isinstance(rows, list):
        continue
    for row in rows:
        key = normalized(row.get('inventorySlug') or row.get('slug') or row.get('chain') or row.get('name') or '')
        key = AUDIT_ALIASES.get(key, key)
        if key:
            audits.setdefault(key, []).append({'report': f'docs/restaurant-import/{file.name}',
                **{field: row[field] for field in ('status', 'reason', 'blocker', 'sourceUrl') if field in row}})

matched = set()
for chain in coverage['chains']:
    candidates = [chain.get('catalogFile', ''),
        'data/restaurant-foods/' + ALIASES.get(chain['slug'], chain['slug'] + '.json')]
    file = next((ROOT / value for value in candidates if value and (ROOT / value).is_file()), None)
    if file:
        catalog = json.loads(file.read_text())
        matched.add(file.name)
        chain.update(nutritionStatus='imported', catalogFile=str(file.relative_to(ROOT)),
            foodCount=len(catalog['foods']), nutritionSourceUrl=catalog['sourceUrl'],
            nutritionSourceKind=catalog.get('sourceKind', 'restaurant'))
    else:
        chain['nutritionStatus'] = 'no_catalog_imported'
        for field in ('catalogFile', 'foodCount', 'nutritionSourceUrl', 'nutritionSourceKind'):
            chain.pop(field, None)
    key = normalized(chain['slug'])
    notes = audits.get(key, []) + audits.get(normalized(chain['name']), [])
    if notes:
        chain['nutritionAudit'] = list({json.dumps(note, sort_keys=True): note for note in notes}.values())
    else:
        chain.pop('nutritionAudit', None)
coverage['importedCatalogsWithoutRadiusEvidence'] = sorted(p.name for p in (ROOT / 'data/restaurant-foods').glob('*.json') if p.name not in matched)
path.write_text(json.dumps(coverage, indent=2, ensure_ascii=False) + '\n')

md_path = REPORTS / 'coverage.md'
md = md_path.read_text()
head = md.split('## Audited inventory')[0]
tail = md.split('## Refresh procedure')[1]
statuses = Counter(c['eligibilityStatus'] for c in coverage['chains'])
imported = [c for c in coverage['chains'] if c['nutritionStatus'] == 'imported']
head = re.sub(r'\*\*\d+ catalogs / [\d,]+ serving records\*\*',
    f"**{len(imported)} catalogs / {sum(c['foodCount'] for c in imported):,} serving records**", head)
head = re.sub(r'\*\*\d+ chains and chain candidates\*\*, with \d+ supported by current first-party or property-owner directory pages, \d+ mapped candidates awaiting current-location or chain-identity checks, and \d+ historical/unresolved entries',
    f"**{len(coverage['chains'])} chains and chain candidates**, with {statuses['primary_location_confirmed']} supported by current first-party or property-owner directory pages, {statuses['mapped_candidate_needs_current_locator_check']} mapped candidates awaiting current-location or chain-identity checks, and {statuses['historical_or_unresolved']} historical/unresolved entries",head)
rows = ['## Audited inventory', '', 'Status: **Primary** = current primary location/directory evidence; **Map candidate** = mapped inside the radius, current operation/chain identity still needs checking; **Historical** = unresolved stale listing. Distance is the closest known coordinate, which can differ from the linked primary location; JSON retains each individual distance and coordinate method. Source audit links describe exactly what was checked; a missing catalog is not an assertion that no nutrition exists.', '', '| Chain | Location evidence | Closest mapped miles | Nutrition |', '| --- | --- | ---: | --- |']
for c in coverage['chains']:
    status = c['eligibilityStatus']
    label = 'Primary' if status == 'primary_location_confirmed' else 'Historical' if status == 'historical_or_unresolved' else 'Map candidate'
    loc = next((l for l in c['locations'] if l.get('locationStatus') == 'primary_directory_confirmed'), c['locations'][0])
    url = loc.get('additionalEvidenceUrl') or loc.get('evidenceUrl')
    distance = c.get('minimumMappedDistanceMiles')
    distance = f'{distance:.2f}' if isinstance(distance, (int, float)) else 'Unknown'
    if c['nutritionStatus'] == 'imported':
        nutrition = f"[{c['foodCount']:,} servings](../../{c['catalogFile']})"
    elif c.get('nutritionAudit'):
        report = pathlib.Path(c['nutritionAudit'][0]['report']).name
        nutrition = f'[Source gap audit]({report})'
    else:
        nutrition = '**Missing catalog; unresolved**'
    rows.append(f"| {c['name'].replace('|', '/')} | [{label}]({url}) | {distance} | {nutrition} |")
md_path.write_text(head + '\n'.join(rows) + '\n\n## Refresh procedure' + tail)
print(f"Reconciled {len(imported)} catalogs; {len(coverage['chains']) - len(imported)} inventory records without a catalog; {len(coverage['importedCatalogsWithoutRadiusEvidence'])} unmapped catalogs.")
