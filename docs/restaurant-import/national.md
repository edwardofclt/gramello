# National restaurant nutrition import — 2026-09-20

This source work produced 101 catalog files containing 32,926 foods. This count includes researched catalogs awaiting location eligibility: the production import must select only catalogs matched by `coverage.json`. The inventory is not exhaustive and an imported catalog does not imply every currently sold dish is represented.

## Meaning and serving conventions

Restaurant-published records and Nutritionix database records qualify as verified by source under the requested policy. Verified means traceable to that source, not an independent laboratory certification or a guarantee of recipe availability. Every file carries an exact source URL and retrieval date. Nutritionix imports explicitly retain `source: Nutritionix` and `sourceKind: database`; they are not falsely labeled restaurant-authored. `sourceDate`, where available, is the source's own publication/update date.

All four nutrients are per listed serving, never implicitly per 100 g. Macros are grams. A missing gram weight remains missing. Rounded published numbers are preserved. `<1`, missing values, and nutrient ranges are not converted into guessed exact numbers. Nutritionix categories are retained in the serving label, with item-specific sizes in names. Provider catalogs can include components, seasonal, regional, catering, or discontinued items; availability is not inferred from a nutrition row.

## Extraction and review

- Official PDFs were parsed using explicit, source-specific column mappings with `pdfplumber`. Representative rendered pages were checked for Five Guys, Dunkin, Sonic, Cook Out, Domino's, Olive Garden, Tacos 4 Life, and Rita's. Table shapes were inspected for the others. Official First Watch/Freddy's HTML fields and McDonald's public item API were parsed by field name.
- Nutritionix's public `/menu/premium` HTML exposes rounded menu tables. The importer maps columns from header `sort=` attributes, so optional calories-from-fat / added-sugar columns cannot shift macros. Numeric IDs are retained and duplicate provider IDs collapsed. Duplicate names with different nutrient values retain their menu category.
- `national-excluded.json` contains 984 rejected source rows with source URLs and reasons (mostly absent or inequality-valued macros, plus source anomalies). This is a source quarantine record, not a set of corrections. Nonalcohol records with macro-energy disagreement above both 80 kcal and 35%, or saturated fat above total fat by more than 1 g, were held. Alcohol categories are exempt from the energy comparison because alcohol contributes energy outside carbs/fat/protein. This explains large apparent discrepancies in Taco Bell Cantina, Hooters, Red Robin, Twin Peaks and Outback drink lists.
- Specific source errors were confirmed rather than silently changed: MOD artichokes (30 kcal/88 g carbohydrate), Hardee's hash rounds (260 kcal/160 g fat), Andy's pint (990 kcal/3947 g fat), and Outback Ahi Tuna (660 kcal but fat11/carbs48/protein31). The Outback item is excluded. Older Red Robin PDF ribs had saturated fat larger than total fat; the final catalog uses the newer Nutritionix source with invalid rows held.
- Catalog validation checked nonempty names/serving labels, unique IDs and finite nonnegative numeric calories and macros. The application importer performs independent schema and location checks.

## Important catalog limits

