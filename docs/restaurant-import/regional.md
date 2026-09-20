# Regional, chicken, sandwich, and fast-casual nutrition imports

Research date: **2026-09-20**. Geographic eligibility is maintained separately in `coverage.json` and its location evidence. This file records what was actually imported; a source snapshot is not a guarantee that every item is sold by every local franchise.

## Provenance and verification

First-party foods retain the official nutrition guide/page URL. Nutritionix imports explicitly carry `source: "Nutritionix"` and `sourceKind: "database"`; they are database-sourced values, not claimed to be independently published by the restaurant. Both are eligible for the app's external-source Verified indicator. Verified identifies provenance, not laboratory testing or a promise of exact nutrition in an individual meal.

All numbers are **per listed serving**, not per 100 g. No gram weights were inferred. Explicit source weights are retained for Chick-fil-A and the Panera portions that publish them. Numbers remain at the source's published precision. Missing macro columns and inequality values such as `<1` were not silently converted to zero. Configurable meals are represented by the published portions/components or named recipe variants, not by invented combinations.

## Imported snapshots

| Chain | Imported servings | Publisher/source | Scope |
| --- | ---: | --- | --- |
| Viva Chicken | 57 | [Official source](https://vivachicken.com/wp-content/uploads/2026/05/NutritionalAllergenListVivaChicken05.26.26.pdf) | All distinct nutrition rows; repeated add-ons deduplicated |
| Chick-fil-A | 372 | [Official source](https://www.chick-fil-a.com/nutrition-allergens) | All complete numeric rows in retrieved source; duplicate servings deduplicated |
| Showmars | 165 | [Official source](https://showmars.com/nutritional-info/) | All complete numeric rows in retrieved source; duplicate servings deduplicated |
| Bojangles | 149 | [Official source](https://storyblok.pleinaircdn.com/f/110020/x/6c7b2a7e6a/m25-099-2025_02-nutritiongudeupdates_bobitessalad_master.pdf) | All complete numeric rows in retrieved source; duplicate servings deduplicated |
| Panera Bread | 594 | [Official source](https://www.panerabread.com/content/dam/panerabread/documents/c8-26-nutrition-guide.pdf) | Complete numeric serving rows in 35-page guide |
| Moe’s Southwest Grill | 84 | [Official source](https://assets.ctfassets.net/zqt8tllj2cy0/229Bgcvw5c0RwcUkhyghXG/d3722a14b4b1dd925316a8936200f5bd/MOES_1906368_Nutrition_Chart_2026_R4.pdf) | All complete numeric rows in retrieved source; duplicate servings deduplicated |
| Tropical Smoothie Cafe | 124 | [Official source](https://www.tropicalsmoothiecafe.com/nutrition/nutrition-guide.pdf) | All complete numeric rows in retrieved source; duplicate servings deduplicated |
| Chicken Salad Chick | 88 | [Official source](https://storyblok.pleinaircdn.com/f/297321/x/2be8a2157f/nutritional-and-allergy-information.pdf) | Partial: foods with explicit calories and all macros; blank drink macros excluded |
| Salsarita’s Fresh Mexican Grill | 84 | [Official source](https://salsaritas.com/wp-content/uploads/2023/01/Nutritional-Data-Salsaritas-March2023.pdf) | Partial: sour cream inequalities and inconsistent 2 oz queso row excluded |
| Jim ’N Nick’s Bar-B-Q | 104 | [Nutritionix](https://www.nutritionix.com/jim-n-nicks-bar-b-q/menu/premium) | Partial: complete numeric source rows, with source anomalies excluded and duplicates removed |
| Jimmy John’s | 312 | [Official source](https://resources.jimmyjohns.com/downloadable-files/NutritionGuide.pdf) | Partial: assembled foods/drinks; merged ingredient portion tables excluded |
| Smoothie King | 367 | [Official source](https://www.smoothieking.com/nutrition/) | All numeric complete portions in official nutrition-search JSON |
| Firehouse Subs | 906 | [Nutritionix](https://www.nutritionix.com/firehouse-subs/menu/premium) | Partial: complete numeric source rows, with source anomalies excluded and duplicates removed |
| Zaxby’s | 196 | [Nutritionix](https://www.nutritionix.com/zaxbys/menu/premium) | All complete numeric rows in retrieved source; duplicate servings deduplicated |
| Jersey Mike’s Subs | 722 | [Nutritionix](https://www.nutritionix.com/jersey-mikes-subs/menu/premium) | All complete numeric rows in retrieved source; duplicate servings deduplicated |
| Subway | 226 | [Nutritionix](https://www.nutritionix.com/subway/menu/premium) | All complete numeric rows in retrieved source; duplicate servings deduplicated |
| CAVA | 121 | [Nutritionix](https://www.nutritionix.com/cava-grill/menu/premium) | All complete numeric rows in retrieved source; duplicate servings deduplicated |
| Slim Chickens | 146 | [Nutritionix](https://www.nutritionix.com/slim-chickens/menu/premium) | All complete numeric rows in retrieved source; duplicate servings deduplicated |
| Potbelly Sandwich Shop | 372 | [Nutritionix](https://www.nutritionix.com/potbelly/menu/premium) | Partial: complete numeric source rows, with source anomalies excluded and duplicates removed |
| Firebirds Wood Fired Grill | 217 | [Nutritionix](https://www.nutritionix.com/firebirds-wood-fired-grill/menu/premium) | Partial: complete numeric source rows, with source anomalies excluded and duplicates removed |
| Chopt Creative Salad Co. | 136 | [Nutritionix](https://www.nutritionix.com/chopt/menu/premium) | All complete numeric rows in retrieved source; duplicate servings deduplicated |
| Taziki’s Mediterranean Cafe | 251 | [Nutritionix](https://www.nutritionix.com/tazikis-mediterranean-cafe/menu/premium) | Partial: complete numeric source rows, with source anomalies excluded and duplicates removed |
| Flower Child | 80 | [Nutritionix](https://www.nutritionix.com/flower-child/menu/premium) | All complete numeric rows in retrieved source; duplicate servings deduplicated |
| Mellow Mushroom | 287 | [Nutritionix](https://www.nutritionix.com/mellow-mushroom/menu/premium) | All complete numeric rows in retrieved source; duplicate servings deduplicated |
| Brixx Wood Fired Pizza | 93 | [Nutritionix](https://www.nutritionix.com/brixx-wood-fired-pizza/menu/premium) | Partial: complete numeric source rows, with source anomalies excluded and duplicates removed |
| Bad Daddy’s Burger Bar | 169 | [Nutritionix](https://www.nutritionix.com/bad-daddys-burger-bar/menu/premium) | All complete numeric rows in retrieved source; duplicate servings deduplicated |
| Nothing But Noodles | 67 | [Nutritionix](https://www.nutritionix.com/nothing-but-noodles/menu/premium) | Partial: complete numeric source rows, with source anomalies excluded and duplicates removed |
| Carolina Ale House | 215 | [Nutritionix](https://www.nutritionix.com/carolina-ale-house/menu/premium) | All complete numeric rows in retrieved source; duplicate servings deduplicated |
| Clean Juice | 109 | [Nutritionix](https://www.nutritionix.com/clean-juice/menu/premium) | Partial: complete numeric source rows, with source anomalies excluded and duplicates removed |
| Eggspectation | 113 | [Nutritionix](https://www.nutritionix.com/eggspectation/menu/premium) | All complete numeric rows in retrieved source; duplicate servings deduplicated |
| Burger 21 | 98 | [Nutritionix](https://www.nutritionix.com/burger-21/menu/premium) | Partial: complete numeric source rows, with source anomalies excluded and duplicates removed |
| bb.q Chicken | 49 | [Nutritionix](https://www.nutritionix.com/bb-q-chicken/menu/premium) | All complete numeric rows in retrieved database source |
| Le Peep | 142 | [Nutritionix](https://www.nutritionix.com/le-peep/menu/premium) | Complete numeric database rows; source anomalies excluded |

| Super Chix | 98 | [Official live nutrition menu](https://nutrition.superchix.com/menu) | All exact complete active rows; published ranges and inequalities excluded |
| North Italia | 316 | [Official April 2026 PDF](https://www.northitalia.com/wp-content/uploads/2026/04/North-Italia-Nutritional-Guide-04-2026-1.pdf) | Complete numeric menu rows except one anomalous coffee row |
| Postino | 139 | [Official embedded EveryBite menu](https://app.everybite.com/widget/7d6e5b3d) | Full widget response; repeated food deduplicated, one anomalous bun held |

Regional batch total at handoff: 36 chain catalogs, 7,768 serving records. Other agents' catalogs are additional.

## Important source details and exclusions

- **Viva Chicken:** downloaded the guide linked by the current [menu page](https://vivachicken.com/menus/). The URL filename says `05.26.26`, but the page itself prints **updated 6/7/19**. Both are recorded in `sourceDate`. The PDF has no hidden per-100-g or per-3-oz heading: it actually prints quarter chicken dark/white at 120 calories, half chicken at 240, and whole chicken at 480. These unusually low numbers are preserved as the restaurant published them, not rescaled or “corrected.” A whole-page visual check confirmed the row names and column headings. A quarter/half/whole chicken record excludes separately listed sides. Sauces explicitly say 2 oz; sides explicitly say single portion. The font lacks a Unicode map, so the embedded CID characters were decoded and visually checked. Repeated add-on proteins were deduplicated. Published spelling `Balasmic` was normalized to `Balsamic` in the name only.
- **Chick-fil-A:** the current official HTML nutrition table supplies serving grams and recipe/size variations. Numeric cells duplicate values for screen-reader text; the parser reads the first actual numeric value and a dedicated item-title node. Standard grouped defaults and explicitly named variants can both appear.
- **Showmars:** only `tr[data-name]` rows in the nutrition guide are imported. Other embedded menu-detail tables include a calories-from-fat column in a different position and are deliberately excluded. The guide identifies its underlying source as Fall 2025; breakfast is not included by the publisher.
- **Bojangles:** the PDF separates three side-by-side tables; each table is parsed separately. Nutrient order is calories, calories from fat, fat, saturated fat, trans fat, cholesterol, **carbohydrates**, sodium, sugar, **protein**, fiber. Kids meals are labeled as including water, green beans, and a biscuit, per the source heading. Portion names and ounce labels are kept. The publisher says this sheet applies to company-owned stores and franchise values may vary.
- **Panera Bread:** the guide is effective **2026-09-02**. Fixed column coordinates and numeric calorie baselines preserve wrapped names and serving descriptions. Section headings are filtered by font size. Calories-from-fat is not treated as total fat. Numeric values in all 35 pages are retained, including half/whole menu portions, dressings, drinks, packaged portions, and larger containers.
- **Moe's:** the 2026 chart is primarily ingredient portions; small means tacos/kids, medium means burritos/bowls/salads/nachos/quesadillas/stacks, and double means double-protein items. These component records do not assert a full customized burrito total.
- **Tropical Smoothie Cafe:** the May 14, 2026 guide has different column layouts for smoothies and foods. Both layouts were visually checked. Published Splenda variants are separate records. Kids smoothies are 12 fl oz; adult smoothies are 24 fl oz. Supplements/add-ins and bottled drinks are labeled as listed portions. Allergen reference numbers are removed from names, not mistaken for calories. The later allergen-only pages contain no extra complete macro rows.
- **Chicken Salad Chick:** uses the first-party August 3, 2026 guide, preferred over the older conflicting Nutritionix menu. Its empty cells are not assumed to be zero. Food rows with all four required numbers are included; drinks with blank fat/protein are excluded. Chicken salad and pimento cheese are 4 oz scoops; soups distinguish cup/bowl and kids portions stay separate. Bread/BLT/melt component values explicitly exclude chicken salad as stated by the publisher. Cakes distinguish slice from whole.
- **Salsarita's:** the current nutrition-calculator page links the March 2023 filename; the guide prints a revised August 2022 note. Volume ounces and weight ounces stay distinct. Sour cream reports `<1` for required macros and is excluded. The 2 oz queso row is internally inconsistent (118 calories with zero fat/protein, despite 1 oz and 4 oz rows); it is excluded rather than used as Verified. Other published rounding is retained.
- **Jim 'N Nick's:** the current site links a PDF with overlapping text, ambiguous row labels, and at least one internally inconsistent nutrient row. The imported catalog instead uses the explicit Nutritionix database source. The problematic PDF is not used to silently repair or infer any values.
- **Jimmy John's:** the published PDF lists a July 22, 2024 effective date for nutrition. Fully assembled sandwiches across bread/size choices, desserts/sides, drinks, and limited-time food rows are included. Ingredient portion tables have merged cells that can shift names/values across rows; those tables are excluded. Required macros with inequality values are excluded. 30 oz and 32 oz drinks are separate values/servings. This is explicitly partial coverage of the source rather than an assertion that every add-on has been imported.
- **Smoothie King:** the current official page's own script fetches `https://www.smoothieking.com/data/nutrition-search.json`. The import uses its `nutritionInfoSmoothieEnhancer.nutritionInfo` portions and keeps item-specific official source URLs. Blank or `<1` required values are excluded. Portion ounces are publisher values, not converted to grams.
- **Super Chix:** the current [official nutrition page](https://www.superchix.com/nutrition) embeds `nutrition.superchix.com/menu`. The page contains public structured menu data updated in September 2026, which supersedes the older 2023 PDF found by search. The importer respects `is_active`, combines group and variant names, prefixes kids foods, and obeys display overrides: `<1` and weekly-flavor ranges are excluded rather than replaced with underlying placeholder numbers. Published 2 oz sauce notes are preserved.
- **North Italia:** the April 2026 nine-page guide has eleven nutrient columns. Calories from fat are skipped, and section headings distinguish kids, happy hour, gluten-free pasta, vegetable-noodle pasta, pizza, and regular servings. Salad portions explicitly include dressing. Alcohol calories are preserved even when macros account for less energy. Dirty Almond Chai is held because the published 250 calories materially disagree with the three macros.
- **Postino:** the official [Allergens + Nutrition page](https://www.postino.com/allergens-and-nutrition) embeds EveryBite widget `7d6e5b3d`. A read-only public GraphQL query retrieved all 141 response rows (count checked against response length). One repeated food was deduplicated and the GF Monster Bun add-on was held for its internally inconsistent calories/fat. Explicit serving weights are retained; no portion weights were inferred.
- **Nutritionix database catalogs:** all complete numeric rows of each chain's `/menu/premium` table are read by named nutrient column links (`calories`, `total_fat`, `total_carb`, `protein`), so the presence/absence of other columns does not shift macros. Some database entries may be historical or limited-time offerings. No claim is made that these database catalogs are the chain's current complete first-party menu. Published Last Updated dates are preserved in sourceDate; notably Nothing But Noodles and Eggspectation date to 2015, and Carolina Ale House and Le Peep date to 2019. Verified indicates source provenance, not recency.

## Remaining regional gaps

The restaurant-location inventory is broader than the imported batch. The durable [targeted source audit](regional-source-audit.json) records checked URLs and exact outcomes for Metro Diner, Flying Biscuit, Blackfinn, 131 MAIN, Greco Fresh Grille, Ilios Crafted Greek, Duckworth’s, Chex Grill & Wings, Burtons, Sabor, Midwood Smokehouse, Hawthorne’s, Ilios Noche, Inizio, 521 BBQ, and Charbar No. 7. Current official menus in this group expose calories only, descriptions/prices, or allergen data without the complete required macros. Their queried Nutritionix catalogs are empty or unavailable. Famous Toastery and Hickory Tavern were checked by the national research agent and have corresponding audit references.

Other unresolved regional candidates include Vicious Biscuit, Hawkers, Rooster’s, Bossy Beulah’s, Waterbean Coffee, and Cabo Fish Taco; the broader coverage inventory tracks remaining candidates and location uncertainty. This is a record of sources inspected, not proof that no nutrition document exists anywhere. Super Chix, North Italia, Postino, Tacos 4 Life, Sweetwaters, Handel’s, Jeni’s, Everbowl, and Hwy 55 have now been imported by this or another agent and are not remaining gaps. Users may add custom foods when a restaurant does not provide complete data, with those submissions remaining unverified.

## Reproduction and checks

The tracked parsers are `scripts/restaurant-import/regional.py`, `scripts/restaurant-import/nutritionix.py`, and `scripts/restaurant-import/regional-additions.py`. Research downloads/rendered screenshots live only in ignored `work/restaurant-regional/`; they are not shipped as application assets.

For the official parser, download sources into that directory using these filenames:

| Input | Source |
| --- | --- |
| `cfa.html` | Chick-fil-A source above |
| `showmars.html` | Showmars source above |
| `viva.pdf` | Viva source above |
| `bojangles.pdf` | Bojangles source above |
| `panera.pdf` | Panera source above |
| `moes.pdf` | Moe's source above |
| `tropical.pdf` | Tropical Smoothie source above |
| `csc.pdf` | Chicken Salad Chick source above |
| `salsaritas.pdf` | Salsarita's source above |
| `jimmyjohns.pdf` | Jimmy John's source above |
| `smoothieking-data.json` | `https://www.smoothieking.com/data/nutrition-search.json` |

Run with Python 3 plus `lxml` and `pdfplumber`. The official script reads all input files and fails if one is missing; the Nutritionix script accepts an explicit slug and display name, downloads to the ignored research directory, and always marks database provenance.

Validation included unique nonempty IDs, nonnegative finite numeric calories/macros, required source/serving metadata, numeric-row counts, a macro-energy discrepancy screen to catch shifted columns (not to override published rounding), and visual inspection of source table headers and representative rows. The macro-energy screen led to rejecting the broken Jim 'N Nick's PDF extraction and Jimmy John's ingredient tables and to separating the embedded Showmars table layouts. No estimated foods were marked Verified.

Source validation additionally quarantined 20 non-alcohol rows with large calorie/macro discrepancies in `regional-quarantine.json`, including Jim ’N Nick’s milk, several Potbelly dressing/Reuben portions, Brixx pizza/appetizer values, and a Nothing But Noodles salad. The original published record and exact source remain available for follow-up; no replacement number was invented. Alcoholic drinks retain their published values because alcohol contributes energy outside the three tracked macros. The CSV/JSON count above reflects exclusions.

### Additional official-source reproduction

`regional-additions.py` reads `north-italia.pdf` and `super-chix-live.html` from the North Italia and Super Chix URLs above. For Postino, send `scripts/restaurant-import/postino-query.json` as a read-only JSON POST to `https://internal-api.everybite.com/graphql` and save the response as `work/restaurant-regional/postino-response.json`. This is the public endpoint used by the restaurant's embedded widget; the query requests only published dish nutrition and requires no login or user credentials. The script checks the response count and imports names, serving metadata, and the four required nutrients. It reapplies recorded quarantines so reproducing the import does not reintroduce held source errors.
