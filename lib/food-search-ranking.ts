import type { Food } from './food';
import { referenceFoods } from './reference-foods';

const stapleIds = new Set(referenceFoods.map(food => food.id));

// Retrieve enough candidates to rank before applying the UI's 100-result cap.
export const FOOD_SEARCH_CANDIDATE_LIMIT = 1000;

export function foodSearchWords(value: string, foldAccents = true): string[] {
  return (foldAccents ? value.normalize('NFKD').replace(/\p{M}/gu, '') : value).toLowerCase()
    .replace(/[‘’ʼ']/g, '').match(/[\p{L}\p{N}]+/gu) ?? [];
}

function wordForms(word: string): string[] {
  const base = singular(word);
  const plural = /(?:berry|cherry)$/.test(base) ? `${base.slice(0, -1)}ies`
    : /(?:potato|tomato|ch|sh|x|zz)$/.test(base) ? `${base}es` : `${base}s`;
  return [...new Set([word, base, plural])];
}

function singular(word: string): string {
  if (/(?:berries|cherries)$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(?:potatoes|tomatoes)$/.test(word)) return word.slice(0, -2);
  if (/(?:ches|shes|xes|zzes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

export function foodSearchTerms(query: string): string[] {
  return foodSearchWords(query).slice(0, 10);
}

// The original term remains a prefix for as-you-type searches; its singular is
// a whole word so "eggs" can find "egg" without expanding into "eggplant".
export function foodSearchMatch(query: string): string | null {
  const terms = foodSearchTerms(query);
  if (!terms.length) return null;
  const match = (words: string[]) => words.map(term => {
    const alternatives = wordForms(term).filter(word => word !== term).map(word => `"${word}"`);
    return `("${term}"* OR ${alternatives.join(' OR ')})`;
  }).join(' AND ');
  // Existing catalogs index apostrophes as word boundaries. Preserve that
  // spelling too (e.g. O'Brien) while filtering/ranking normalized names.
  const separated = foodSearchTerms(query.replace(/[‘’ʼ']/g, ' '));
  return terms.join(' ') === separated.join(' ') ? match(terms) : `(${match(terms)}) OR (${match(separated)})`;
}

// SQL LIKE is only candidate retrieval; word boundaries and ranking are applied
// to the decoded foods so substrings such as "rice" in "licorice" do not match.
export function foodSearchLikeTerms(query: string): string[][] {
  // SQLite LIKE does not fold accents. Include the literal spelling as well as
  // the normalized one so entering an accented name keeps finding stored rows.
  const literal = foodSearchWords(query, false).slice(0, 10);
  return foodSearchTerms(query).map((term, index) => [...new Set([...wordForms(term), ...(literal[index] ? wordForms(literal[index]) : [])])]);
}

export function rankFoodSearch(foods: readonly Food[], query: string): Food[] {
  const terms = foodSearchTerms(query);
  if (!terms.length) return [];
  const normalized = terms.map(singular).join(' ');
  const unique = new Map<string, Food>();
  // Callers put the authoritative/freshest copy first.
  for (const food of foods) if (!unique.has(food.id)) unique.set(food.id, food);
  return [...unique.values()].flatMap((food, index) => {
    const name = foodSearchWords(food.name), brand = foodSearchWords(food.brand ?? '');
    const all = [...name, ...brand];
    const full = (words: string[]) => terms.every(term => words.some(word => singular(word) === singular(term)));
    const prefix = (words: string[]) => terms.every(term => words.some(word => singular(word) === singular(term) || word.startsWith(term)));
    if (!prefix(all)) return [];
    const namePhrase = name.map(singular).join(' '), brandPhrase = brand.map(singular).join(' ');
    const tier = namePhrase === normalized ? 1000 : brandPhrase === normalized ? 900
      : full(name) ? 800 : full(all) ? 700 : prefix(name) ? 600 : 500;
    // Prefer simple staple descriptions within the same match tier. Source
    // ordering never lets an unrelated provider hit displace a matching food.
    const score = tier + 30 * Math.min(terms.length / Math.max(name.length, 1), 1)
      + (namePhrase.startsWith(`${normalized} `) ? 4 : 0)
      + (stapleIds.has(food.id) ? 35 : 0)
      + (!food.brand && food.id.startsWith('usda-') ? 5 : 0) - Math.min(name.length, 20);
    return [{ food, score, index }];
  }).sort((a, b) => b.score - a.score || a.index - b.index).map(({ food }) => food);
}
