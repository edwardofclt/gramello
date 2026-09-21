import { useCallback, useEffect, useRef, useState } from 'react';
import type { FoodApi } from '../lib/food-api';
import type { CustomMeal } from '../lib/meals';

export function useMealLibrary(api: FoodApi) {
  const [meals, setMeals] = useState<CustomMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const lock = useRef(false);
  const reload = useCallback(() => { setLoading(true); setError(null); setRevision(value => value + 1); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ meals: CustomMeal[] }>('/api/meals', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setMeals(data.meals); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, revision]);
  const remove = async (id: string) => {
    if (lock.current) return;
    lock.current = true; setDeleting(true); setError(null);
    try {
      await api(`/api/meals?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      setMeals(items => items.filter(item => item.id !== id));
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : 'Meal could not be deleted.'); return false; }
    finally { lock.current = false; setDeleting(false); }
  };
  return { meals, loading, error, reload, remove, deleting };
}
