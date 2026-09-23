import type { SegmentEvent } from '@segment/analytics-react-native';

export const actionEvents = [
  'Food Searched', 'Barcode Looked Up', 'Food Logged', 'Food Updated', 'Food Removed',
  'Custom Food Created', 'Meal Created', 'Meal Updated', 'Meal Deleted',
  'Goals Updated', 'Water Logged', 'Water Removed', 'Water Goal Updated',
] as const;
export type ActionEvent = typeof actionEvents[number];

export const screenNames = ['Diary', 'Trends', 'Settings', 'Advanced', 'Add Food', 'Goals'] as const;
export type ScreenName = typeof screenNames[number];

const allowedEvents = new Set<string>([
  ...actionEvents, 'Application Installed', 'Application Updated',
  'Application Opened', 'Application Backgrounded',
]);
const allowedScreens = new Set<string>(screenNames);

// Rebuild from an allowlist after SDK enrichment. Never spread the original
// payload: it may contain traits, device IDs, URLs or user-entered properties.
export function anonymousEvent(event: SegmentEvent): SegmentEvent | undefined {
  if (!event.anonymousId) return undefined;
  if (event.type === 'track') {
    if (!allowedEvents.has(event.event)) return undefined;
  } else if (event.type === 'screen') {
    if (!allowedScreens.has(event.name)) return undefined;
  } else return undefined;

  const { app, os, library } = event.context ?? {};
  const context = {
    // Segment honors an explicit IP instead of enriching events with the
    // connection's IP. The service still receives the network connection.
    ip: '0.0.0.0',
    ...(app && { app: { name: app.name, version: app.version, build: app.build, namespace: app.namespace } }),
    ...(os && { os: { name: os.name, version: os.version } }),
    ...(library && { library: { name: library.name, version: library.version } }),
  };
  const common = {
    anonymousId: event.anonymousId, messageId: event.messageId,
    timestamp: event.timestamp, context, properties: {},
  };
  if (event.type === 'track') return { ...common, type: event.type, event: event.event };
  if (event.type === 'screen') return { ...common, type: event.type, name: event.name };
  return undefined;
}
