// Expo loads this configuration in Node using CommonJS.
/* eslint-disable @typescript-eslint/no-require-imports */
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// The browser test runner explicitly opts into an external Auth0 test double.
// This is never enabled by the native/EAS build profiles.
module.exports = process.env.NOURISH_UI_TEST === '1'
  ? require('./tests/metro.cjs')(config)
  : config;
