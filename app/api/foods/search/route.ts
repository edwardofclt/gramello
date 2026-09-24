import { withBrowserDiary } from '@/lib/browser-diary';
import { cacheDatabaseFoods, findFoods } from '@/db/foods';
import { referenceFoods, searchOpenFoodFacts, searchUsda } from '@/lib/food-providers';
import { foodSearchIssue } from '@/lib/food-search';
import { rankFoodSearch } from '@/lib/food-search-ranking';

export async function GET(request: Request) {
  return withBrowserDiary(request, async () => {
    const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    if (query.length < 2) return Response.json({ foods: [], partial: false });
    if (query.length > 200) return Response.json({ error: 'Search with a shorter food or restaurant name.' }, { status: 400 });
    try {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5_000)]);
      const providers = await Promise.allSettled([searchUsda(query, signal), searchOpenFoodFacts(query, signal)]);
      const sources = ['USDA FoodData Central', 'Open Food Facts'];
      const issues = providers.flatMap((result, index) => result.status === 'rejected' ? [foodSearchIssue(sources[index], result.reason)] : []);
      const reference = rankFoodSearch(referenceFoods, query);
      const fetched = providers.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      await cacheDatabaseFoods([...reference, ...fetched]);
      const local = await findFoods(query, 101);
      const foods = rankFoodSearch([...fetched, ...local], query);
      return Response.json({ foods: foods.slice(0, 100), hasMore: foods.length > 100, partial: issues.length > 0, issues });
    } catch (error) {
      console.error('Food search failed', error);
      return Response.json({ error: 'Food search is unavailable. Please try again.' }, { status: 503 });
    }
  });
}
