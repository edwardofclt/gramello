/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('node:path');
module.exports = (config) => {
  config.resolver.resolveRequest = (context, name, platform) => {
    if (name === 'react-native-auth0' && platform === 'web') return { type: 'sourceFile', filePath: path.join(__dirname, 'auth0.tsx') };
    return context.resolveRequest(context, name, platform);
  };
  return config;
};
