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

it.each(['apple','android'])('discovers the local widget module in %s native builds', platform => {
  const config = JSON.parse(execFileSync(process.execPath,[autolinking,'resolve','--project-root',projectRoot,'--platform',platform,'--json'],{cwd:projectRoot,encoding:'utf8'}));
  const widget = config.modules.find((module: {packageName:string}) => module.packageName === 'gramello-widgets');
  expect(widget).toBeDefined();
  if (platform === 'apple') {
    expect(widget.pods).toEqual(expect.arrayContaining([expect.objectContaining({podName:'GramelloWidgets'})]));
    expect(widget.modules).toEqual(expect.arrayContaining([expect.objectContaining({class:'GramelloWidgetsModule'})]));
  } else {
    expect(widget.projects[0].modules).toEqual(expect.arrayContaining([expect.objectContaining({classifier:'com.gramello.widgets.GramelloWidgetsModule'})]));
  }
},15_000);
