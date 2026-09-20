import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Nourish',
  slug: 'nourish-mobile',
  version: '0.1.0',
  scheme: 'nourish',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0b121a',
  ios: {
    bundleIdentifier: 'com.edwardofclt.nourish',
    appleTeamId: '6SHL6PHRS9',
    supportsTablet: true,
  },
  android: { package: 'com.nourish.tracker' },
  plugins: [
    ['react-native-auth0', {
      domain: process.env.EXPO_PUBLIC_AUTH0_DOMAIN || 'configure-auth0.invalid',
      customScheme: 'nourish',
    }],
  ],
};
export default config;
