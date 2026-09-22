import type { ApiClient } from '../lib/api';
import { trackEvent } from './client';
import type { ActionEvent } from './events';

const actions: Record<string, ActionEvent> = {
  'GET /api/foods/search': 'Food Searched',
  'GET /api/foods/barcode': 'Barcode Looked Up',
  'POST /api/entries': 'Food Logged',
  'DELETE /api/entries': 'Food Removed',
  'POST /api/foods/custom': 'Custom Food Created',
  'POST /api/meals': 'Meal Created',
  'PUT /api/meals': 'Meal Updated',
  'DELETE /api/meals': 'Meal Deleted',
  'PUT /api/goals': 'Goals Updated',
  'POST /api/water': 'Water Logged',
  'DELETE /api/water': 'Water Removed',
  'PUT /api/water/goals': 'Water Goal Updated',
};

export function withAnalytics(api: ApiClient): ApiClient {
  return async <T>(path: string, options?: Parameters<ApiClient>[1]) => {
    const result = await api<T>(path, options);
    // Queries, IDs, bodies and responses never cross the analytics boundary.
    const event = actions[`${options?.method ?? 'GET'} ${path.split('?')[0]}`];
    if (event) trackEvent(event);
    return result;
  };
}
