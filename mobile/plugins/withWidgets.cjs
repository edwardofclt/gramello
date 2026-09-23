/* eslint-disable @typescript-eslint/no-require-imports */
const { copyFile, mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { withXcodeProject } = require('expo/config-plugins');
const targetName = 'GramelloWidgets';
const group = 'group.com.edwardofclt.nourish.widgets';
const bundle = 'com.edwardofclt.nourish.widgets';

function configureWidgets(config) {
  config.ios ??= {};
  config.ios.entitlements ??= {};
  config.ios.entitlements['com.apple.security.application-groups'] = [...new Set([...(config.ios.entitlements['com.apple.security.application-groups'] ?? []),group])];
  config.extra ??= {}; config.extra.eas ??= {}; config.extra.eas.build ??= {};
  config.extra.eas.build.experimental ??= {}; config.extra.eas.build.experimental.ios ??= {};
  const ios = config.extra.eas.build.experimental.ios;
  ios.appExtensions = [...(ios.appExtensions ?? []).filter(e => e.targetName !== targetName),{
    targetName,bundleIdentifier:bundle,entitlements:{'com.apple.security.application-groups':[group]},
  }];
  return config;
}

async function installWidgetTarget({ project, platformProjectRoot, teamId, version = '1.0', buildNumber = '1' }) {
  const destination = path.join(platformProjectRoot,targetName);
  await mkdir(destination,{recursive:true});
  await copyFile(path.join(__dirname,'../native/widgets/ios/GramelloWidgets.swift'),path.join(destination,'GramelloWidgets.swift'));
  await copyFile(path.join(__dirname,'../native/siri/Sources/GramelloSiri/WidgetSnapshot.swift'),path.join(destination,'WidgetSnapshot.swift'));
  const plist = body => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>${body}</dict></plist>\n`;
  await writeFile(path.join(destination,'Info.plist'),plist(`
<key>CFBundleDisplayName</key><string>Gramello</string>
<key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
<key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
<key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
<key>CFBundlePackageType</key><string>XPC!</string>
<key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>
<key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>
<key>NSExtension</key><dict><key>NSExtensionPointIdentifier</key><string>com.apple.widgetkit-extension</string></dict>`));
  await writeFile(path.join(destination,'GramelloWidgets.entitlements'),plist(`<key>com.apple.security.application-groups</key><array><string>${group}</string></array>`));
  const objects = project.hash.project.objects;
  objects.PBXTargetDependency ??= {}; objects.PBXContainerItemProxy ??= {};
  let id = Object.entries(project.pbxNativeTargetSection()).find(([,v]) => typeof v === 'object' && v.name?.replaceAll('"','') === targetName)?.[0];
  if (!id) {
    id = project.addTarget(targetName,'app_extension',targetName,bundle).uuid;
    project.addBuildPhase([],'PBXSourcesBuildPhase','Sources',id);
    project.addBuildPhase([],'PBXFrameworksBuildPhase','Frameworks',id);
    project.addBuildPhase([],'PBXResourcesBuildPhase','Resources',id);
  }
  let groupId = project.findPBXGroupKey({name:targetName});
  if (!groupId) {
    groupId = project.addPbxGroup([],targetName).uuid;
    project.addToPbxGroup(groupId,project.getFirstProject().firstProject.mainGroup);
  }
  // node-xcode serializes an omitted addPbxGroup path as literal `undefined`.
  // Sources already use paths relative to the Xcode project root.
  delete objects.PBXGroup[groupId].path;
  for (const name of ['GramelloWidgets.swift','WidgetSnapshot.swift']) {
    const file = `${targetName}/${name}`;
    if (!project.hasFile(file)) project.addSourceFile(file,{target:id},groupId);
  }
  const target = project.pbxNativeTargetSection()[id];
  const configList = project.pbxXCConfigurationList()[target.buildConfigurationList];
  const mainTarget = project.getFirstTarget().firstTarget;
  const mainConfigs = project.pbxXCConfigurationList()[mainTarget.buildConfigurationList].buildConfigurations;
  for (const reference of configList.buildConfigurations) {
    const config = project.pbxXCBuildConfigurationSection()[reference.value];
    const parentReference = mainConfigs.find(r => r.comment === config.name);
    const parent = parentReference ? project.pbxXCBuildConfigurationSection()[parentReference.value].buildSettings : {};
    Object.assign(config.buildSettings,{
      PRODUCT_BUNDLE_IDENTIFIER:`"${bundle}"`,INFOPLIST_FILE:`"${targetName}/Info.plist"`,
      PRODUCT_MODULE_NAME:'GramelloWidgetExtension',
      CODE_SIGN_ENTITLEMENTS:`"${targetName}/GramelloWidgets.entitlements"`,
      IPHONEOS_DEPLOYMENT_TARGET:parent.IPHONEOS_DEPLOYMENT_TARGET ?? '16.4',
      SWIFT_VERSION:'5.0',TARGETED_DEVICE_FAMILY:'"1,2"',SDKROOT:'iphoneos',
      APPLICATION_EXTENSION_API_ONLY:'YES',SKIP_INSTALL:'YES',CODE_SIGN_STYLE:'Automatic',
      MARKETING_VERSION:parent.MARKETING_VERSION ?? `"${version}"`,
      CURRENT_PROJECT_VERSION:parent.CURRENT_PROJECT_VERSION ?? `"${buildNumber}"`,
      GENERATE_INFOPLIST_FILE:'NO',SWIFT_EMIT_LOC_STRINGS:'YES',
    });
    // EAS updates the main target's Info.plist build number independently. Use
    // the resolved Expo config for both targets at prebuild, not template values.
    config.buildSettings.MARKETING_VERSION = `"${version}"`;
    config.buildSettings.CURRENT_PROJECT_VERSION = `"${buildNumber}"`;
    if (teamId) config.buildSettings.DEVELOPMENT_TEAM = teamId;
  }
}

module.exports = function withWidgets(config) {
  configureWidgets(config);
  return withXcodeProject(config,async mod => {
    await installWidgetTarget({project:mod.modResults,platformProjectRoot:mod.modRequest.platformProjectRoot,
      teamId:mod.ios?.appleTeamId,version:mod.version,buildNumber:mod.ios?.buildNumber});
    return mod;
  });
};
module.exports.configureWidgets = configureWidgets;
module.exports.installWidgetTarget = installWidgetTarget;
