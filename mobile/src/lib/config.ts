const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
const domain = process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? '';
const clientId = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID ?? '';
const audience = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE ?? '';

export const configuration = { apiUrl, domain, clientId, audience };

export function configurationError() {
  if (!apiUrl || !domain || !clientId || !audience) return 'Set the four public values in mobile/.env using mobile/.env.example, then restart Expo.';
  try {
    const url = new URL(apiUrl);
    const local = ['localhost', '127.0.0.1', '10.0.2.2', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local && __DEV__)) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
      return 'Use an HTTPS API origin, without a path. Local simulator HTTP is allowed in development.';
    }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return 'Set the Auth0 domain as a hostname, without https:// or a path.';
  } catch { return 'The API URL is invalid.'; }
  return null;
}
