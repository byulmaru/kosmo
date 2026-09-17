import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const CONFIGURATION = {
  android: {
    appIdEnv: 'FIREBASE_NATIVE_CONFIG_ANDROID_APP_ID',
    expectedFilename: 'google-services.json',
    expectedPackageEnv: 'FIREBASE_NATIVE_CONFIG_ANDROID_PACKAGE_NAME',
    pathSegment: 'androidApps',
    outputEnv: 'KOSMO_ANDROID_GOOGLE_SERVICES_FILE',
    validateConfig(config, environment) {
      if (config.project_info?.project_id !== environment.projectId) {
        throw new Error('Firebase Android config project_id does not match the expected project.');
      }

      const client = config.client?.find(
        (candidate) =>
          candidate.client_info?.android_client_info?.package_name === environment.expectedPackage,
      );
      if (!client) {
        throw new Error('Firebase Android config does not contain the expected package.');
      }
      if (client.client_info?.mobilesdk_app_id !== environment.appId) {
        throw new Error('Firebase Android config app ID does not match the expected app.');
      }
    },
  },
  ios: {
    appIdEnv: 'FIREBASE_NATIVE_CONFIG_IOS_APP_ID',
    expectedFilename: 'GoogleService-Info.plist',
    expectedPackageEnv: 'FIREBASE_NATIVE_CONFIG_IOS_BUNDLE_ID',
    pathSegment: 'iosApps',
    outputEnv: 'KOSMO_IOS_GOOGLE_SERVICES_FILE',
    validateConfig(config, environment) {
      const projectId = plistStringValue(config, 'PROJECT_ID');
      const bundleId = plistStringValue(config, 'BUNDLE_ID');
      const appId = plistStringValue(config, 'GOOGLE_APP_ID');
      if (projectId !== environment.projectId) {
        throw new Error('Firebase iOS config PROJECT_ID does not match the expected project.');
      }
      if (bundleId !== environment.expectedPackage) {
        throw new Error('Firebase iOS config BUNDLE_ID does not match the expected bundle.');
      }
      if (appId !== environment.appId) {
        throw new Error('Firebase iOS config GOOGLE_APP_ID does not match the expected app.');
      }
    },
  },
};

function requiredEnvironment(name, environment = process.env) {
  const value = environment[name] ?? '';
  if (value.length === 0) {
    throw new Error(`${name} is required.`);
  }
  if (/\r|\n/u.test(value)) {
    throw new Error(`${name} must not contain line breaks.`);
  }
  return value;
}

function decodeBase64(value) {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)
  ) {
    throw new Error('Firebase config contents are not valid base64.');
  }

  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === 0 || decoded.toString('base64') !== value) {
    throw new Error('Firebase config contents are empty or invalid base64.');
  }
  return decoded;
}

function decodeXmlEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot);/giu, (_, entity) => {
    if (entity.toLowerCase() === 'amp') {
      return '&';
    }
    if (entity.toLowerCase() === 'apos') {
      return "'";
    }
    if (entity.toLowerCase() === 'gt') {
      return '>';
    }
    if (entity.toLowerCase() === 'lt') {
      return '<';
    }
    if (entity.toLowerCase() === 'quot') {
      return '"';
    }
    const codePoint = entity.toLowerCase().startsWith('#x')
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    return Number.isInteger(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
  });
}

function plistStringValue(plistBytes, key) {
  const plist = plistBytes.toString('utf8');
  if (/<!ENTITY/iu.test(plist) || !/<plist\b[^>]*>.*<\/plist>/isu.test(plist)) {
    throw new Error('Firebase iOS config is not a supported property list.');
  }

  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = plist.match(
    new RegExp(`<key>${escapedKey}<\\/key>\\s*<string>([\\s\\S]*?)<\\/string>`, 'u'),
  );
  if (!match) {
    throw new Error(`Firebase iOS config is missing ${key}.`);
  }
  return decodeXmlEntities(match[1]);
}

