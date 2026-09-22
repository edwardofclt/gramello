import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { configuration } from '../lib/config';
import { createApiClient, errorMessage, type ApiClient } from '../lib/api';
import { withAnalytics } from '../analytics/api';
import { ErrorNotice, Loading, styles } from '../components/ui';

export type Session = {
  local?: import('../local/services').LocalServices;
  api: ApiClient;
};
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [api] = useState(() => withAnalytics(createApiClient(configuration.apiUrl)));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    // Establish the diary cookie before screens start parallel data requests.
    void api('/api/day', { signal: controller.signal }).then(() => {
      if (mounted) setReady(true);
    }).catch(error => { if (mounted) setError(errorMessage(error)); });
    return () => { mounted = false; controller.abort(); };
  }, [api, attempt]);
  if (!ready) return <View style={[styles.content, { flex: 1, justifyContent: 'center' }]}>
    {error ? <ErrorNotice message={error} retry={() => { setError(null); setAttempt(value => value + 1); }} /> : <Loading label="Opening your diary…" />}
  </View>;
  return <SessionContext.Provider value={{ api }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('Diary provider is missing.');
  return session;
}
