import type { ActionEvent, ScreenName } from './events';

// The requested SDK is native-only. Keep the Expo browser experience usable
// without importing native modules or silently introducing browser tracking.
export function initializeAnalytics() {}
export function trackEvent(name: ActionEvent) { void name; }
export function trackScreen(name: ScreenName) { void name; }
