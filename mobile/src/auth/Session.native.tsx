import { createContext, Fragment, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { getLocalRuntime } from '../local/native';
import { ErrorNotice, Loading, styles } from '../components/ui';
import type { Session } from './Session';

const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [runtime, setRuntime] = useState<Awaited<ReturnType<typeof getLocalRuntime>> | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let mounted = true;
    void getLocalRuntime().then(value => { if (mounted) { setRuntime(value); setError(''); } }).catch(error => { if (mounted) setError(error instanceof Error ? error.message : 'Your diary could not be opened.'); });
    return () => { mounted = false; };
  }, [attempt]);
  useEffect(() => {
    if (!runtime) return;
    void runtime.updater.check();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void runtime.updater.check(); });
    return () => sub.remove();
  }, [runtime]);
  if (!runtime) return <View style={[styles.content,{ flex:1,justifyContent:'center' }]}>{error ? <ErrorNotice message={error} retry={() => setAttempt(a => a+1)} /> : <Loading label="Opening your diary…" />}</View>;
  const local = { ...runtime,
    async importFile(text: string) { await runtime.repository.importArchive(text); setRevision(r => r+1); },
    async restorePrevious() { await runtime.repository.restorePrevious(); setRevision(r => r+1); },
  };
  return <Context.Provider value={{ api:runtime.api,local,name:'This device',signedIn:true,loading:false,busy:false,message:null,signIn:async () => {},signOut:async () => {} }}>
    <Fragment key={revision}>{children}</Fragment>
  </Context.Provider>;
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error('Local diary provider is missing.');
  return value;
}
