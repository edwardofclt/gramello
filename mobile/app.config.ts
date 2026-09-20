import type { ExpoConfig } from 'expo/config';
import mobilePackage from './package.json';

const config: ExpoConfig = {
  name: 'Nourish',
  slug: 'nourish-mobile',
  owner: 'edwardofclt',
  version: mobilePackage.version,
  icon: './assets/icon.png',
  scheme: 'nourish',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0b121a',
  ios: {
    bundleIdentifier: 'com.edwardofclt.nourish',
    appleTeamId: '6SHL6PHRS9',
    config: { usesNonExemptEncryption: false },
    supportsTablet: true,
  },
  android: { package: 'com.nourish.tracker' },
  extra: { eas: { projectId: 'c23e01dd-d5d1-4f70-8786-e63e2f04a888' } },
  plugins: [
    ['expo-camera', {
      cameraPermission: 'Allow Nourish to scan food barcodes with your camera.',
      microphonePermission: false,
      recordAudioAndroid: false,
      barcodeScannerEnabled: true,
    }],
    ['react-native-auth0', {
      domain: process.env.EXPO_PUBLIC_AUTH0_DOMAIN || 'configure-auth0.invalid',
      customScheme: 'nourish',
    }],
  ],
};
export default config;
