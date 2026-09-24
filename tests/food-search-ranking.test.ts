import { describe, expect, it } from 'vitest';
import type { Food } from '../lib/food';
import { rankFoodSearch } from '../lib/food-search-ranking';
import { createCatalogReader } from '../mobile/src/catalog/queries';
import { testDatabase } from './helpers/local-sqlite';

const food = (id: string, name: string, brand?: string): Food => ({
  id, name, brand, source: 'Test catalog', calories: 100, protein: 10, carbs: 5, fat: 5,
  servingGrams: 100, servingLabel: '100 g',
});

describe('food search relevance', () => {
  it('ranks whole-word eggs above marketing prefixes and excludes unrelated products', () => {
    const results = rankFoodSearch([
      food('off-mayo', "Mayonnaise Classique à l’huile de colza", 'Lesieur'),
      food('off-cheese', 'Queso blanco pasteurizado', 'Hacendado'),
      food('restaurant-special', 'Eggsileration', 'Cafe'),
      food('off-aubergine', 'Eggplant'),
      food('usda-egg', 'Egg, whole, raw, fresh'),
      food('exact', 'Eggs'),
    ], '  EGGS  ');
    expect(results.map(item => item.id)).toEqual(['exact', 'usda-egg', 'restaurant-special']);
  });

  it.each([
    ['eggs', 'Large egg, whole, raw'], ['egg', 'Eggs, scrambled'],
    ['bananas', 'Banana, raw'], ['potatoes', 'Potato, baked'],
    ['tomatoes', 'Tomato, raw'], ['strawberries', 'Strawberry yogurt'],
    ['cookies', 'Cookie'], ['asparagus', 'Asparagus'],
    ['chicken breast', 'Breast of chicken, roasted'], ['chick bre', 'Chicken breast'],
    ['creme brulee', 'Crème brûlée'], ["mcdonalds", 'McDonald’s fries'],
  ])('matches %s to %s', (query, name) => {
    expect(rankFoodSearch([food('match', name)], query)).toHaveLength(1);
  });

  it('requires every term in the name or brand and keeps exact brands first', () => {
    const results = rankFoodSearch([
      food('split', 'Chicken chips', 'Viva'),
      food('missing', 'Chicken meal', 'Another restaurant'),
      food('brand', 'Quarter chicken', 'Viva Chicken'),
    ], 'viva chicken');
    expect(results.map(item => item.id)).toEqual(['brand', 'split']);
    expect(rankFoodSearch([food('substring', 'Licorice')], 'rice')).toEqual([]);
    expect(rankFoodSearch([food('any', 'Egg')], ' -- ')).toEqual([]);
  });

  it('deduplicates without replacing the authoritative nutrition', () => {
    const fresh = { ...food('same', 'Egg'), calories: 143 };
    expect(rankFoodSearch([fresh, { ...fresh, calories: 100 }], 'eggs')).toEqual([fresh]);
  });

  it.each(['Thomas', 'Thomas’', "Thomas'", '“Thomas”', '  THOMAS! ', 'Thomas cinnamon-raisin'])('finds punctuated bread names for %s', query => {
    const bread = food('bread', 'Thomas’ Cinnamon Raisin Bread');
    expect(rankFoodSearch([bread], query)).toEqual([bread]);
  });
});

describe('downloaded catalog relevance', () => {
  it('finds Thomas’ bread with or without apostrophes in either the name or brand', async () => {
    const { db, raw } = testDatabase();
    try {
      raw.exec('CREATE TABLE foods(id TEXT PRIMARY KEY,name TEXT,food TEXT); CREATE VIRTUAL TABLE food_search USING fts5(id UNINDEXED,name,brand);');
      const breads = [food('name', 'Thomas’ Cinnamon Raisin Bread'), food('brand', 'Cinnamon-Raisin Bread', "Thomas'"), food('internal', "O’Brien’s Bread")];
      for (const bread of breads) {
        raw.prepare('INSERT INTO foods VALUES(?,?,?)').run(bread.id, bread.name, JSON.stringify(bread));
        raw.prepare('INSERT INTO food_search VALUES(?,?,?)').run(bread.id, bread.name, bread.brand ?? '');
      }
      const reader = createCatalogReader(work => work(db));
      for (const query of ['Thomas', 'Thomas’', "Thomas'", 'Thomas cinnamon-raisin']) {
        expect((await reader.search(query)).map(food => food.id).sort()).toEqual(['brand', 'name']);
      }
      for (const query of ["O'Brien's", 'obrien', 'obriens', 'OBRIENS bread']) {
        expect((await reader.search(query)).map(food => food.id)).toEqual(['internal']);
      }
    } finally { raw.close(); }
  });
  it('finds singular eggs before the result cap even when prefixes fill the first 100 matches', async () => {
    const { db, raw } = testDatabase();
    try {
      raw.exec('CREATE TABLE foods(id TEXT PRIMARY KEY,name TEXT,food TEXT); CREATE VIRTUAL TABLE food_search USING fts5(id UNINDEXED,name,brand);');
      const insert = (value: Food) => {
        raw.prepare('INSERT INTO foods VALUES(?,?,?)').run(value.id, value.name, JSON.stringify(value));
        raw.prepare('INSERT INTO food_search VALUES(?,?,?)').run(value.id, value.name, value.brand ?? '');
      };
      for (let i = 0; i < 150; i++) insert(food(`prefix-${i}`, 'Eggstravaganza'));
      insert(food('staple', 'Egg, whole, raw, fresh'));
      const results = await createCatalogReader(work => work(db)).search('eggs');
      expect(results).toHaveLength(101);
      expect(results[0].id).toBe('staple');
    } finally { raw.close(); }
  });

  it('handles brand apostrophes, accents, punctuation, and plural custom terms in the FTS index', async () => {
    const { db, raw } = testDatabase();
    try {
      raw.exec("CREATE TABLE foods(id TEXT PRIMARY KEY,name TEXT,food TEXT); CREATE VIRTUAL TABLE food_search USING fts5(id UNINDEXED,name,brand, tokenize='unicode61 remove_diacritics 2');");
      const value = food('brand', 'Crème brûlée cookie', 'McDonald’s');
      raw.prepare('INSERT INTO foods VALUES(?,?,?)').run(value.id, value.name, JSON.stringify(value));
      raw.prepare('INSERT INTO food_search VALUES(?,?,?)').run(value.id, value.name, value.brand!);
      const reader = createCatalogReader(work => work(db));
      expect(await reader.search('McDonalds cookies')).toEqual([value]);
      expect(await reader.search('crème-brûlée')).toEqual([value]);
    } finally { raw.close(); }
  });

  it('finds berry plurals in either direction', async () => {
    const { db, raw } = testDatabase();
    try {
      raw.exec('CREATE TABLE foods(id TEXT PRIMARY KEY,name TEXT,food TEXT); CREATE VIRTUAL TABLE food_search USING fts5(id UNINDEXED,name,brand);');
      for (const value of [food('singular', 'Strawberry'), food('plural', 'Strawberries')]) {
        raw.prepare('INSERT INTO foods VALUES(?,?,?)').run(value.id, value.name, JSON.stringify(value));
        raw.prepare('INSERT INTO food_search VALUES(?,?,?)').run(value.id, value.name, '');
      }
      const reader = createCatalogReader(work => work(db));
      for (const query of ['strawberry', 'strawberries']) expect((await reader.search(query)).map(food => food.id).sort()).toEqual(['plural', 'singular']);
    } finally { raw.close(); }
  });
});
