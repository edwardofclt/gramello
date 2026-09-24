import type { Food } from './food';
import { preferredFoodServing } from './food-servings';

const trusted = { sourceKind: 'database' as const, verified: true, nutritionBasis: '100g' as const };
export const referenceFoods: Food[] = [
  { id:'usda-171477',name:'Chicken breast, meat only, roasted',calories:165,protein:31.02,carbs:0,fat:3.57,servingGrams:100,servingLabel:'100 g' },
  { id:'usda-168878',name:'White rice, long-grain, enriched, cooked',calories:130,protein:2.69,carbs:28.17,fat:.28,servingGrams:100,servingLabel:'100 g' },
  { id:'usda-171287',name:'Large egg, whole, raw',calories:143,protein:12.56,carbs:.72,fat:9.51,servingGrams:50,servingLabel:'1 large (50 g)' },
  { id:'usda-173944',name:'Banana, raw',calories:89,protein:1.09,carbs:22.84,fat:.33,servingGrams:100,servingLabel:'100 g' },
  { id:'usda-173904',name:'Rolled oats, regular or quick, dry, not fortified',calories:379,protein:13.15,carbs:67.7,fat:6.52,servingGrams:100,servingLabel:'100 g' },
].map(food => preferredFoodServing({ ...food, ...trusted, source:'USDA FoodData Central', sourceUrl:`https://fdc.nal.usda.gov/food-details/${food.id.slice(5)}/nutrients`, checkedAt:'2026-09-20' }));
