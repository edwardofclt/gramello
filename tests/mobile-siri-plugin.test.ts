import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

const require = createRequire(new URL('../mobile/package.json', import.meta.url));
const { IOSConfig } = require('expo/config-plugins');
const { installSiriSources } = require('./plugins/withSiriCheckIn.cjs');
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

it('includes each Siri source in the app build once, and refreshes copied files on repeated prebuilds', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'gramello-siri-plugin-')); directories.push(root);
  const projectDirectory = path.join(root, 'ios', 'HelloWorld.xcodeproj');
  mkdirSync(projectDirectory, { recursive: true });
  const projectFile = path.join(projectDirectory, 'project.pbxproj');
  writeFileSync(projectFile, execFileSync('tar', ['-xOf', path.join(path.dirname(require.resolve('expo/package.json')), 'template.tgz'), 'package/ios/HelloWorld.xcodeproj/project.pbxproj']));
  const project = IOSConfig.XcodeUtils.getPbxproj(root);
  const options = { project, projectName: 'HelloWorld', platformProjectRoot: path.join(root, 'ios') };
  await installSiriSources(options);
  const sourcePath = path.join(root, 'ios', 'HelloWorld', 'Siri', 'MacroCheckInIntent.swift');
  writeFileSync(sourcePath, 'stale generated source');
  await installSiriSources(options);
  expect(readFileSync(sourcePath, 'utf8')).toBe(readFileSync(new URL('../mobile/native/siri/Sources/GramelloSiri/MacroCheckInIntent.swift', import.meta.url), 'utf8'));

  const target = project.getTarget('com.apple.product-type.application');
  const sources = project.pbxSourcesBuildPhaseObj(target.uuid).files;
  const nativeNames = ['MacroCheckIn.swift', 'MacroCheckInReader.swift', 'MacroCheckInIntent.swift', 'FoodRecommendation.swift', 'RecommendationCatalog.swift', 'FoodRecommendationIntent.swift', 'DiaryActions.swift', 'SavedDiaryMeal.swift', 'DiaryIntents.swift'];
  for (const name of nativeNames) {
    expect(sources.filter((file: { comment: string }) => file.comment === `${name} in Sources`)).toHaveLength(1);
    expect(readFileSync(path.join(root, 'ios', 'HelloWorld', 'Siri', name), 'utf8')).toBe(readFileSync(new URL(`../mobile/native/siri/Sources/GramelloSiri/${name}`, import.meta.url), 'utf8'));
  }
  // Round-trip the actual Xcode serialization: the project must remain parseable.
  writeFileSync(projectFile, project.writeSync());
  const reloaded = IOSConfig.XcodeUtils.getPbxproj(root);
  expect(reloaded.getTarget('com.apple.product-type.application').target.name).toBe('HelloWorld');
});
