/* eslint-disable @typescript-eslint/no-require-imports */
const { copyFile, mkdir } = require('node:fs/promises');
const path = require('node:path');
const { IOSConfig, withXcodeProject } = require('expo/config-plugins');

const sourceNames = ['MacroCheckIn.swift', 'MacroCheckInReader.swift', 'MacroCheckInIntent.swift'];

async function installSiriSources({ project, projectName, platformProjectRoot }) {
  const destination = path.join(platformProjectRoot, projectName, 'Siri');
  await mkdir(destination, { recursive: true });
  for (const name of sourceNames) {
    await copyFile(path.join(__dirname, '../native/siri/Sources/GramelloSiri', name), path.join(destination, name));
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: `${projectName}/Siri/${name}`,
      groupName: projectName,
      project,
    });
  }
}

module.exports = function withSiriCheckIn(config) {
  return withXcodeProject(config, async mod => {
    await installSiriSources({
      project: mod.modResults,
      projectName: IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot),
      platformProjectRoot: mod.modRequest.platformProjectRoot,
    });
    return mod;
  });
};
module.exports.installSiriSources = installSiriSources;