- McDonald's: fetched all 153 product IDs on the official U.S. full-menu page. 120 exposed all required exact macros; 33 omitted or lacked required values. No endpoint fetch failures. Source endpoint: `https://www.mcdonalds.com/dnaapp/itemDetails?country=US&language=en&showLiveData=true&item=<product-id>`.
- Papa Johns: the full Nutritionix catalog replaced the initial pizza-only HTML extraction, covering 724 items after exclusions.
- Domino's includes published pizza bases, toppings, and complete specialty dishes. Component portions retain the printed fraction of pizza/hoagie where supplied; ingredient calories must not be mistaken for a complete customized pizza. Little Caesars pizza values are for a **whole pizza**, explicitly labeled that way.
- Cook Out's ambiguous chicken-style add-on rows mix base totals and add-on weights. These were excluded instead of treated as reliable standalone servings.
- Handel's: 133 named flavors/toppings have complete embedded official JSON. General finished products such as sundaes list calories/ranges only and are not imported. Null-macro flavors are recorded in exclusions. Direct HTTP requests returned403; the official page was read through the web reader and every numbered line was reconstructed before parsing JSON. No gram weight was assumed for `Small dish`.
- sweetFrog: 274 foods from the three currently linked official PDFs (frozen desserts, toppings, optional products). Frozen dessert nutrition is typically per1oz; toppings use their own published weights. Per-food source URLs identify the exact PDF.
- Tacos 4 Life:77 exact rows visually reviewed against both pages of the **March2023** guide still linked by the current official site. Family meals are labeled whole family packs. Six rows with `<1g` required macros and nine apparent erroneous soda rows (published16/21g fat even for diet drinks) were excluded. The scanned source was rendered; OCR was used only to assist and did not supply unchecked data.
- Fresh Monkee:84 human-food rows from the June2026 PDF, using unsweetened almond milk as stated by the source. Puppy Shake was excluded because it is a pet product.
- Lean Kitchen:10 featured meals published specifically on the Charlotte location page. This is a partial catalog; the rotating local ordering menu may contain additional meals.
- Rita's current2026 guide is held: main products expose ranges, while its exact topping table lacks serving quantities and contains multiple internally contradictory values. See the blocker register rather than assuming Rita's is covered.

## Reproduction

Scratch sources and downloaded scripts were moved to ignored `work/restaurant-national/`; no downloaded website JavaScript belongs in the application or lint scope. `national-snapshot-hashes.json` records cached source hashes. Useful extraction code is in `scripts/restaurant-import/`:

- `national-nutritionix.py`: parse/fetch the source catalog list from `national-sources.json`; requires Python `requests`, `beautifulsoup4`, `ftfy`.
- `national-official.py`: explicit PDF/HTML column mappings; requires `pdfplumber`, `beautifulsoup4`. It expects the named cached snapshots. The historical, unused Papa Johns and Red Robin routines are excluded from the default run.
- `national-special.py`: Handel's numbered web-reader snapshot and sweetFrog PDF extraction.
- `national-html.py`: Condado HTML table and Lean Kitchen official web-reader text.
- `national-tacos-fresh.py`: visually transcribed Tacos 4 Life fixture plus Fresh Monkee PDF text.
- `national-mcdonalds.py`: official McDonald's full-menu/product API extraction.

Run import tools only after retrieving/reviewing current sources. Do not overwrite manually reviewed records merely because a site still responds. Review quarantine output before regenerating the database migration. Raw API nutrient fields with uncomputed zeros were intentionally not used in place of displayed, rounded Nutritionix values.

## Sources and remaining gaps

`national-sources.json` is the machine-readable source/count manifest. `national-blockers.json` records exact checked URLs and the reason no usable complete source was imported. Other agents' regional/supplemental audits and `coverage.json` are separate. The following list documents only this national-source work.

