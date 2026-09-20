# Supplemental restaurant nutrition imports

Audited September 20, 2026. This batch adds **11 restaurant catalogs / 1,196 serving records**. Every imported value comes from an official restaurant nutrition page, guide, or product label. Each catalog explicitly uses `sourceKind: "restaurant"`, links its sources, and preserves the stated serving. This is provenance verification, not a guarantee of laboratory accuracy or availability at every local branch.

| Chain | Servings imported | Source and scope |
| --- | ---: | --- |
| Auntie Anne's | 128 | [Official 2026 guide](https://assets.ctfassets.net/zqt8tllj2cy0/10Ezjc1ozMDByK7cBBikSn/4ca91079eaac12bb63fcec420cd0ca46/AA_2103518_NutritionAllergenGuide_W2andW3_2026_HIGHRES-1.pdf); menu portions and drinks |
| Charleys Cheesesteaks | 158 | [Official HTML nutrition tables](https://www.charleys.com/nutrition-info/); complete numeric servings |
| Cinnabon | 143 | [Official 2026 guide](https://assets.ctfassets.net/zqt8tllj2cy0/4CpaeuI6NC7VIT1noT7k78/3ea53d856d3d85ac02833bad8cde8fae/Nutritional_Guide_DOMESTIC_W2_2026_rev_7.2.pdf); excludes Carvel co-branded variants |
| Dippin' Dots | 35 | [Official product labels](https://www.dippindots.com/nutrition/); food-specific label URLs retained |
| Doc Popcorn | 19 | [Official flavor labels](https://docpopcorn.com/flavors/); per labeled cup portion |
| Everbowl | 26 | [Official nutrition pages](https://www.everbowl.com/nutritionals); base and topping components only |
| Jamba | 204 | [Official September 2026 PDF](https://assets.ctfassets.net/zqt8tllj2cy0/evcoqai6h6vOxuBZebEPF/5e40b19977920b2275a427e70e9f7915/Jamba_Nutrition_Spreadsheet_-_Sept_2026.pdf); complete numeric rows |
| Jeff's Bagel Run | 231 | [Official December 1, 2025 guide](https://d3i6xtoh90ar7z.cloudfront.net/website/JBR_Nutritional%20Information_120125.pdf); excludes ten internally inconsistent hot pumpkin-spice latte rows |
| Jeni's Splendid Ice Creams | 38 | [Official ingredients/nutrition page](https://jenis.com/pages/ingredients); all distinct full-size flavor labels visually inspected |
| Sarku Japan | 110 | [Official HTML nutrition tables](https://www.sarkujapan.com/nutrition/); complete numeric servings |
| Sbarro | 104 | [Currently linked official guide dated October 12, 2022](https://sbarro.com/wp-content/uploads/2022/10/Sbarro-Nutrition-and-Allergen-Info-10.12.22.pdf); publisher serving sizes retained |

## Portion and extraction checks

The PDFs were obtained through the restaurants' current nutrition links. Sources are snapshots, sometimes dated well before retrieval. Sbarro's old date is retained; no claim is made that the publisher updated the guide in 2026.

- **Auntie Anne's:** the source spreads use separate left/right tables aligned by row. Calories are on the left; total fat, carbohydrate and protein are on the right. Alignment was checked visually. Bucket nutrition is per stated portion, not the entire bucket: a five-serving bucket remains one of its five servings.
- **Charleys:** sandwich sizes stay in their names. Wing values are per piece and keep boneless/classic identity. Drink size headings carry through the relevant rows. Inequalities and malformed cells are excluded. The Catering Chips row, printed as 210 calories with 2 g fat, 23 g carbs, and 3 g protein, is quarantined rather than corrected.
- **Cinnabon:** the guide has distinct frozen drink formulas for Carvel co-branded stores. Those variants are excluded because the qualifying local store is Cinnabon/Jamba. Ordinary serving labels are retained.
- **Dippin' Dots and Doc Popcorn:** each explicit serving-size block is parsed independently. A bulk bag's nutrition is per labeled serving, not the whole bulk container. Grams are retained only when the label supplies them; distinct single-pack and bulk-label portions remain separate.
- **Jamba:** fat/carbohydrate/protein columns were matched to their headers across both table widths. The Cloud Whip row prints an internally inconsistent 170 g fat with 170 calories and is quarantined. The error is not silently reinterpreted as 17 g or 8 g.
- **Sarku Japan:** side substitutions retain the associated entrée name; drinks retain the preceding named beverage. Party trays distinguish a per-person portion from the whole-tray total. The 44 oz Minute Maid Lemonade row, printed with 570 calories and 258 g carbs, is quarantined.
- **Sbarro:** whole-pizza entries stay labeled **Full Pizza**, with their full-pizza calorie totals and published weights. Slice nutrition is not substituted for a whole pizza or vice versa.
- **Jeff's Bagel Run:** fixed column coordinates and numeric-row boundaries preserve wrapped item names across all 27 pages. The first official PDF found was September 2025, but the current [menu page](https://www.jeffsbagelrun.com/menu/other) links the December 2025 version, which was used. All 241 numeric rows were extracted; ten hot pumpkin-spice latte rows were quarantined because the section has sugars exceeding total carbs and/or substantial calorie-to-macro discrepancies. The retained catalog has 231 rows. Exact source weights in named butter portions are retained; beverage ounces are not converted into grams.
- **Everbowl:** the importer uses named nutrient columns in 26 ingredient tables. Mango, passion fruit, pineapple, ube, and guava base pages plus Nutella did not return tables. The linked consolidated PDF failed certificate validation and browser retrieval returned 502. The assembled bowl labels have no downloadable link in the retrieved HTML. No full bowl or smoothie totals were invented from toppings.
- **Jeni's:** 81 image appearances reduce to 38 distinct full-size flavors plus ten packaged mini-cup labels and repeated category appearances. OCR staged the extraction, and **all 38 imported source images were then visually inspected** for serving grams, calories, fat, carbs, and protein. Each food links its exact label image. Numbers come from the **per-serving** column, not the per-container column. Maple Soaked Pancakes gives a 123 g serving without a cup amount; the catalog preserves that omission. The standardized flavor portion does not claim to equal a shop scoop, cone or assembled sundae. Packaged mini-cup labels were outside this restaurant-portion batch.

No missing macro was converted to zero. No volume-to-weight conversions were inferred. Published rounded values were preserved; the calorie-versus-macro calculation was a diagnostic for bad extraction or pronounced source inconsistencies, not a replacement for publisher calories.

## Reproduction

`scripts/restaurant-import/supplemental.py --fetch` downloads the eight original supplemental sources, extracts official tables/product labels, and regenerates their catalogs. It requires Python, `beautifulsoup4`, and `pdfplumber`.

`scripts/restaurant-import/desserts.py --fetch` regenerates the Everbowl and Jeff's Bagel Run catalogs. Re-check its documented fixed PDF column boundaries before changing source versions. Both scripts can reuse the audited downloads in ignored `work/restaurant-supplemental/` and `work/restaurant-desserts/` without `--fetch`.

Jeni's is a visual transcription: its catalog is the durable table, and each food's `sourceUrl` is the precise image that was checked. Refreshing these records requires reading the new label, preserving per-serving rather than container values, and updating its serving weight.

Validation checked nonempty unique IDs, nonnegative finite numeric values, complete calorie/macro fields, source/serving metadata, specific source examples, and source portion distinctions. Both tracked importers were rerun against the cached inputs.

## Unresolved source audits

[dessert-source-audit.json](dessert-source-audit.json) records precise attempted URLs and outcomes for PopUp Bagels, The Salty Donut, Honeysuckle Gelato, Tifa, Häagen-Dazs shops, the US Coffee Republic chain, Bossy Beulah's, and Brasserie Copain. These are inspected-source limitations, not claims that nutrition can never be obtained. None of their missing values was filled with a similarly named chain, another country's menu, or an estimate.
