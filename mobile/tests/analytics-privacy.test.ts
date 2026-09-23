import { describe, expect, it } from 'vitest';
import type { SegmentEvent } from '@segment/analytics-react-native';
import { anonymousEvent } from '../src/analytics/events';

const event = (overrides: Record<string, unknown> = {}) => ({
  type: 'track', event: 'Food Logged', anonymousId: 'random-install-id',
  messageId: 'event-id', timestamp: '2026-09-22T16:00:00Z',
  ...overrides,
}) as SegmentEvent;

describe('anonymous analytics payloads', () => {
  it.each(['Food Logged', 'Food Updated'])('%s retains the anonymous ID but removes account, nutrition, device and network data', name => {
    const input = event({
      event: name,
      userId: 'private-user', properties: { name: 'Private meal', calories: 450, date: '2026-09-21', query: 'private query' },
      context: {
        traits: { email: 'private@example.com' }, ip: '192.0.2.1',
        device: { id: 'hardware-id', advertisingId: 'ad-id', name: 'Personal phone' },
        app: { name: 'Gramello', version: '1.8.0', build: '12', namespace: 'com.edwardofclt.nourish', secret: 'private' },
        os: { name: 'iOS', version: '26' }, library: { name: 'analytics-react-native', version: '2.24.0' },
        locale: 'en-US', timezone: 'America/New_York', location: { latitude: 35 },
      },
      extra: 'private', enrichment: () => event({ userId: 'injected' }),
    });
    expect(anonymousEvent(input)).toEqual({
      type: 'track', event: name, anonymousId: 'random-install-id',
      messageId: 'event-id', timestamp: '2026-09-22T16:00:00Z', properties: {},
      context: {
        ip: '0.0.0.0',
        app: { name: 'Gramello', version: '1.8.0', build: '12', namespace: 'com.edwardofclt.nourish' },
        os: { name: 'iOS', version: '26' }, library: { name: 'analytics-react-native', version: '2.24.0' },
      },
    });
    expect(input.userId).toBe('private-user');
  });

  it.each(['identify', 'alias', 'group'])('drops %s events entirely', type => {
    expect(anonymousEvent(event({ type, userId: 'private', traits: { email: 'private@example.com' } }))).toBeUndefined();
  });

  it('drops dynamic event and screen names, and events without an anonymous ID', () => {
    expect(anonymousEvent(event({ event: 'A private food name' }))).toBeUndefined();
    expect(anonymousEvent(event({ type: 'screen', name: 'private@example.com' }))).toBeUndefined();
    expect(anonymousEvent(event({ anonymousId: undefined }))).toBeUndefined();
  });

  it('allows fixed screen and lifecycle names while discarding their properties', () => {
    expect(anonymousEvent(event({ type: 'screen', name: 'Diary', properties: { date: 'private' } })))
      .toMatchObject({ type: 'screen', name: 'Diary', properties: {}, anonymousId: 'random-install-id' });
    expect(anonymousEvent(event({ event: 'Application Opened', properties: { url: 'nourish://callback?code=private' } })))
      .toMatchObject({ type: 'track', event: 'Application Opened', properties: {}, context: { ip: '0.0.0.0' } });
  });
});
