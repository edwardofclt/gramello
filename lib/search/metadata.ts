import type { Food } from '../food';
import type { FoodSearchHit } from '../food-search';
import { normalizeSearchText } from './normalize';

// Historical USDA branded foods have no brand field. Classify only recognized names;
// unknown provenance remains untouched and this metadata is never saved as nutrition.
const packagedBrands = ['Pillsbury','Kraft','Kellogg','General Mills','Campbell','CHOBANI','DANNON','YOPLAIT','NABISCO','OSCAR MAYER','HORMEL','JIMMY DEAN','BETTY CROCKER','QUAKER','KASHI','KEEBLER','DORITOS','FRITOS','CHEETOS','CHEERIOS','SPECIAL K','POST','OREO','HERSHEY','SNICKERS','MARS','NESTLE','DIGIORNO','STOUFFER','LEAN CUISINE','SMART ONES','HEALTHY CHOICE','BOCA','MORNINGSTAR','LITTLE DEBBIE','ENTENMANN','PEPPERIDGE FARM','GEORGE WESTON'];
export function inferredFoodBrand(food: Food): string | undefined {
  if (food.brand?.trim()) return food.brand.trim();
  const name = ` ${normalizeSearchText(food.name)} `;
  return packagedBrands.find(brand => name.includes(` ${normalizeSearchText(brand)} `));
}
// Explicit ID/name/serving tuples reviewed against Cook Out's official PDF pages 2–3.
// See docs/restaurant-import/search-description-repairs.json. Old v1 ambiguous rows
// fail the tuple check, and unrelated restaurants can never inherit these groups.
const reviewedCookOutVariants: Record<string, readonly [string, string, string]> = {
  "restaurant-cook-out-coca-cola-huge-32-oz-907-2-g": [
    "Coca-Cola Huge",
    "32 oz (907.2 g)",
    "Coca-Cola"
  ],
  "restaurant-cook-out-large-24-oz-680-4-g": [
    "Coca-Cola Large",
    "24 oz (680.4 g)",
    "Coca-Cola"
  ],
  "restaurant-cook-out-sides-other-menu-items-regular-16-oz-453-6-g": [
    "Coca-Cola Regular",
    "16 oz (453.6 g)",
    "Coca-Cola"
  ],
  "restaurant-cook-out-sides-other-menu-items-small-12-oz-340-19-g": [
    "Coca-Cola Small",
    "12 oz (340.19 g)",
    "Coca-Cola"
  ],
  "restaurant-cook-out-diet-coke-huge-32-oz-907-2-g": [
    "Diet Coke Huge",
    "32 oz (907.2 g)",
    "Diet Coke"
  ],
  "restaurant-cook-out-large-24-oz-680-4-g-2": [
    "Diet Coke Large",
    "24 oz (680.4 g)",
    "Diet Coke"
  ],
  "restaurant-cook-out-sides-other-menu-items-regular-16-oz-453-6-g-2": [
    "Diet Coke Regular",
    "16 oz (453.6 g)",
    "Diet Coke"
  ],
  "restaurant-cook-out-sides-other-menu-items-small-12-oz-340-19-g-2": [
    "Diet Coke Small",
    "12 oz (340.19 g)",
    "Diet Coke"
  ],
  "restaurant-cook-out-coca-cola-zero-huge-32-oz-907-2-g": [
    "Coca-Cola Zero Huge",
    "32 oz (907.2 g)",
    "Coca-Cola Zero"
  ],
  "restaurant-cook-out-sprite-huge-32-oz-907-2-g": [
    "Sprite Huge",
    "32 oz (907.2 g)",
    "Sprite"
  ],
  "restaurant-cook-out-large-24-oz-680-4-g-3": [
    "Sprite Large",
    "24 oz (680.4 g)",
    "Sprite"
  ],
  "restaurant-cook-out-sides-other-menu-items-regular-16-oz-453-6-g-3": [
    "Sprite Regular",
    "16 oz (453.6 g)",
    "Sprite"
  ],
  "restaurant-cook-out-sides-other-menu-items-small-12-oz-340-19-g-3": [
    "Sprite Small",
    "12 oz (340.19 g)",
    "Sprite"
  ],
  "restaurant-cook-out-pibb-xtra-huge-32-oz-907-2-g": [
    "Pibb Xtra Huge",
    "32 oz (907.2 g)",
    "Pibb Xtra"
  ],
  "restaurant-cook-out-large-24-oz-680-4-g-4": [
    "Pibb Xtra Large",
    "24 oz (680.4 g)",
    "Pibb Xtra"
  ],
  "restaurant-cook-out-sides-other-menu-items-regular-16-oz-453-6-g-4": [
    "Pibb Xtra Regular",
    "16 oz (453.6 g)",
    "Pibb Xtra"
  ],
  "restaurant-cook-out-sides-other-menu-items-small-12-oz-340-19-g-4": [
    "Pibb Xtra Small",
    "12 oz (340.19 g)",
    "Pibb Xtra"
  ],
  "restaurant-cook-out-mellow-yellow-huge-32-oz-907-2-g": [
    "Mellow Yellow Huge",
    "32 oz (907.2 g)",
    "Mellow Yellow"
  ],
  "restaurant-cook-out-large-24-oz-680-4-g-5": [
    "Mellow Yellow Large",
    "24 oz (680.4 g)",
    "Mellow Yellow"
  ],
  "restaurant-cook-out-sides-other-menu-items-regular-16-oz-453-6-g-5": [
    "Mellow Yellow Regular",
    "16 oz (453.6 g)",
    "Mellow Yellow"
  ],
  "restaurant-cook-out-sides-other-menu-items-small-12-oz-340-19-g-5": [
    "Mellow Yellow Small",
    "12 oz (340.19 g)",
    "Mellow Yellow"
  ],
  "restaurant-cook-out-fanta-orange-huge-32-oz-907-2-g": [
    "Fanta Orange Huge",
    "32 oz (907.2 g)",
    "Fanta Orange"
  ],
  "restaurant-cook-out-large-24-oz-680-4-g-6": [
    "Fanta Orange Large",
    "24 oz (680.4 g)",
    "Fanta Orange"
  ],
  "restaurant-cook-out-sides-other-menu-items-regular-16-oz-453-6-g-6": [
    "Fanta Orange Regular",
    "16 oz (453.6 g)",
    "Fanta Orange"
  ],
  "restaurant-cook-out-sides-other-menu-items-small-12-oz-340-19-g-6": [
    "Fanta Orange Small",
    "12 oz (340.19 g)",
    "Fanta Orange"
  ],
  "restaurant-cook-out-hi-c-poppin-pink-lemonade-huge-32-oz-907-2-g": [
    "Hi-C Poppin' Pink Lemonade Huge",
    "32 oz (907.2 g)",
    "Hi-C Poppin' Pink Lemonade"
  ],
  "restaurant-cook-out-large-24-oz-680-4-g-7": [
    "Hi-C Poppin' Pink Lemonade Large",
    "24 oz (680.4 g)",
    "Hi-C Poppin' Pink Lemonade"
  ],
  "restaurant-cook-out-sides-other-menu-items-regular-16-oz-453-6-g-7": [
    "Hi-C Poppin' Pink Lemonade Regular",
    "16 oz (453.6 g)",
    "Hi-C Poppin' Pink Lemonade"
  ],
  "restaurant-cook-out-sides-other-menu-items-small-12-oz-340-19-g-7": [
    "Hi-C Poppin' Pink Lemonade Small",
    "12 oz (340.19 g)",
    "Hi-C Poppin' Pink Lemonade"
  ],
  "restaurant-cook-out-hi-c-fruit-punch-huge-32-oz-907-2-g": [
    "Hi-C Fruit Punch Huge",
    "32 oz (907.2 g)",
    "Hi-C Fruit Punch"
  ],
  "restaurant-cook-out-large-24-oz-680-4-g-8": [
    "Hi-C Fruit Punch Large",
    "24 oz (680.4 g)",
    "Hi-C Fruit Punch"
  ],
  "restaurant-cook-out-sides-other-menu-items-regular-16-oz-453-6-g-8": [
    "Hi-C Fruit Punch Regular",
    "16 oz (453.6 g)",
    "Hi-C Fruit Punch"
  ],
  "restaurant-cook-out-sides-other-menu-items-small-12-oz-340-19-g-8": [
    "Hi-C Fruit Punch Small",
    "12 oz (340.19 g)",
    "Hi-C Fruit Punch"
  ],
  "restaurant-cook-out-fresh-brewed-sweet-tea-huge-32-oz-907-2-g": [
    "Fresh Brewed Sweet Tea Huge",
    "32 oz (907.2 g)",
    "Fresh Brewed Sweet Tea"
  ],
  "restaurant-cook-out-large-24-oz-680-4-g-9": [
    "Fresh Brewed Sweet Tea Large",
    "24 oz (680.4 g)",
    "Fresh Brewed Sweet Tea"
  ],
  "restaurant-cook-out-sides-other-menu-items-regular-16-oz-453-6-g-9": [
    "Fresh Brewed Sweet Tea Regular",
    "16 oz (453.6 g)",
    "Fresh Brewed Sweet Tea"
  ],
  "restaurant-cook-out-sides-other-menu-items-small-12-oz-340-19-g-9": [
    "Fresh Brewed Sweet Tea Small",
    "12 oz (340.19 g)",
    "Fresh Brewed Sweet Tea"
  ],
  "restaurant-cook-out-fresh-brewed-tea-huge-32-oz-907-2-g": [
    "Fresh Brewed Tea Huge",
    "32 oz (907.2 g)",
    "Fresh Brewed Tea"
  ],
  "restaurant-cook-out-dr-pepper-huge-32-oz-907-2-g": [
    "Dr. Pepper Huge",
    "32 oz (907.2 g)",
    "Dr. Pepper"
  ],
  "restaurant-cook-out-large-24-oz-680-4-g-10": [
    "Dr. Pepper Large",
    "24 oz (680.4 g)",
    "Dr. Pepper"
  ],
  "restaurant-cook-out-sides-other-menu-items-small-12-oz-340-19-g-10": [
    "Dr. Pepper Small",
    "12 oz (340.19 g)",
    "Dr. Pepper"
  ],
  "restaurant-cook-out-cheerwine-huge-32-oz-907-2-g": [
    "Cheerwine Huge",
    "32 oz (907.2 g)",
    "Cheerwine"
  ],
  "restaurant-cook-out-large-24-oz-680-4-g-11": [
    "Cheerwine Large",
    "24 oz (680.4 g)",
    "Cheerwine"
  ],
  "restaurant-cook-out-sides-other-menu-items-regular-16-oz-453-6-g-10": [
    "Cheerwine Regular",
    "16 oz (453.6 g)",
    "Cheerwine"
  ],
  "restaurant-cook-out-sides-other-menu-items-small-12-oz-340-19-g-11": [
    "Cheerwine Small",
    "12 oz (340.19 g)",
    "Cheerwine"
  ],
  "restaurant-cook-out-powerade-mountain-blast-huge-32-oz-907-2-g": [
    "Powerade Mountain Blast Huge",
    "32 oz (907.2 g)",
    "Powerade Mountain Blast"
  ],
  "restaurant-cook-out-large-24-oz-680-4-g-12": [
    "Powerade Mountain Blast Large",
    "24 oz (680.4 g)",
    "Powerade Mountain Blast"
  ],
  "restaurant-cook-out-sides-other-menu-items-regular-16-oz-453-6-g-11": [
    "Powerade Mountain Blast Regular",
    "16 oz (453.6 g)",
    "Powerade Mountain Blast"
  ],
  "restaurant-cook-out-sides-other-menu-items-small-12-oz-340-19-g-12": [
    "Powerade Mountain Blast Small",
    "12 oz (340.19 g)",
    "Powerade Mountain Blast"
  ]
};
export function foodSearchMetadata(food: Food): FoodSearchHit {
  const category = food.id.startsWith('restaurant-') || food.sourceKind === 'restaurant' ? 'restaurant'
    : food.sourceKind === 'custom' || food.id.startsWith('custom-') ? 'custom'
      : food.id.startsWith('off-') || inferredFoodBrand(food) ? 'packaged' : 'generic';
  const hit: FoodSearchHit = { food, category };
  if (category === 'restaurant') {
    const reviewed = reviewedCookOutVariants[food.id];
    if (reviewed && food.brand === 'Cook Out' && food.source === 'Official restaurant nutrition'
      && food.sourceUrl === 'https://cookout.com/wp-content/uploads/Cook-Out-Nutrition1.pdf'
      && food.name === reviewed[0] && food.servingLabel === reviewed[1]) {
      hit.groupKey = `cook-out:beverage:${normalizeSearchText(reviewed[2])}`;
      hit.groupLabel = `Cook Out · ${reviewed[2]}`;
    }
    const name = normalizeSearchText(food.name);
    const ambiguousName = /^(small|medium|large|regular|junior|beef|chicken breast)$/.test(name);
    const ambiguousServing = /size in (?:item )?name/i.test(food.servingLabel) && !/\b(small|medium|large|regular|mini|junior|\d+)\b/i.test(food.name);
    if (ambiguousName || ambiguousServing) hit.warning = 'The source does not clearly identify this item or serving size. Check the source before choosing.';

  }
  return hit;
}