function expectedEnvironment(platform, environment = process.env) {
  const configuration = CONFIGURATION[platform];
  if (!configuration) {
    throw new Error(`Unsupported Firebase config platform: ${platform}.`);
  }

  return {
    appId: requiredEnvironment(configuration.appIdEnv, environment),
    expectedFilename: configuration.expectedFilename,
    expectedPackage: requiredEnvironment(configuration.expectedPackageEnv, environment),
    projectId: requiredEnvironment('FIREBASE_NATIVE_CONFIG_PROJECT_ID', environment),
    configuration,
  };
}

function appendGithubEnvironment(filePath, name, value) {
  if (!filePath) {
    throw new Error('GITHUB_ENV is required to publish the Firebase config path.');
  }
  if (value.includes('\n') || value.includes('\r')) {
    throw new Error('Firebase config path must not contain line breaks.');
  }
  fs.appendFileSync(filePath, `${name}=${value}${os.EOL}`, { encoding: 'utf8', mode: 0o600 });
}

/**
 * Fetch, validate, and publish one Firebase native config file.
 *
 * The access token is read only from the supplied environment and is never
 * written to disk or included in an error message.
 */
export async function fetchNativeFirebaseConfig({
  accessToken = process.env.FIREBASE_NATIVE_CONFIG_ACCESS_TOKEN,
  fetchImpl = fetch,
  githubEnvPath = process.env.GITHUB_ENV,
  outputDir,
  platform,
  environment = process.env,
}) {
  const expected = expectedEnvironment(platform, environment);
  if (!accessToken) {
    throw new Error('FIREBASE_NATIVE_CONFIG_ACCESS_TOKEN is required.');
  }
  if (/\r|\n/u.test(accessToken)) {
    throw new Error('FIREBASE_NATIVE_CONFIG_ACCESS_TOKEN must not contain line breaks.');
  }
  if (!outputDir) {
    throw new Error('Firebase config output directory is required.');
  }

  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(outputDir, 0o700);

  const appId = expected.appId;
  const url = `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(
    expected.projectId,
  )}/${expected.configuration.pathSegment}/${encodeURIComponent(appId)}/config`;
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Firebase ${platform} config request failed with HTTP ${response.status}.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Firebase ${platform} config response was not valid JSON.`);
  }

  if (payload.configFilename !== expected.expectedFilename) {
    throw new Error(`Firebase ${platform} config filename does not match the expected filename.`);
  }
  const configBytes = decodeBase64(payload.configFileContents ?? '');
  expected.configuration.validateConfig(
    platform === 'android' ? JSON.parse(configBytes.toString('utf8')) : configBytes,
    {
      appId,
      expectedPackage: expected.expectedPackage,
      projectId: expected.projectId,
    },
  );

  const outputPath = path.join(outputDir, expected.expectedFilename);
  fs.writeFileSync(outputPath, configBytes, { flag: 'wx', mode: 0o600 });
  fs.chmodSync(outputPath, 0o600);
  appendGithubEnvironment(githubEnvPath, expected.configuration.outputEnv, outputPath);
  return outputPath;
}

function parseArguments(argumentsList) {
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument.startsWith('--') || index + 1 >= argumentsList.length) {
      throw new Error(
        'Usage: node scripts/firebase-native-config.mjs --platform <android|ios> --output-dir <path>.',
      );
    }
    values.set(argument.slice(2), argumentsList[index + 1]);
    index += 1;
  }
  return values;
}

async function main() {
  const argumentsMap = parseArguments(process.argv.slice(2));
  const platform = argumentsMap.get('platform');
  const outputDir = argumentsMap.get('output-dir');
  if (!platform || !outputDir || argumentsMap.size !== 2) {
    throw new Error(
      'Usage: node scripts/firebase-native-config.mjs --platform <android|ios> --output-dir <path>.',
    );
  }

  await fetchNativeFirebaseConfig({ outputDir, platform });
  process.stdout.write(`Fetched Firebase ${platform} config.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
