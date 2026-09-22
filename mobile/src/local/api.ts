import type { ApiClient } from '../lib/api';
import type { LocalRepository } from './repository';
// Transitional screen adapter: these route names are dispatched in-process.
// Diary operations stay on-device; food discovery may call public providers.
export function createLocalApi(repo: LocalRepository): ApiClient {
  return async <T>(path: string, options: Parameters<ApiClient>[1] = {}): Promise<T> => {
    if (options.signal?.aborted) throw new Error('Operation cancelled.');
    if (!path.startsWith('/api/') || path.includes('\\')) throw new Error('Invalid local operation.');
    const url = new URL(path, 'https://local.invalid'), method = options.method ?? 'GET';
    const q = (key: string) => url.searchParams.get(key) ?? '';
    let value: unknown;
    switch (`${method} ${url.pathname}`) {
      case 'GET /api/day': value = await repo.getDay(q('date')); break;
      case 'PUT /api/goals': value = await repo.saveGoals(options.body); break;
      case 'POST /api/entries': value = await repo.addEntry(options.body); break;
      case 'DELETE /api/entries': value = await repo.removeEntry(q('id')); break;
      case 'GET /api/trends': value = { days: await repo.getTrends(Number(q('days'))) }; break;
      case 'GET /api/foods/search': value = await repo.searchFoods(q('q'), { online: q('online') !== '0', signal: options.signal }); break;
      case 'GET /api/foods/barcode': value = await repo.lookupBarcode(q('code'), options.signal); break;
      case 'POST /api/foods/custom': value = await repo.createFood(options.body); break;
      case 'GET /api/meals': value = await repo.listMeals(); break;
      case 'POST /api/meals': value = await repo.saveMeal(options.body); break;
      case 'PUT /api/meals': if (!q('id')) throw new Error('Missing meal.'); value = await repo.saveMeal(options.body, q('id')); break;
      case 'DELETE /api/meals': value = await repo.deleteMeal(q('id')); break;
      case 'GET /api/water': value = await repo.getWaterDay(q('date')); break;
      case 'POST /api/water': value = await repo.addWater(options.body); break;
      case 'DELETE /api/water': value = await repo.removeWater(q('id')); break;
      case 'PUT /api/water/goals': value = await repo.saveWaterGoal(options.body); break;
      default: throw new Error('Unsupported local operation.');
    }
    return value as T;
  };
}
