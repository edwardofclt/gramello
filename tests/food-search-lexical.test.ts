import { afterAll, expect, it } from 'vitest';
import { createCatalogReader } from '../mobile/src/catalog/queries';
import { analyzeFoodQuery, rankFoodSearch } from '../lib/search';
import type { Food } from '../lib/food';
import { testDatabase } from './helpers/local-sqlite';
const db = testDatabase('mobile/assets/catalog.sqlite');
const reader = createCatalogReader(work=>work(db.db));
afterAll(()=>db.raw.close());
it.each([
  ['cauliflwer raw','usda-169986'], ['cocunut oil','usda-171412'],
  ['mozzarela cheese','usda-170845'], ['pistachois raw','usda-170184'],
  ['fresh raspberries','usda-167755'], ['fresh cherries','usda-171719'],
  ['kiwi fruit','usda-168153'], ['fresh cilantro','usda-169997'],
  ['roasted turkey breast without skin','usda-171496'],
])('recovers source-attested wording for %s',async(query,id)=>{
  expect((await reader.search(query)).slice(0,10).map(food=>food.id)).toContain(id);
});
it.each([['arbys',"Arby's"],['dominos',"Domino's"],['raising canes box combo',"Raising Cane's"]])('recovers omitted possessive punctuation for %s',async(query,brand)=>{
  const results=await reader.search(query);
  expect(results.length).toBeGreaterThan(0);
  expect(results[0].brand).toBe(brand);
});
const food = (id:string,name:string):Food=>({id,name,source:'Example',sourceKind:'custom',calories:100,protein:5,carbs:10,fat:3,servingGrams:100,servingLabel:'100 g'});
it('preserves source-attested words and explicit product variants',()=>{
  for(const query of ['toasted bread','green beans','skinless turkey','Snickers original bar']) expect(analyzeFoodQuery(query).correction).toBeUndefined();
  expect(rankFoodSearch('snickers original bar',[food('almond','Snickers almond bar'),food('bar','Snickers bar')]).foods).toEqual([]);
  expect(rankFoodSearch('turkey breast without skin',[food('skin','Turkey breast meat and skin'),food('skinless','Turkey breast meat only')]).foods.map(f=>f.id)).toEqual(['skinless']);
});
it('does not apply produce freshness aliases to recipes or meat preparations',()=>{
  expect(rankFoodSearch('fresh raspberry muffin',[food('raw','Raspberry muffin raw')]).foods).toEqual([]);
  expect(rankFoodSearch('fresh pork cooked',[food('raw','Pork raw cooked')]).foods).toEqual([]);
  expect(rankFoodSearch('fresh cherries',[food('frozen','Cherries frozen'),food('dried','Cherries dried'),food('raw','Cherries raw')]).foods.map(f=>f.id)).toEqual(['raw']);
});
it('retains prefix and exact custom spellings before source-vocabulary suggestions',()=>{
  const original=food('custom-brice','Brice bowl');
  expect(rankFoodSearch('brice bowl',[original,food('rice','Rice bowl')]).foods.map(f=>f.id)).toEqual(['custom-brice']);
  expect(rankFoodSearch('chicken breas',[food('breast','Chicken breast')]).correction).toBeUndefined();
});
it('rejects conflicting preparations even when a label also contains the requested synonym',()=>{
  const fresh=[food('raw','Cherries raw'),food('frozen','Cherries frozen raw'),food('dried','Cherries dried raw'),food('canned','Cherries canned raw')];
  expect(rankFoodSearch('fresh cherries',fresh).foods.map(f=>f.id)).toEqual(['raw']);
  const poultry=[food('plain','Turkey breast meat only roasted'),food('skin','Turkey breast meat only with skin roasted'),food('mixed','Turkey breast skinless meat and skin roasted')];
  expect(rankFoodSearch('turkey breast without skin roasted',poultry).foods.map(f=>f.id)).toEqual(['plain']);
});
