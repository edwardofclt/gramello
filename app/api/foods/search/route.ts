import { withAuthenticatedUser } from "@/lib/auth";
import type { Food } from '@/lib/meals';
import { productFood, productFields, type Product } from '@/lib/barcode-food';
const genericFoods: Food[] = [
  { id:"generic-chicken",name:"Chicken breast, cooked",source:"USDA reference",calories:165,protein:31,carbs:0,fat:3.6,servingGrams:100,servingLabel:"100 g" },
  { id:"generic-rice",name:"White rice, cooked",source:"USDA reference",calories:130,protein:2.7,carbs:28.2,fat:.3,servingGrams:100,servingLabel:"100 g" },
  { id:"generic-egg",name:"Large egg",source:"USDA reference",calories:144,protein:12.6,carbs:.8,fat:9.6,servingGrams:50,servingLabel:"1 large (50 g)" },
  { id:"generic-banana",name:"Banana",source:"USDA reference",calories:89,protein:1.1,carbs:22.8,fat:.3,servingGrams:100,servingLabel:"100 g" },
  { id:"generic-oats",name:"Rolled oats, dry",source:"USDA reference",calories:379,protein:13.2,carbs:67.7,fat:6.5,servingGrams:100,servingLabel:"100 g" },
];
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
export async function GET(request: Request) {
  return withAuthenticatedUser(request, () => searchFoods(request));
}

async function searchFoods(request: Request) {
  const q=new URL(request.url).searchParams.get("q")?.trim()??""; if(q.length<2)return Response.json({foods:[]});
  const local=genericFoods.filter(f=>`${f.name} ${f.brand??""}`.toLowerCase().includes(q.toLowerCase()));
  const off = async () => {
    const params = new URLSearchParams({ search_terms: q, search_simple: '1', action: 'process', json: '1', page_size: '12', fields: productFields });
    const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`, { headers: { 'User-Agent': 'GramelloTracker/1.0 (personal food diary)' } });
    if (!response.ok) throw new Error(`Open Food Facts ${response.status}`);
    const data = await response.json() as { products?: Product[] };
    return (data.products ?? []).flatMap(product => {
      if (!product.code) return [];
      const food = productFood(product, product.code);
      return food ? [food] : [];
    });
  };
  const usda=async()=>{const r=await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query=${encodeURIComponent(q)}&pageSize=10`);if(!r.ok)throw new Error(`USDA FoodData Central ${r.status}`);const d=await r.json() as {foods?:Array<Record<string,any>>};return(d.foods??[]).flatMap((x):Food[]=>{const nutrients=Array.isArray(x.foodNutrients)?x.foodNutrients:[];const nutrient=(names:string[])=>n(nutrients.find((v:any)=>names.includes(String(v.nutrientName)))?.value);const calories=nutrient(["Energy","Energy (Atwater General Factors)"]);if(!x.description||!calories)return[];const sg=n(x.servingSize)||100;return[{id:`usda-${x.fdcId}`,name:String(x.description).toLowerCase().replace(/(^|\s)\S/g,(s:string)=>s.toUpperCase()),brand:x.brandOwner?String(x.brandOwner):undefined,source:"USDA FoodData Central",calories,protein:nutrient(["Protein"]),carbs:nutrient(["Carbohydrate, by difference"]),fat:nutrient(["Total lipid (fat)"]),servingGrams:sg,servingLabel:x.householdServingFullText?String(x.householdServingFullText):`${sg} g`}]} )};
  const [a,b]=await Promise.allSettled([usda(),off()]);const foods=[...local,...(a.status==="fulfilled"?a.value:[]),...(b.status==="fulfilled"?b.value:[])];if(a.status==="rejected")console.error(a.reason);if(b.status==="rejected")console.error(b.reason);return Response.json({foods:foods.slice(0,24),partial:a.status==="rejected"||b.status==="rejected"});
}
