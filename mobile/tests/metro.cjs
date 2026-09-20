/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('node:path');
module.exports = (config) => {
  const resolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, name, platform) => {
    if (name === 'react-native-auth0' && platform === 'web') return { type: 'sourceFile', filePath: path.join(__dirname, 'auth0.tsx') };
    return resolveRequest(context, name, platform);
  };
  return config;
};
