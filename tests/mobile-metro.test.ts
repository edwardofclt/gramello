import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const mobileRoot = fileURLToPath(new URL('../mobile', import.meta.url));
const config = require('../mobile/metro.config.js');

it.each(['ios', 'android', 'web'])('uses the mobile React instance for shared hooks and runtime imports on %s', platform => {
  const fallback = vi.fn();
  for (const origin of ['../hooks/use-food-search.ts', '../mobile/src/screens/FoodPicker.tsx']) {
    const context = { originModulePath: require.resolve(origin), resolveRequest: fallback };
    for (const name of ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client']) {
      expect(config.resolver.resolveRequest(context, name, platform)).toEqual({
        type: 'sourceFile', filePath: require.resolve(name, { paths: [mobileRoot] }),
      });
    }
  }
  expect(fallback).not.toHaveBeenCalled();
});

it('delegates other dependencies to Metro instead of redirecting them', () => {
  const resolved = { type: 'sourceFile', filePath: '/example/native-module.js' };
  const fallback = vi.fn(() => resolved);
  const context = { resolveRequest: fallback };
  expect(config.resolver.resolveRequest(context, 'react-native', 'ios')).toBe(resolved);
  expect(fallback).toHaveBeenCalledWith(context, 'react-native', 'ios');
});
