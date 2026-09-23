// Expo loads this configuration in Node using CommonJS.
/* eslint-disable @typescript-eslint/no-require-imports */
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('sqlite');
// Shared scanner components live beside the web app. Keep their React imports
// on the mobile renderer's version, including imports from shared dependencies.
config.resolver.resolveRequest = (context, name, platform) => {
  if (/^react(?:-dom)?(?:\/|$)/.test(name)) {
    return { type: 'sourceFile', filePath: require.resolve(name, { paths: [__dirname] }) };
  }
  return context.resolveRequest(context, name, platform);
};
module.exports = config;
