import { afterAll, describe, expect, it } from 'vitest';
import { createCatalogReader } from '../mobile/src/catalog/queries';
import { testDatabase } from './helpers/local-sqlite';
const catalog = testDatabase('mobile/assets/catalog.sqlite');
const reader = createCatalogReader(work => work(catalog.db));
afterAll(() => catalog.raw.close());
describe('food search candidate retrieval', () => {
  it.each([['egg','usda-171287'],['rice','usda-168878'],['chicken breast','usda-171477']])('recovers the everyday %s before broad catalog truncation', async (query,id) => {
    const results = await reader.search(query);
    expect(results.slice(0,10).map(food => food.id)).toContain(id);
  });
  it.each(['mcdonalds','chickfila','greek yoghurt','chikcen breast'])('retrieves curated alias or typo %s', async query => {
    expect((await reader.search(query)).length).toBeGreaterThan(0);
  });
  it('does not let a generic egg query lead with prefix-only Eggspectation matches', async () => {
    expect((await reader.search('egg'))[0].name).toMatch(/^Egg,/);
  });
});

import { analyzeFoodQuery, foodSearchMetadata, rankFoodSearch } from '../lib/search';
import type { Food } from '../lib/food';
const sample = (id: string, name: string, overrides: Partial<Food> = {}): Food => ({ id,name,source:'Example',sourceKind:'database',nutritionBasis:'100g',servingGrams:100,servingLabel:'100 g',calories:100,protein:10,carbs:10,fat:2,...overrides });
describe('shared relevance and metadata', () => {
  it('recognizes singular berries against plural catalog names', async () => {
    expect((await reader.search('strawberry raw')).some(food => food.name === 'Strawberries, raw')).toBe(true);
  });
  it('prioritizes exact restaurant brands over a partial packaged brand', () => {
    const restaurant = sample('restaurant-viva-test','Chicken meal',{brand:'Viva Chicken'});
    const packaged = sample('off-unrelated','Chicken chips',{brand:'Viva'});
    expect(rankFoodSearch('Viva Chicken',[packaged,restaurant]).foods[0].id).toBe(restaurant.id);
  });
  it('keeps restaurant classification separate from third-party database provenance', () => {
    expect(foodSearchMetadata(sample('restaurant-kfc-123','Chicken',{brand:'KFC'})).category).toBe('restaurant');
  });
  it('flags ambiguous records without grouping by name or changing nutrition', () => {
    const food = sample('restaurant-firehouse-subs-one','Chicken Breast',{brand:'Firehouse Subs',servingGrams:null,servingLabel:'1 menu serving (size in name)',nutritionBasis:'serving'});
    const hit = foodSearchMetadata(food);
    expect(hit.warning).toBeTruthy();
    expect(hit.groupKey).toBeUndefined();
    expect(hit.food).toBe(food);
    expect(rankFoodSearch('firehouse chicken breast',[food,{...food,id:'restaurant-firehouse-subs-two',calories:200}]).foods).toHaveLength(2);
  });
  it('retains distinct raw, cooked, breaded, zero and size records by source ID', () => {
    const foods = ['Chicken breast raw','Chicken breast cooked','Chicken breast breaded'].map((name,i)=>sample(`f-${i}`,name));
    expect(rankFoodSearch('chicken breast',foods).foods).toHaveLength(3);
    expect(rankFoodSearch('chicken breast raw',foods).foods.map(f=>f.id)).toEqual(['f-0']);
    expect(rankFoodSearch('chicken breast cooked',foods).foods.map(f=>f.id)).toEqual(['f-1']);
    const drinks = [sample('zero','Cola Zero Sugar'),sample('regular','Cola')];
    expect(rankFoodSearch('cola zero sugar',drinks).foods.map(f=>f.id)).toEqual(['zero']);
  });
  it('offers bounded typo corrections but never rewrites short or unknown terms', () => {
    expect(analyzeFoodQuery('chikcen breast').correction).toBe('chicken breast');
    expect(analyzeFoodQuery('egg').correction).toBeUndefined();
    expect(analyzeFoodQuery('xylophonemeal').correction).toBeUndefined();
  });
  it('applies category and canonical brand filters', async () => {
    const results = await reader.search('chicken',{category:'restaurant',brand:'chickfila'});
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(food=>food.brand === 'Chick-fil-A')).toBe(true);
  });
  it('expands the retrieval window instead of repeatedly returning the same truncated set', async () => {
    const narrow = await reader.search('chicken',{category:'restaurant',window:100});
    const wide = await reader.search('chicken',{category:'restaurant',window:200});
    expect(wide.length).toBeGreaterThan(narrow.length);
  });
});

