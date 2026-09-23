export function isTodayWidgetLink(url: string | null): boolean {
  if (!url) return false;
  try { const parsed = new URL(url); return parsed.protocol === 'nourish:' && parsed.hostname === 'diary' && parsed.pathname === '/today'; }
  catch { return false; }
}
