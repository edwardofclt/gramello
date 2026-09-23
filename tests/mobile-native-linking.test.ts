import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../mobile/', import.meta.url));
const require = createRequire(new URL('../mobile/package.json', import.meta.url));
const autolinking = path.join(path.dirname(require.resolve('expo/package.json')), 'bin/autolinking');

// Unused native libraries still contribute manifests and pods even when Metro
// never imports them. The local diary must build without an identity provider.
it.each(['android', 'ios'])('does not link Auth0 into the local %s app', platform => {
  const config = JSON.parse(execFileSync(process.execPath, [autolinking,
    'react-native-config', '--project-root', projectRoot, '--platform', platform, '--json',
  ], { cwd: projectRoot, encoding: 'utf8' }));

  expect(config.dependencies).not.toHaveProperty('react-native-auth0');
}, 15_000);
