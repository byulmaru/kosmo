'use strict';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo config plugins load this plugin through CommonJS.
const fs = require('node:fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo config plugins load this plugin through CommonJS.
const path = require('node:path');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo config plugins load this plugin through CommonJS.
const { AndroidConfig, withAndroidManifest, withExpoPlist } = require('expo/config-plugins');

const UPDATE_URL_METADATA = 'expo.modules.updates.EXPO_UPDATE_URL';
const UPDATE_URL_PLIST_KEY = 'EXUpdatesURL';

function releaseUpdateConfig(config, platform) {
  const runtimeVersion = process.env.KOSMO_OTA_RUNTIME_VERSION;
  const channel = process.env.KOSMO_OTA_CHANNEL;

  if (runtimeVersion === undefined && channel === undefined) {
    return null;
  }

  if (runtimeVersion === undefined || runtimeVersion.length === 0) {
    throw new Error(
      'KOSMO_OTA_RUNTIME_VERSION is required for a release native prebuild when KOSMO_OTA_CHANNEL is set.',
    );
  }

  if (channel === undefined || channel.length === 0) {
    throw new Error(
      'KOSMO_OTA_CHANNEL is required for a release native prebuild when KOSMO_OTA_RUNTIME_VERSION is set.',
    );
  }

  const updateServiceUrl = config.updates?.url;
  const codeSigningCertificate = config.updates?.codeSigningCertificate;
  if (!updateServiceUrl || !codeSigningCertificate) {
    throw new Error(
      'updates.url and updates.codeSigningCertificate are required for a release native prebuild.',
    );
  }

  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(runtimeVersion)) {
    throw new Error(
      'KOSMO_OTA_RUNTIME_VERSION must be a lowercase Expo fingerprint hash (40 or 64 hexadecimal characters).',
    );
  }

  if (!/^[A-Za-z0-9._-]+$/u.test(channel) || channel === '.' || channel === '..') {
    throw new Error(
      'KOSMO_OTA_CHANNEL must be a safe single path segment using only letters, numbers, dot, underscore, or hyphen.',
    );
  }

  const certificatePath = path.join(config.modRequest.projectRoot, codeSigningCertificate);
  let certificateStats;
  try {
    certificateStats = fs.statSync(certificatePath);
  } catch {
    throw new Error(
      `OTA code-signing certificate is required for a release native prebuild: ${certificatePath}`,
    );
  }
  if (!certificateStats.isFile() || certificateStats.size === 0) {
    throw new Error(
      `OTA code-signing certificate is required for a release native prebuild: ${certificatePath}`,
    );
  }

  return `${updateServiceUrl}/${platform}/${channel}/${runtimeVersion}/manifest.json`;
}

function withReleaseUpdateUrl(config, platform) {
  const updateUrl = releaseUpdateConfig(config, platform);
  if (updateUrl === null) {
    return config;
  }

  if (platform === 'android') {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      UPDATE_URL_METADATA,
      updateUrl,
    );
  } else {
    config.modResults[UPDATE_URL_PLIST_KEY] = updateUrl;
  }

  return config;
}

function withKosmoOta(config) {
  config = withAndroidManifest(config, (modConfig) => withReleaseUpdateUrl(modConfig, 'android'));
  config = withExpoPlist(config, (modConfig) => withReleaseUpdateUrl(modConfig, 'ios'));
  return config;
}

module.exports = withKosmoOta;
