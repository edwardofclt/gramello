import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { errorMessage, type ApiClient } from './api';

export function useResource<T>(api: ApiClient, path: string, refreshOnActive = true) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key: '' });
  const key = `${path}:${revision}`;
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!refreshOnActive) return;
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') reload(); });
    return () => subscription.remove();
  }, [reload, refreshOnActive]);
  useEffect(() => {
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ key, data });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ key, error: errorMessage(error) });
    });
    return () => controller.abort();
  }, [api, path, key]);
  return { data: state.key === key ? state.data : undefined, error: state.key === key ? state.error : undefined,
    loading: state.key !== key, reload };
}
