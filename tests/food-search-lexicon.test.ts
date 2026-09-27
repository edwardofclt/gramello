import { expect, it } from 'vitest';
import { buildFoodSearchLexicon } from '../scripts/food-search-lexicon.mjs';
it('builds the same source vocabulary regardless of input order or nutrition changes',()=>{
  const foods=[{id:'usda-1',name:'Cauliflower raw',calories:25},{id:'usda-2',name:'Cauliflower cooked',calories:30}];
  expect(buildFoodSearchLexicon(foods)).toEqual(buildFoodSearchLexicon([...foods].reverse().map(food=>({...food,calories:999}))));
  expect(buildFoodSearchLexicon(foods).suggestionWords).toContain('cauliflower');
});
it('derives possessive punctuation from actual source brands and plurals only when both forms exist',()=>{
  const lexicon=buildFoodSearchLexicon([
    {id:'a',name:'Pistachio nuts',brand:"Arby's"},
    {id:'b',name:'Pistachios raw',brand:'Raising Cane’s'},
    {id:'c',name:'Unattestedpluralwords'},
  ]);
  expect(lexicon.possessives).toMatchObject({arbys:'arby s',canes:'cane s'});
  expect(lexicon.plurals.pistachios).toBe('pistachio');
  expect(lexicon.plurals.unattestedpluralwords).toBeUndefined();
  expect(lexicon.suggestionWords).not.toContain('unattestedpluralwords');
  expect(lexicon.knownWords).toContain('unattestedpluralwords');
});
