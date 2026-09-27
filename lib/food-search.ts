import type { Food } from './food';

export type FoodSearchIssue = { source: string; message: string };
export type FoodSearchCategory = 'generic' | 'packaged' | 'restaurant' | 'custom';
export type FoodSearchOptions = {
  category?: FoodSearchCategory | 'all'; brand?: string;
  limit?: number; window?: number; cursor?: string;
  online?: boolean; signal?: AbortSignal;
};
// Search presentation stays separate from the canonical nutrition record.
export type FoodSearchHit = {
  food: Food; category: FoodSearchCategory;
  warning?: string; groupKey?: string; groupLabel?: string;
};
export type FoodSearchResult = {
  foods: Food[]; hits?: FoodSearchHit[];
  partial?: boolean; hasMore?: boolean; issues?: FoodSearchIssue[];
  correction?: string; brands?: string[];
  nextCursor?: string; canExpand?: boolean; reset?: boolean;
  sourceStatus?: Array<{ source: string; state: 'ready' | 'unavailable' | 'not-requested'; message?: string }>;
};

export class FoodProviderError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

// Keep raw provider errors out of the UI; they can include request URLs.
export function foodSearchIssue(source: string, error: unknown): FoodSearchIssue {
  let message = 'Could not reach this database. Check your connection or try again later.';
  if (error instanceof FoodProviderError) {
    if (error.status === 429) message = 'Too many requests. Try again in a minute.';
    else if (error.status >= 500) message = 'The database is having a service problem. Try again later.';
    else message = 'The database could not accept this search. Try again later.';
  } else if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    message = 'The database took too long to respond. Try searching again.';
  } else if (error instanceof SyntaxError) {
    message = 'The database returned an unreadable response. Try again later.';
  }
  return { source, message };
}
