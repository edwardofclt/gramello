import type { Food } from '../food';
import type { FoodSearchOptions, FoodSearchResult } from '../food-search';
import { analyzeFoodQuery, foodSearchTerms, normalizeSearchText } from './normalize';
import { foodSearchMetadata, inferredFoodBrand } from './metadata';
import lexicon from './lexicon.generated';
const genericVocabulary = new Set(lexicon.genericWords.flatMap(word=>foodSearchTerms(word)));

// Anchors recover common preparations before FTS caps. They do not change labels or
// nutrient values, and still must match every query term before receiving a boost.
const staples: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['egg', ['usda-171287','usda-173424','usda-172187','usda-173423']],
  ['rice', ['usda-168878','usda-169704','usda-168877']],
  ['milk', ['usda-171265','usda-171269','usda-172217']],
  ['potato', ['usda-170026']],
  ['chicken', ['usda-171477','usda-171077','usda-171534','usda-171052','usda-171054']],
];
export function stapleFoodIds(query: string): string[] {
  const tokens = analyzeFoodQuery(query).tokens;
  return staples.filter(([word]) => tokens.includes(word)).flatMap(([,ids]) => [...ids]);
}
function matchTokens(tokens: string[], name: string[], brand: string[]): boolean {
  const all = [...name, ...brand];
  return tokens.every((token, i) => all.includes(token) || (i === tokens.length - 1 && token.length >= 2 && all.some(word => word.startsWith(token))));
}
function queryConstraints(query: string) {
  const normalized = normalizeSearchText(query), canonical = foodSearchTerms(query);
  return { freshProduce: /\bfresh\b/.test(normalized) && canonical.includes('raw'), skinless: canonical.includes('skinless') };
}
function allowsPreparation(constraints: ReturnType<typeof queryConstraints>, name: string) {
  const normalized = normalizeSearchText(name);
  if (constraints.freshProduce && /\b(frozen|canned|dried|dehydrated|cooked|boiled|roasted|fried|puree|juice|sweetened|syrup)\b/.test(normalized)) return false;
  if (constraints.skinless && /\b(with skin|skin on|includes skin|meat and skin)\b/.test(normalized)) return false;
  return true;
}
export function foodMatchesQuery(query: string, food: Food): boolean {
  const analyzed = analyzeFoodQuery(query);
  const original = foodSearchTerms(analyzed.normalized).slice(0,10);
  const name = foodSearchTerms(food.name), brand = foodSearchTerms(inferredFoodBrand(food) ?? '');
  // Candidate collection retains originals so a later cross-source ranking pass can
  // choose an exact original over a suggested spelling correction.
  return original.length > 0 && allowsPreparation(queryConstraints(query),food.name)
    && (matchTokens(original,name,brand) || matchTokens(analyzed.tokens,name,brand));
}
export function rankFoodSearch(query: string, foods: readonly Food[], options: FoodSearchOptions = {}): FoodSearchResult {
  const analyzed = analyzeFoodQuery(query);
  let tokens = analyzed.tokens;
  if (!tokens.length) return { foods: [], hits: [], brands: [] };
  const anchors = stapleFoodIds(query);
  const constraints = queryConstraints(query);
  const brandFilter = foodSearchTerms(options.brand ?? '').join(' ');
  const unique = new Map<string, Food>();
  for (const food of foods) if (!unique.has(food.id)) unique.set(food.id, food);
  const original = foodSearchTerms(analyzed.normalized).slice(0,10);
  const originalFound = !!analyzed.correction && [...unique.values()].some(food => {
    if (!allowsPreparation(constraints,food.name)) return false;
    if (options.category && options.category !== 'all' && foodSearchMetadata(food).category !== options.category) return false;
    const brand = foodSearchTerms(inferredFoodBrand(food) ?? '');
    if (brandFilter && brand.join(' ') !== brandFilter) return false;
    return matchTokens(original, foodSearchTerms(food.name), brand);
  });
  if (originalFound) tokens = original;
  const matches = [...unique.values()].map(food => {
    const searchName = food.name.replace(/\s*\(Includes foods for USDA[^)]*\)/gi, '');
    const hit = foodSearchMetadata(food), name = foodSearchTerms(searchName), brand = foodSearchTerms(inferredFoodBrand(food) ?? '');
    if (!allowsPreparation(constraints,food.name)) return null;
    if (options.category && options.category !== 'all' && hit.category !== options.category) return null;
    if (brandFilter && brand.join(' ') !== brandFilter) return null;
    if (!matchTokens(tokens,name,brand)) return null;
    const exact = tokens.every(token => name.includes(token) || brand.includes(token));
    const explicitBrand = brand.length > 0 && (brand.every(token => tokens.includes(token))
      || (tokens.length > 1 && brand.some(token => token.length >= 4 && tokens.includes(token) && !genericVocabulary.has(token))));
    const content = tokens.filter(token => !explicitBrand || !brand.includes(token));
    const nameExact = content.length > 0 && content.every(token => name.includes(token));
    const segments = searchName.split(',');
    const taxonomy = /^(nuts|fish|beverages|seeds)$/i.test(segments[0]);
    const head = foodSearchTerms(segments.slice(taxonomy ? 1 : 0, 2).join(' '));
    let score = exact ? 300 : 0;
    if (explicitBrand) score += 550 + (brand.every(token => tokens.includes(token)) ? brand.length * 140 : 0)
      + (brand.join(' ') === tokens.join(' ') ? 300 : 0);
    else if (hit.category === 'generic') score += 100;
    else if (hit.category === 'custom') score += 110;
    if (nameExact) score += 80;
    if (content.length && name.join(' ') === content.join(' ')) score += 100;
    if (content.length && content.every(token => head.includes(token))) {
      score += 100;
      if (hit.category === 'generic' && head.every(token => content.includes(token))) score += 90;
    }
    // Prefer a food itself to sauces/snacks/dishes containing that food.
    if (content.length && name[0] === content[0]) score += 35;
    if (anchors.includes(food.id) && !explicitBrand) score += 180 - anchors.indexOf(food.id) * 2;
    if (!tokens.some(t => ['dried','powder','frozen','breaded','batter','skin','giblet','baby','infant'].includes(t))) {
      if (name.some(t => ['dried','powder','breaded','batter','giblet','baby','infant'].includes(t))) score -= 45;
    }
    if (!tokens.some(t => ['vanilla','strawberry','blueberry','chocolate','fruit'].includes(t)) && name.includes('plain')) score += 18;
    if (hit.warning) score -= 35;
    score -= Math.min(name.length, 35) * 1.5;
    return { hit, score };
  }).filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a,b) => b.score - a.score || normalizeSearchText(a.hit.food.name).localeCompare(normalizeSearchText(b.hit.food.name)) || a.hit.food.id.localeCompare(b.hit.food.id));
  const hits = matches.map(item => item.hit);
  return { foods: hits.map(hit => hit.food), hits,
    brands: [...new Set(hits.map(hit => inferredFoodBrand(hit.food)).filter((brand): brand is string => !!brand))].sort(),
    ...(analyzed.correction && !originalFound ? { correction: analyzed.correction } : {}) };
}