it('groups only source-reviewed Cook Out beverage sizes, leaving old ambiguous rows separate', () => {
  const base = sample('restaurant-cook-out-large-24-oz-680-4-g','Coca-Cola Large',{brand:'Cook Out',sourceKind:'restaurant',source:'Official restaurant nutrition',sourceUrl:'https://cookout.com/wp-content/uploads/Cook-Out-Nutrition1.pdf',servingLabel:'24 oz (680.4 g)',nutritionBasis:'serving'});
  const hit = foodSearchMetadata(base);
  expect(hit.groupKey).toBeTruthy();
  expect(foodSearchMetadata({...base,name:'Large'}).groupKey).toBeUndefined();
  expect(foodSearchMetadata({...base,id:'restaurant-other-large'}).groupKey).toBeUndefined();
  expect(foodSearchMetadata({...base,servingLabel:'1 serving'}).groupKey).toBeUndefined();
});
it('finds legacy embedded package brands before truncation', async () => {
  const foods = await reader.search('yogurt',{category:'packaged',brand:'Chobani'});
  expect(foods.length).toBeGreaterThan(0);
  expect(foods.every(food=>/chobani/i.test(food.name))).toBe(true);
});

it.each([['mango','usda-169910'],['almond','usda-170567'],['cheddar cheese','usda-173414'],['black beans','usda-173735']])('keeps the food itself above restaurant ingredients for %s', async (query,id) => {
  expect((await reader.search(query)).slice(0,10).map(food=>food.id)).toContain(id);
});

it.each([['milk','usda-171265'],['skim milk','usda-171269'],['potato','usda-170026']])('puts ordinary %s ahead of flavored or restaurant versions', async (query,id) => {
  expect((await reader.search(query)).slice(0,5).map(food=>food.id)).toContain(id);
});

