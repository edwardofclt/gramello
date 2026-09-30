export const browserIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};
export function isolateBrowserResponse(response: Response): Response {
  const isolated = new Response(response.body, response);
  for (const [name, value] of Object.entries(browserIsolationHeaders)) isolated.headers.set(name, value);
  return isolated;
}
