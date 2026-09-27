import { afterEach, expect, it, vi } from 'vitest';
import { createCatalogReader } from '../mobile/src/catalog/queries';
import { createFoodLookup } from '../mobile/src/catalog/lookup';
import { createLocalRepository } from '../mobile/src/local/repository';
import { createBrowserCatalogSource, createBrowserFoodCatalog } from '../lib/browser-local/food-catalog';
import { testDatabase } from './helpers/local-sqlite';
import { preferredFoodServing } from '../lib/food-servings';
import type { FoodSearchResult } from '../lib/food-search';
import type { WorkerRequest, WorkerResponse } from '../lib/browser-local/protocol';
import { foodRevision } from '../lib/food-revision';
import { selectFoodServing } from '../lib/serving-options';
const closes: Array<()=>void>=[];
afterEach(()=>{ for(const close of closes.splice(0)) close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function browserRepository(failCatalog=false) {
  const bundle=testDatabase('mobile/assets/catalog.sqlite'), cache=testDatabase(), diary=testDatabase();
  closes.push(()=>bundle.raw.close(),()=>cache.raw.close(),()=>diary.raw.close());
  const source=createBrowserCatalogSource(async()=>{
    if(failCatalog) throw new Error('offline');
    return createCatalogReader(work=>work(bundle.db));
  },work=>work(),()=>{});
  const lookup=await createFoodLookup(source,cache.db);
  const writes:boolean[]=[];
  const catalog=createBrowserFoodCatalog(async(write,work)=>{writes.push(write);return work(lookup);});
  return {repo:await createLocalRepository(diary.db,catalog),catalog,writes};
}
it('carries offline filters, candidate expansion, cursor pages and source status through browser adapters',async()=>{
  const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('must stay local'));
  const {repo,writes}=await browserRepository();
  const options={online:false,category:'restaurant' as const,brand:'Chick-fil-A',limit:5,window:100};
  const first=await repo.searchFoods('chicken',options);
  expect(first.foods).toHaveLength(5);
  expect(first.foods.every(food=>food.brand==='Chick-fil-A')).toBe(true);
  expect(first.nextCursor).toBeTruthy();
  const second=await repo.searchFoods('chicken',{...options,cursor:first.nextCursor});
  expect(second.foods.every(food=>!first.foods.some(initial=>initial.id===food.id))).toBe(true);
  expect(first.sourceStatus).toContainEqual(expect.objectContaining({source:'Open Food Facts',state:'not-requested'}));
  expect((await repo.searchFoods('chicken',{online:false,window:20,limit:5})).canExpand).toBe(true);
  expect(network).not.toHaveBeenCalled();
  expect(writes.every(write=>!write)).toBe(true);
});
it('keeps personal foods available and exposes catalog failures',async()=>{
  const {repo}=await browserRepository(true);
  const {food}=await repo.createFood({name:'Special oats',servingLabel:'1 bowl',servingGrams:150,calories:210,protein:8,carbs:40,fat:3});
  const found=await repo.searchFoods('special oats',{online:false});
  expect(found.foods.map(item=>item.id)).toContain(food.id);
  expect(found.partial).toBe(true);
  expect(found.sourceStatus).toContainEqual(expect.objectContaining({source:'Offline catalog',state:'unavailable'}));
});
it('retains USDA serving choices and canonical food identity for browser search and lookup',async()=>{
  const {repo,catalog}=await browserRepository();
  const results=await repo.searchFoods('egg raw',{online:false});
  const found=results.foods.find(food=>food.id==='usda-171287')!;
  expect(found).toBeDefined();
  expect(found.servingOptions?.length).toBeGreaterThan(0);
  expect(found).toEqual(preferredFoodServing(found));
  expect(await catalog.getFood(found.id)).toEqual(found);
  expect(found.source).toBe('USDA FoodData Central');
  expect(found.calories).toBe(143);
  const serving=found.servingOptions![0];
  const selected=selectFoodServing(found,serving.id)!;
  const saved=await repo.addEntry({date:'2026-09-26',meal:'Breakfast',sourceId:found.id,quantity:1,unit:'serving',servingId:serving.id,foodRevision:foodRevision(selected)});
  expect(saved.sourceId).toBe(found.id);
  expect(saved.servingLabel).toBe(serving.label);
  expect(saved.calories).toBeCloseTo(143*serving.grams!/100,1);
});
it('transports every search option across browser RPC without cloning AbortSignal',async()=>{
  const {repo}=await browserRepository();
  vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('stay offline'));
  class WorkerBridge {
    onmessage: ((event: {data:WorkerResponse})=>void) | null=null;
    terminate() {}
    postMessage(message:WorkerRequest) {
      if('cancel' in message) return;
      const copied=structuredClone(message);
      if(copied.method==='init') { queueMicrotask(()=>this.onmessage?.({data:{id:copied.id,value:{phase:'ready'}}})); return; }
      if(copied.method!=='searchFoods') throw new Error('Unexpected operation');
      void repo.searchFoods(copied.args[0] as string,copied.args[1] as Parameters<typeof repo.searchFoods>[1])
        .then(value=>this.onmessage?.({data:{id:copied.id,value}}))
        .catch(error=>this.onmessage?.({data:{id:copied.id,error:String(error)}}));
    }
  }
  vi.stubGlobal('Worker',WorkerBridge);vi.stubGlobal('indexedDB',{});vi.stubGlobal('navigator',{locks:{}});vi.stubGlobal('BroadcastChannel',undefined);
  vi.resetModules();
  const {getBrowserRuntime}=await import('../lib/browser-local/client');
  const runtime=await getBrowserRuntime();
  const first=await runtime.api<FoodSearchResult>('/api/foods/search?q=chicken&online=0&category=restaurant&brand=Chick-fil-A&limit=3&window=100',{signal:new AbortController().signal});
  expect(first.foods).toHaveLength(3);
  expect(first.foods.every(food=>food.brand==='Chick-fil-A')).toBe(true);
  const second=await runtime.repository.searchFoods('chicken',{online:false,category:'restaurant',brand:'Chick-fil-A',limit:3,window:100,cursor:first.nextCursor});
  expect(second.foods).toHaveLength(3);
  expect(second.foods.every(food=>!first.foods.some(initial=>initial.id===food.id))).toBe(true);
});
it('persists provider results only for an explicit online search and reuses their canonical identity offline',async()=>{
  const product={code:'0038000590993',product_name:'Testy Coconut Bar',brands:'Testy',serving_quantity:62,serving_quantity_unit:'g',serving_size:'1 bar (62 g)',nutriments:{'energy-kcal_100g':400,proteins_100g:5,carbohydrates_100g:60,fat_100g:15}};
  const network=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({products:[product],count:1,page_size:50}));
  const {repo,writes}=await browserRepository();
  expect((await repo.searchFoods('testy coconut',{online:false})).foods).toHaveLength(0);
  expect(network).not.toHaveBeenCalled();
  const online=await repo.searchFoods('testy coconut',{online:true});
  const remote=online.foods.find(food=>food.id==='off-0038000590993')!;
  expect(remote).toBeDefined();
  expect(writes).toContain(true);
  network.mockRejectedValue(new Error('offline'));
  const cached=await repo.searchFoods('testy coconut',{online:false});
  expect(cached.foods).toContainEqual(remote);
  const saved=await repo.addEntry({date:'2026-09-26',meal:'Snacks',sourceId:remote.id,quantity:1,unit:'serving',foodRevision:foodRevision(remote)});
  expect(saved.sourceId).toBe(remote.id);
  expect(saved.calories).toBe(248);
});
