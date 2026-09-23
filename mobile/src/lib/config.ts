const apiUrl = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');

export const configuration = { apiUrl };

export function configurationError() {
  if (!apiUrl) return null;
  try {
    const url = new URL(apiUrl);
    const local = ['localhost', '127.0.0.1', '10.0.2.2', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local && __DEV__)) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
      return 'Use an HTTPS API origin, without a path. Local simulator HTTP is allowed in development.';
    }
  } catch { return 'The API URL is invalid.'; }
  return null;
}
