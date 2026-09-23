import { createClient, Plugin, PluginType, SegmentDestination, type SegmentClient, type SegmentEvent } from '@segment/analytics-react-native';
import { anonymousEvent } from './events';
import type { ActionEvent, ScreenName } from './events';

class AnonymousEvents extends Plugin {
  type = PluginType.enrichment;
  execute(event: SegmentEvent) { return anonymousEvent(event); }
}

let initialized = false;
let client: SegmentClient | undefined;

export function initializeAnalytics() {
  if (initialized) return;
  initialized = true;
  const writeKey = process.env.EXPO_PUBLIC_SEGMENT_WRITE_KEY?.trim();
  if (!writeKey) return;

  let candidate: SegmentClient | undefined;
  try {
    candidate = createClient({
      writeKey, debug: false, collectDeviceId: false,
      trackAppLifecycleEvents: true, trackDeepLinks: false,
      autoAddSegmentDestination: false,
    });
    // Attach the filter before the only destination. AsyncStorage (installed
    // alongside Sovran) persists Segment's random anonymousId and event queue.
    candidate.add({ plugin: new AnonymousEvents() });
    candidate.add({ plugin: new SegmentDestination() });
    client = candidate;
  } catch {
    // Analytics is optional; storage/SDK failures must not block the diary.
    candidate?.cleanup();
  }
}

function send(method: 'track' | 'screen', name: string) {
  try {
    initializeAnalytics();
    void client?.[method](name).catch(() => {});
  } catch { /* Analytics must never turn a successful action into a UI error. */ }
}

// No identify/alias/reset API is exposed. The installation ID remains anonymous
// and is never merged with identities across devices.
export function trackEvent(name: ActionEvent) { send('track', name); }
export function trackScreen(name: ScreenName) { send('screen', name); }
