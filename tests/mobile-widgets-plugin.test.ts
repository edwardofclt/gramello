import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
const require = createRequire(new URL('../mobile/package.json',import.meta.url));
const { IOSConfig } = require('expo/config-plugins');
const { installWidgetTarget, configureWidgets } = require('./plugins/withWidgets.cjs');
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory,{recursive:true,force:true}); });

it('embeds exactly one widget extension across repeated prebuilds and preserves signing metadata', async () => {
  const root = mkdtempSync(path.join(tmpdir(),'gramello-widgets-')); directories.push(root);
  const projectDirectory = path.join(root,'ios','HelloWorld.xcodeproj'); mkdirSync(projectDirectory,{recursive:true});
  const file = path.join(projectDirectory,'project.pbxproj');
  writeFileSync(file,execFileSync('tar',['-xOf',path.join(path.dirname(require.resolve('expo/package.json')),'template.tgz'),'package/ios/HelloWorld.xcodeproj/project.pbxproj']));
  const project = IOSConfig.XcodeUtils.getPbxproj(root);
  const options = {project,platformProjectRoot:path.join(root,'ios'),bundleIdentifier:'com.edwardofclt.nourish',teamId:'TEAM',version:'2.3.4',buildNumber:'42'};
  await installWidgetTarget(options); await installWidgetTarget(options);
  writeFileSync(file,project.writeSync());
  const reloaded = IOSConfig.XcodeUtils.getPbxproj(root);
  const targets = Object.entries(reloaded.pbxNativeTargetSection()).filter(([,v]) => typeof v === 'object' && (v as {name:string}).name?.replaceAll('"','') === 'GramelloWidgets');
  expect(targets).toHaveLength(1);
  const [id,target] = targets[0] as [string,{buildConfigurationList:string}];
  const sources = reloaded.pbxSourcesBuildPhaseObj(id).files;
  expect(sources).toHaveLength(2);
  const groupId = reloaded.findPBXGroupKey({name:'GramelloWidgets'});
  const group = reloaded.hash.project.objects.PBXGroup[groupId];
  const groupPath = (group.path ?? '').replaceAll('"','');
  for (const child of group.children) {
    const reference = reloaded.hash.project.objects.PBXFileReference[child.value];
    // Resolve the real Xcode group + source path, not just source membership.
    expect(readFileSync(path.join(root,'ios',groupPath,reference.path.replaceAll('"','')),'utf8')).toContain('import');
  }
  const configs = reloaded.pbxXCConfigurationList()[target.buildConfigurationList].buildConfigurations;
  for (const config of configs) {
    const settings = reloaded.pbxXCBuildConfigurationSection()[config.value].buildSettings;
    expect(settings.DEVELOPMENT_TEAM).toBe('TEAM');
    // The extension and Expo bridge must not emit the same Swift module name.
    expect(settings.PRODUCT_MODULE_NAME).toBe('GramelloWidgetExtension');
    expect(String(settings.CURRENT_PROJECT_VERSION).replaceAll('"','')).toBe('42');
    expect(String(settings.MARKETING_VERSION).replaceAll('"','')).toBe('2.3.4');
  }
  const phases = Object.values(reloaded.hash.project.objects.PBXCopyFilesBuildPhase).filter(v => typeof v === 'object') as {files:{comment:string}[]}[];
  expect(phases.flatMap(p => p.files).filter(f => f.comment.includes('GramelloWidgets'))).toHaveLength(1);
  expect(readFileSync(path.join(root,'ios','GramelloWidgets','WidgetSnapshot.swift'),'utf8')).toContain('struct WidgetSnapshot');
});

it('preserves unrelated App Groups and EAS extensions without duplicate registration', () => {
  const existing = {name:'Test',slug:'test',ios:{bundleIdentifier:'com.edwardofclt.nourish',entitlements:{'com.apple.security.application-groups':['group.other']}},extra:{eas:{projectId:'existing',build:{experimental:{ios:{appExtensions:[{targetName:'Other',bundleIdentifier:'com.other'}]}}}}}};
  const config = configureWidgets(configureWidgets(existing));
  expect(config.ios.entitlements['com.apple.security.application-groups']).toEqual(['group.other','group.com.edwardofclt.nourish.widgets']);
  expect(config.extra.eas.projectId).toBe('existing');
  expect(config.extra.eas.build.experimental.ios.appExtensions).toHaveLength(2);
});