import judgments from './fixtures/food-search-relevance.json';
describe('independently specified catalog relevance judgments (development set)', () => {
  it.each(judgments.queries)('finds a judged relevant $query in the first ten', async judgment => {
    const top = (await reader.search(judgment.query,{window:100})).slice(0,10);
    expect(top.some(food => judgment.relevantIds?.includes(food.id) || (judgment.relevantBrand && food.brand === judgment.relevantBrand)), judgment.judgment).toBe(true);
  });
});
it('classifies known packaged IDs even when a provider omitted brand', () => {
  expect(foodSearchMetadata(sample('off-0012345678905','Oat cereal')).category).toBe('packaged');
});
it('does not spell-correct an exact selected brand while retrieving native candidates', async () => {
  const cache = testDatabase();
  try {
    cache.raw.exec('CREATE TABLE foods(id TEXT PRIMARY KEY,name TEXT,food TEXT); CREATE VIRTUAL TABLE food_search USING fts5(id UNINDEXED,name,brand);');
    const food = sample('off-brand-fixture', 'Oat cereal', { brand: 'Brice' });
    cache.raw.prepare('INSERT INTO foods VALUES(?,?,?)').run(food.id,food.name,JSON.stringify(food));
    cache.raw.prepare('INSERT INTO food_search VALUES(?,?,?)').run(food.id,food.name,food.brand ?? '');
    const cached = createCatalogReader(work => work(cache.db));
    expect((await cached.search('oat cereal', { category: 'packaged', brand: 'Brice' })).map(result => result.id)).toEqual([food.id]);
  } finally { cache.raw.close(); }
});
it('reports saturated candidate lanes even when later category filters remove most matches', async () => {
  const result = await reader.searchWindow!('chicken',{window:20,category:'generic'});
  expect(result.canExpand).toBe(true);
  expect((await reader.searchWindow!('banana raw',{window:1000})).canExpand).toBe(false);
});
it('uses bundled search if opening the installed database fails', async () => {
  const broken = createCatalogReader(async () => { throw new Error('unavailable'); }, reader);
  expect((await broken.search('banana raw')).some(food=>food.id==='usda-173944')).toBe(true);
});
it('gives an installed renamed record precedence over an old bundled match', async () => {
  const installed = testDatabase();
  try {
    installed.raw.exec(`CREATE TABLE foods(id TEXT PRIMARY KEY,name TEXT,food TEXT); CREATE VIRTUAL TABLE food_search USING fts5(id UNINDEXED,name,brand);`);
    const updated = sample('usda-173944','Plantains, raw');
    installed.raw.prepare('INSERT INTO foods VALUES(?,?,?)').run(updated.id,updated.name,JSON.stringify(updated));
    installed.raw.prepare('INSERT INTO food_search VALUES(?,?,?)').run(updated.id,updated.name,'');
    const withUpdate = createCatalogReader(work=>work(installed.db),reader);
    expect((await withUpdate.search('banana raw')).some(food=>food.id===updated.id)).toBe(false);
  } finally { installed.raw.close(); }
});

it('normalizes low-fat spelling while keeping nonfat and whole-milk variants distinct', async () => {
  const lowfat = await reader.search('greek yogurt low-fat');
  expect(lowfat.some(food=>food.id==='usda-170903')).toBe(true);
  expect(lowfat.some(food=>food.id==='usda-170894' || food.id==='usda-171304')).toBe(false);
});

import { foodMatchesQuery } from '../lib/search';
it('retains real toasted foods before considering a roasted typo suggestion', async () => {
  const results = await reader.search('bread toasted');
  expect(results.length).toBeGreaterThan(0);
  expect(results.every(food=>/toasted/i.test(food.name))).toBe(true);
  expect(rankFoodSearch('bread toasted',results).correction).toBeUndefined();
});
it('prefers an exact original custom word over a nearby dictionary correction', () => {
  const original = sample('custom-original','Brice bowl',{sourceKind:'custom'});
  const corrected = sample('rice','Rice bowl');
  expect(foodMatchesQuery('brice bowl',original)).toBe(true);
  const result = rankFoodSearch('brice bowl',[corrected,original]);
  expect(result.foods.map(food=>food.id)).toEqual(['custom-original']);
  expect(result.correction).toBeUndefined();
});
it('uses and labels the typo fallback when no original exact food exists', () => {
  const food = sample('chicken','Chicken breast');
  expect(rankFoodSearch('chikcen breast',[food])).toMatchObject({foods:[food],correction:'chicken breast'});
});
it.each(['brice', 'brice bo', 'brice bow', 'brice bowl'])('keeps the original custom name while typing %s', query => {
  const food = sample('custom-original','Brice bowl',{sourceKind:'custom'});
  const result = rankFoodSearch(query,[food,sample('rice','Rice bowl')]);
  expect(result.foods.map(item => item.id)).toEqual([food.id]);
  expect(result.correction).toBeUndefined();
});
it('never suggests changing a correctly spelled preparation when no results exist', () => {
  expect(analyzeFoodQuery('toasted imaginaryfood').correction).toBeUndefined();
});
it.each(['green beans','green onions','scallion'])('keeps the original green-food intent for %s', async query => {
  const foods = await reader.search(query);
  expect(foods.length).toBeGreaterThan(0);
  expect(foods.every(food=>!/greek/i.test(food.name))).toBe(true);
  expect(rankFoodSearch(query,foods).correction).toBeUndefined();
});