| Chain | Foods | Source kind | Published/updated | Source |
| --- | ---: | --- | --- | --- |
| Andy's Frozen Custard | 206 | database | 2025-04-23 | [source](https://www.nutritionix.com/andys-frozen-custard/menu/premium) |
| Applebee's | 438 | database | 2026-09-11 | [source](https://www.nutritionix.com/applebees/menu/premium) |
| Arby's | 123 | restaurant | 2026-09 | [source](https://assets.ctfassets.net/30q5w5l98nbx/7tnKsXR1Kif6Uc7NiDwDmn/f1032e4b9027b7e61be6a93a911c0bf2/Arbys_Nutritional_and_Allergen_SEPT_2026.pdf) |
| Baskin-Robbins | 122 | database | 2025-07-26 | [source](https://www.nutritionix.com/baskin-robbins/menu/premium) |
| Bonefish Grill | 222 | database | 2025-04-29 | [source](https://www.nutritionix.com/bonefish-grill/menu/premium) |
| Bruegger's Bagels | 183 | database | 2025-05-14 | [source](https://www.nutritionix.com/brueggers/menu/premium) |
| Bruster's Real Ice Cream | 2871 | database | 2026-08-14 | [source](https://www.nutritionix.com/brusters-real-ice-cream/menu/premium) |
| Buca di Beppo | 91 | database | 2024-06-25 | [source](https://www.nutritionix.com/buca-di-beppo/menu/premium) |
| Buffalo Wild Wings | 679 | restaurant | 2026-08-18 | [source](https://assets.ctfassets.net/6dxmiqksdkqb/2XgznB5cOqQ9l1r7PQAasB/dd312340082cc00107545e7ab21318a7/BWW_Nutrition_Guide__08-18-2026_-_11-17-2026_.pdf) |
| Buffalo Wings & Rings | 998 | database | 2024-06-21 | [source](https://www.nutritionix.com/buffalo-wings-rings/menu/premium) |
| Burger King | 210 | database | 2026-07-20 | [source](https://www.nutritionix.com/burger-king/menu/premium) |
| Chili's | 356 | database | 2026-08-11 | [source](https://www.nutritionix.com/chilis/menu/premium) |
| Chipotle | 112 | database | 2024-06-27 | [source](https://www.nutritionix.com/chipotle/menu/premium) |
| Chuck E. Cheese | 228 | database | 2025-03-05 | [source](https://www.nutritionix.com/chuck-e-cheeses/menu/premium) |
| Chuy's | 124 | database | 2024-09-20 | [source](https://www.nutritionix.com/chuys/menu/premium) |
| Cicis | 224 | database | 2024-05-15 | [source](https://www.nutritionix.com/cicis-pizza/menu/premium) |
| City Barbeque | 91 | database | 2025-01-31 | [source](https://www.nutritionix.com/city-barbeque/menu/premium) |
| Cold Stone Creamery | 738 | database | 2025-05-20 | [source](https://www.nutritionix.com/cold-stone-creamery/menu/premium) |
| Condado Tacos | 93 | restaurant | Not supplied | [source](https://condadotacos.com/menu-food/nutrition/) |
| Cook Out | 141 | restaurant | Not supplied | [source](https://cookout.com/wp-content/uploads/Cook-Out-Nutrition1.pdf) |
| Cracker Barrel | 321 | database | 2025-08-05 | [source](https://www.nutritionix.com/cracker-barrel/menu/premium) |
| Crumbl Cookies | 199 | database | 2024-06-14 | [source](https://www.nutritionix.com/crumbl-cookies/menu/premium) |
| Culver's | 221 | restaurant | Not supplied | [source](https://cdn.culvers.com/menu/docs/guide-nutrition-allergen.pdf) |
| Dairy Queen | 435 | database | 2025-07-18 | [source](https://www.nutritionix.com/dairy-queen/menu/premium) |
| Dave & Buster's | 77 | database | 2025-10-31 | [source](https://www.nutritionix.com/dave-busters/menu/premium) |
| Del Taco | 101 | database | 2025-06-05 | [source](https://www.nutritionix.com/del-taco/menu/premium) |
| Dickey's Barbecue Pit | 1080 | database | 2025-07-15 | [source](https://www.nutritionix.com/dickeys-barbecue-pit/menu/premium) |
| Domino's | 729 | restaurant | 2026-01 | [source](https://www.dominos.com/cms/assets/7d2e19df-e360-41eb-a367-5ab794ab2ebc) |
| Dunkin' | 975 | restaurant | Not supplied | [source](https://assets.ctfassets.net/ubkcphxhphh0/4zSgulxInizXp52K1eizxO/8874a0423b75607ac0e0182cbf48fcf2/DD_W6_nutrition_guide.pdf) |
| Eggs Up Grill | 39 | database | 2025-04-27 | [source](https://www.nutritionix.com/eggs-up-grill/menu/premium) |
| Einstein Bros. Bagels | 229 | database | 2025-06-19 | [source](https://www.nutritionix.com/einstein-bros-bagels/menu/premium) |
| Famous Dave's | 257 | database | 2024-09-09 | [source](https://www.nutritionix.com/famous-daves/menu/premium) |
| First Watch | 149 | restaurant | Not supplied | [source](https://firstwatch.com/nutrition-and-allergens) |
| Five Guys | 66 | restaurant | 2026-09 | [source](https://www.fiveguys.com/wp-content/uploads/2026/09/Five-Guys-US-Nutrition-Allergen-Guide-English-September-2026.pdf) |
| Fox's Pizza Den | 52 | database | 2024-06-03 | [source](https://www.nutritionix.com/foxs-pizza-den/menu/premium) |
| Freddy's Frozen Custard & Steakburgers | 306 | restaurant | Not supplied | [source](https://www.freddys.com/nutrition-and-allergens) |
| Fresh Monkee | 84 | restaurant | 2026-06 | [source](https://freshmonkee.com/wp-content/uploads/2026/06/Fresh-Monkee-Nutrition-Guide.pdf) |
| Fuzzy's Taco Shop | 218 | database | 2025-01-23 | [source](https://www.nutritionix.com/fuzzys-taco-shop/menu/premium) |
| Golden Corral | 1039 | database | 2025-05-06 | [source](https://www.nutritionix.com/golden-corral/menu/premium) |
| Handel’s Homemade Ice Cream | 133 | restaurant | Not supplied | [source](https://handelsicecream.com/nutritional-info/) |
| Hardee's | 67 | database | 2024-09-13 | [source](https://www.nutritionix.com/hardees/menu/premium) |
| Honey Baked Ham | 395 | database | 2026-09-17 | [source](https://www.nutritionix.com/honeybaked-ham/menu/premium) |
| Hooters | 779 | database | 2024-06-11 | [source](https://www.nutritionix.com/hooters/menu/premium) |
| Hungry Howie's | 279 | database | 2025-06-22 | [source](https://www.nutritionix.com/hungry-howies/menu/premium) |
| Hwy 55 | 56 | database | 2025-04-27 | [source](https://www.nutritionix.com/hwy55/menu/premium) |
| IHOP | 383 | database | 2026-09-15 | [source](https://www.nutritionix.com/ihop/menu/premium) |
| Jack in the Box | 180 | database | 2025-04-28 | [source](https://www.nutritionix.com/jack-in-the-box/menu/premium) |
| Jason's Deli | 182 | database | 2025-05-20 | [source](https://www.nutritionix.com/jasons-deli/menu/premium) |
| Jet's Pizza | 246 | database | 2026-07-27 | [source](https://www.nutritionix.com/jets-pizza/menu/premium) |
| KFC | 217 | database | 2026-09-15 | [source](https://www.nutritionix.com/kfc/menu/premium) |
| Krispy Kreme | 143 | database | 2025-03-07 | [source](https://www.nutritionix.com/krispy-kreme/menu/premium) |
| Kura Sushi | 138 | database | 2024-08-05 | [source](https://www.nutritionix.com/kura-sushi/menu/premium) |
| Lean Kitchen | 10 | restaurant | Not supplied | [source](https://leankitchenco.com/charlotte/) |
| Little Caesars | 80 | restaurant | Not supplied | [source](https://littlecaesars.com/static/usnutritionguide.pdf) |
| LongHorn Steakhouse | 186 | restaurant | 2026-08-10 | [source](https://media.longhornsteakhouse.com/en_us/pdf/nutrition_allergen_guide.pdf) |
| Manhattan Bagel | 264 | database | 2024-06-26 | [source](https://www.nutritionix.com/manhattan-bagel/menu/premium) |
| Marble Slab Creamery | 665 | database | 2024-05-31 | [source](https://www.nutritionix.com/marble-slab-creamery/menu/premium) |
| Marco's Pizza | 502 | database | 2026-08-13 | [source](https://www.nutritionix.com/marcos-pizza/menu/premium) |
| McAlister's Deli | 290 | database | 2026-06-18 | [source](https://www.nutritionix.com/mcalisters-deli/menu/premium) |
| McDonald's | 120 | restaurant | Not supplied | [source](https://www.mcdonalds.com/us/en-us/full-menu.html) |
| MOD Pizza | 198 | database | 2025-06-19 | [source](https://www.nutritionix.com/mod-pizza/menu/premium) |
| Naf Naf Grill | 33 | database | 2024-06-12 | [source](https://www.nutritionix.com/naf-naf-grill/menu/premium) |
| Noodles & Company | 58 | database | 2025-04-30 | [source](https://www.nutritionix.com/noodles-company/menu/premium) |
| Olive Garden | 276 | restaurant | Not supplied | [source](https://media.olivegarden.com/en_us/pdf/olive_garden_nutrition.pdf) |
| Outback Steakhouse | 494 | restaurant | 2026-09 | [source](https://edge.sitecorecloud.io/osirestaurantpartners-piq24hos/media/Project/BBI/outback/files/obs-full-nutrition-information.pdf) |
| Panda Express | 184 | database | 2025-01-23 | [source](https://www.nutritionix.com/panda-express/menu/premium) |
| Papa Johns | 724 | database | 2024-12-18 | [source](https://www.nutritionix.com/papa-johns/menu/premium) |
| Papa Murphy's | 176 | database | 2026-08-17 | [source](https://www.nutritionix.com/papa-murphys/menu/premium) |
| Paris Baguette | 122 | database | 2024-07-10 | [source](https://www.nutritionix.com/paris-baguette/menu/premium) |
| Pei Wei | 60 | database | 2025-05-05 | [source](https://www.nutritionix.com/pei-wei-asian-diner/menu/premium) |
| Penn Station | 138 | database | 2024-06-18 | [source](https://www.nutritionix.com/penn-station-east-coast-subs/menu/premium) |
| Pizza Hut | 824 | database | 2026-09-17 | [source](https://www.nutritionix.com/pizza-hut/menu/premium) |
| Pollo Campero | 88 | database | 2026-06-18 | [source](https://www.nutritionix.com/pollo-campero/menu/premium) |
| Popeyes | 67 | database | 2025-09-29 | [source](https://www.nutritionix.com/popeyes/menu/premium) |
| Qdoba | 135 | database | 2025-03-20 | [source](https://www.nutritionix.com/qdoba/menu/premium) |
| Raising Cane's | 108 | database | 2025-10-14 | [source](https://www.nutritionix.com/raising-canes/menu/premium) |
| Red Lobster | 276 | database | 2025-06-03 | [source](https://www.nutritionix.com/red-lobster/menu/premium) |
| Red Robin | 445 | database | 2024-07-29 | [source](https://www.nutritionix.com/red-robin/menu/premium) |
| Ruby Tuesday | 191 | database | 2025-04-04 | [source](https://www.nutritionix.com/ruby-tuesday/menu/premium) |
| Salata | 263 | database | 2024-07-02 | [source](https://www.nutritionix.com/salata/menu/premium) |
| Shake Shack | 214 | database | 2025-04-22 | [source](https://www.nutritionix.com/shake-shack/menu/premium) |
| Smashburger | 45 | database | 2025-05-15 | [source](https://www.nutritionix.com/smashburger/menu/premium) |
| Sonic Drive-In | 579 | restaurant | 2026-09 | [source](https://assets.ctfassets.net/whnlxz6bna9d/665Hn9SdgyT53pJgF9cmkK/090ae5fe05d8cd9643fb98fcde32ef1a/61667-1_FEE_0926_NUTBRO_SEPTEMBER_FA_rg_WCAG.pdf) |
| Sonny's BBQ | 164 | database | 2026-06-22 | [source](https://www.nutritionix.com/sonnys-bbq/menu/premium) |
| South Block | 29 | database | 2025-05-15 | [source](https://www.nutritionix.com/south-block/menu/premium) |
| Starbucks | 3625 | database | 2026-07-16 | [source](https://www.nutritionix.com/starbucks/menu/premium) |
| Steak 'n Shake | 110 | database | 2025-06-24 | [source](https://www.nutritionix.com/steak-n-shake/menu/premium) |
| sweetFrog | 274 | restaurant | Not supplied | [source](https://www.sweetfrog.com/menu/nutrition/index.php) |
| Swig | 247 | database | 2026-07-01 | [source](https://www.nutritionix.com/swig/menu/premium) |
| Taco Bell | 513 | database | 2026-09-17 | [source](https://www.nutritionix.com/taco-bell/menu/premium) |
| Tacos 4 Life | 77 | restaurant | 2023-03 | [source](https://cdn.prod.website-files.com/6058f6299e37a624883ccdf6/6410a88f681c3d32d93b7c59_NutritionalGuideMarch2023_smaller.pdf) |
| TCBY | 81 | database | 2025-05-05 | [source](https://www.nutritionix.com/tcby/menu/premium) |
| Ted's Montana Grill | 220 | database | 2023-06-08 | [source](https://www.nutritionix.com/teds-montana-grill/menu/premium) |
| Texas Roadhouse | 253 | database | 2026-09-17 | [source](https://www.nutritionix.com/texas-roadhouse/menu/premium) |
| Habit Burger & Grill | 88 | database | 2025-05-02 | [source](https://www.nutritionix.com/the-habit-burger-grill/menu/premium) |
| Twin Peaks | 314 | database | 2025-03-08 | [source](https://www.nutritionix.com/twin-peaks/menu/premium) |
| Waffle House | 163 | database | 2025-09-29 | [source](https://www.nutritionix.com/waffle-house/menu/premium) |
| Wendy's | 222 | database | 2025-08-05 | [source](https://www.nutritionix.com/wendys/menu/premium) |
| Whataburger | 238 | database | 2024-10-08 | [source](https://www.nutritionix.com/whataburger/menu/premium) |
| Which Wich | 374 | database | 2025-04-30 | [source](https://www.nutritionix.com/which-wich/menu/premium) |
| Wingstop | 94 | database | 2025-03-24 | [source](https://www.nutritionix.com/wingstop/menu/premium) |

Explicit gaps:

- **Rita's Italian Ice** — Main products provide ranges only, not exact macros per named flavor. The only exact table (toppings, page4) has no serving quantities and multiple apparent source defects: fiber9g exceeds totalcarbs8g for CookieDoughBites, MiniGummyBears show13gfat, ChocolateChips70kcal with25gcarb/0gfat. Values match rendered PDF; no corrections or averages invented. [Checked source](https://cdn.ritasice.com/wp-content/uploads/2026/02/2026-Nutrition-Guide.pdf).
- **Mason's Famous Lobster Rolls** — Published ordering descriptions expose some calories/calorie ranges, but no complete calorie/protein/carbohydrate/fat table found. Nutritionix catalog probe returned no menu table. [Checked source](https://masonslobster.com/).
- **Famous Toastery** — Current site menu blocks say currently unavailable; linked order/menu sources do not expose all required macros. Nutritionix probe has no catalog. [Checked source](https://famoustoastery.com/).
- **Hickory Tavern** — Official menus show descriptions but no complete macro values. Nutritionix catalog probe returned no usable nutrient rows. [Checked source](https://hickorytavern.com/locations/ballantyne/menu/).
- **Chickie's & Pete's** — Official menus describe dishes without a full nutrition table. Nutritionix page has an empty menu table. [Checked source](https://chickiesandpetes.com/menu/).
- **Lee's Hoagie House** — Official menu lists sandwich sizes and ingredients but no full macros. Nutritionix table contains no nutrient rows. [Checked source](https://leeshoagiehouse.com/menu-2/).
- **Fuel Pizza** — Official menu PDF is a menu rather than a complete nutrition guide; Nutritionix catalog probe yielded no menu table. [Checked source](https://www.fuelpizza.com/wp-content/uploads/2021/09/FUEL_PaperMenu_NC_011121_web-1.pdf).
- **Hawkers** — Official dietary guide provides allergens, not required macros. Nutritionix slug variants yielded no catalog table. [Checked source](https://eathawkers.com/wp-content/uploads/2026/01/Allergen-Guide-12.25-Digital.pdf).
- **Ruby Sunshine** — Official menu and dietary-preference guide provide dish/allergen descriptions, not complete macros. Nutritionix variants yielded no catalog. [Checked source](https://rubybrunch.com/menu/).
- **Vicious Biscuit** — Official menu provides ingredients/prices but no complete macro table; Nutritionix catalog probe yielded no menu table. [Checked source](https://viciousbiscuit.com/menu/).
