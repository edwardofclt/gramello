import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth0 } from 'react-native-auth0';
import { configuration } from '../lib/config';
import { createApiClient, errorMessage, type ApiClient } from '../lib/api';
import { CredentialSession, requiresSignIn } from './credentials';
import { withAnalytics } from '../analytics/api';

type Session = {
  api: ApiClient; name: string; email?: string; signedIn: boolean; loading: boolean;
  busy: boolean; message: string | null; signIn: () => Promise<void>; signOut: () => Promise<void>;
};
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user, isLoading, authorize, clearSession, clearCredentials, getCredentials } = useAuth0();
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const operationLock = useRef(false);
  const [version, setVersion] = useState(0);
  const [credentials] = useState(() => new CredentialSession(async () => (await getCredentials(undefined, 60)).accessToken, clearCredentials));
  const expired = useCallback(() => {
    credentials.advance();
    setBlocked(true);
    setMessage('Your session has expired. Sign in to pick up where you left off.');
    void credentials.clear().catch(() => {});
  }, [credentials]);
  const api = useMemo(() => withAnalytics(createApiClient(configuration.apiUrl, async () => {
    try {
      return await credentials.getToken(version);
    } catch (error) {
      if (credentials.isCurrent(version) && requiresSignIn(error)) expired();
      throw error;
    }
  }, expired, () => credentials.isCurrent(version))), [credentials, version, expired]);

  const signIn = async () => {
    if (operationLock.current) return;
    operationLock.current = true;
    credentials.advance();
    setBlocked(true); setBusy(true); setMessage(null);
    try {
      await credentials.settled();
      await authorize({ audience: configuration.audience, scope: 'openid profile email offline_access' }, { customScheme: 'nourish' });
      setVersion(credentials.advance()); setBlocked(false);
    } catch (error) {
      const code = String((error as { code?: string }).code ?? '');
      setMessage(/cancel/i.test(code) ? 'Sign-in was cancelled. You can try again when you’re ready.' : 'Sign-in could not be completed. Please try again.');
    } finally { operationLock.current = false; setBusy(false); }
  };

  const signOut = async () => {
    if (operationLock.current) return;
    operationLock.current = true;
    credentials.advance(); setBlocked(true); setBusy(true); setMessage(null);
    try { await credentials.clear(); await clearSession({}, { customScheme: 'nourish' }); }
    catch { setMessage('Signed out on this device. The browser session could not be closed.'); }
    finally {
      try { await credentials.clear(); }
      catch (error) { setMessage(`Could not clear saved credentials: ${errorMessage(error)}`); }
      operationLock.current = false; setBusy(false);
    }
  };
  return <SessionContext.Provider value={{ api, name: user?.name || user?.email || 'Your account', email: user?.email,
    signedIn: Boolean(user) && !blocked, loading: isLoading, busy, message, signIn, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider is missing.');
  return session;
}
