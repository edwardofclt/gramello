# Sweetwaters Coffee & Tea

Imported 619 complete numeric portions from the 22-page [official nutrition guide](https://www.sweetwaterscafe.com/sc-columbia-park-st/wp-content/uploads/2018/05/SW_BeverageFood_Nutrition_Sheet_1-30-2020.pdf), still linked by the [official cafe page](https://www.sweetwaterscafe.com/sc-columbia-park-st/) on 2026-09-20. The guide is dated **2020-01-30**, not 2026; current availability and newer recipes are not established by this snapshot. Geographic eligibility comes from the RedStone directory in coverage.json.

The extraction reads explicit table columns: calories index 2, total fat 3, carbs 8, protein 11. Vertically merged beverage names are carried only within each page table. Beverage sizes remain Single/Double/Triple as printed; no fluid ounces or gram weights are guessed. Printed food gram weights are retained. The table header and row alignment were checked in a rendered page. Published source values remain unchanged.

Eight incomplete or internally inconsistent source rows are excluded, with exact original cells and page numbers in sweetwaters-excluded.json. For example, some printed sandwich and drink calories disagree substantially with their printed macro totals. The importer does not attempt to correct them. Reproduce using scripts/restaurant-import/sweetwaters.py and the linked PDF.
