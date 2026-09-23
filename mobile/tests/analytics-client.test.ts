import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventType, SegmentClient } from '@segment/analytics-react-native';

const sdk = vi.hoisted(() => ({
  createClient: vi.fn(), add: vi.fn<SegmentClient['add']>(), track: vi.fn(), screen: vi.fn(), cleanup: vi.fn(),
}));
vi.mock('@segment/analytics-react-native', () => ({
  createClient: sdk.createClient,
  Plugin: class {}, SegmentDestination: class {}, PluginType: { enrichment: 'enrichment' },
}));

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  sdk.createClient.mockReturnValue(sdk);
  sdk.track.mockResolvedValue(undefined); sdk.screen.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('native analytics initialization', () => {
  it.each([undefined, '', '   '])('does not start the SDK with write key %j', async key => {
    vi.stubEnv('EXPO_PUBLIC_SEGMENT_WRITE_KEY', key);
    const analytics = await import('../src/analytics/client');
    analytics.initializeAnalytics(); analytics.trackScreen('Diary'); analytics.trackEvent('Food Logged');
    expect(sdk.createClient).not.toHaveBeenCalled();
    expect(sdk.track).not.toHaveBeenCalled(); expect(sdk.screen).not.toHaveBeenCalled();
  });

  it('creates one client and installs the privacy filter before enabling delivery', async () => {
    vi.stubEnv('EXPO_PUBLIC_SEGMENT_WRITE_KEY', ' test-key ');
    const analytics = await import('../src/analytics/client');
    analytics.initializeAnalytics(); analytics.initializeAnalytics();
    analytics.trackScreen('Diary'); analytics.trackEvent('Food Logged');
    expect(sdk.createClient).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      writeKey: 'test-key', debug: false, collectDeviceId: false,
      trackDeepLinks: false, trackAppLifecycleEvents: true, autoAddSegmentDestination: false,
    }));
    const filter = sdk.add.mock.calls[0][0].plugin;
    expect(filter.type).toBe('enrichment');
    const payload = filter.execute({ type: 'track' as EventType.TrackEvent, event: 'Food Logged', anonymousId: 'random', userId: 'private' });
    expect(payload).toMatchObject({ anonymousId: 'random' });
    expect(payload).not.toHaveProperty('userId');
    expect(sdk.add).toHaveBeenCalledTimes(2);
    expect(sdk.track).toHaveBeenCalledExactlyOnceWith('Food Logged');
    expect(sdk.screen).toHaveBeenCalledExactlyOnceWith('Diary');
  });

  it('keeps app operations working if SDK setup or event delivery fails', async () => {
    vi.stubEnv('EXPO_PUBLIC_SEGMENT_WRITE_KEY', 'test-key');
    sdk.add.mockImplementationOnce(() => { throw new Error('Storage unavailable'); });
    let analytics = await import('../src/analytics/client');
    expect(() => analytics.initializeAnalytics()).not.toThrow();
    analytics.trackEvent('Food Logged');
    expect(sdk.cleanup).toHaveBeenCalledOnce();
    expect(sdk.track).not.toHaveBeenCalled();

    vi.resetModules();
    analytics = await import('../src/analytics/client');
    sdk.track.mockRejectedValue(new Error('Offline'));
    sdk.screen.mockImplementation(() => { throw new Error('SDK error'); });
    expect(() => analytics.trackEvent('Food Logged')).not.toThrow();
    expect(() => analytics.trackScreen('Diary')).not.toThrow();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
});
