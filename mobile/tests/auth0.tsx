import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
// Only the external identity provider is replaced. Tests run the real app,
// gluestack controls, session lifecycle, request client, and screen components.
type User = { name: string; email: string } | null;
function useFakeAuth() {
  const [user, setUser] = useState<User>(null);
  const authorize = useCallback(async () => { setUser({ name: new URLSearchParams(window.location.search).get('testName') || 'Alex Rivera', email: 'alex@example.test' }); }, []);
  const clearCredentials = useCallback(async () => { setUser(null); }, []);
  const getCredentials = useCallback(async () => ({ accessToken: 'ui-test-access-token' }), []);
  return useMemo(() => ({ user, isLoading: false, authorize, clearCredentials, clearSession: clearCredentials, getCredentials }), [user, authorize, clearCredentials, getCredentials]);
}
const Context = createContext<ReturnType<typeof useFakeAuth> | null>(null);
export function Auth0Provider({ children }: { children: ReactNode }) { const auth = useFakeAuth(); return <Context.Provider value={auth}>{children}</Context.Provider>; }
export function useAuth0() { return useContext(Context)!; }
