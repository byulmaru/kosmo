import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fetchNativeFirebaseConfig } from './firebase-native-config.mjs';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmo-firebase-native-config-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function environment(overrides = {}) {
  return {
    FIREBASE_NATIVE_CONFIG_ANDROID_APP_ID: '1:123:android:abc',
    FIREBASE_NATIVE_CONFIG_ANDROID_PACKAGE_NAME: 'moe.kos',
    FIREBASE_NATIVE_CONFIG_IOS_APP_ID: '1:123:ios:def',
    FIREBASE_NATIVE_CONFIG_IOS_BUNDLE_ID: 'moe.kos',
    FIREBASE_NATIVE_CONFIG_PROJECT_ID: 'byulmaru-kosmo',
    ...overrides,
  };
}

function responseFor(configFilename, bytes) {
  return new Response(
    JSON.stringify({
      configFileContents: Buffer.from(bytes).toString('base64'),
      configFilename,
    }),
    { status: 200 },
  );
}

describe('fetchNativeFirebaseConfig', () => {
  it('writes and exports a validated Android config with restricted permissions', async () => {
    const directory = temporaryDirectory();
    const githubEnv = path.join(directory, 'github-env');
    const androidConfig = JSON.stringify({
      client: [
        {
          client_info: {
            android_client_info: { package_name: 'moe.kos' },
            mobilesdk_app_id: '1:123:android:abc',
          },
        },
      ],
      project_info: { project_id: 'byulmaru-kosmo' },
    });

    const outputPath = await fetchNativeFirebaseConfig({
      accessToken: 'short-lived-token',
      environment: environment(),
      fetchImpl: async (url, options) => {
        assert.match(url, /\/androidApps\/1%3A123%3Aandroid%3Aabc\/config$/u);
        assert.equal(options.headers.Authorization, 'Bearer short-lived-token');
        return responseFor('google-services.json', androidConfig);
      },
      githubEnvPath: githubEnv,
      outputDir: path.join(directory, 'config'),
      platform: 'android',
    });

    assert.equal(fs.readFileSync(outputPath, 'utf8'), androidConfig);
    assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(outputPath)).mode & 0o777, 0o700);
    assert.match(
      fs.readFileSync(githubEnv, 'utf8'),
      new RegExp(`^KOSMO_ANDROID_GOOGLE_SERVICES_FILE=${outputPath}$`, 'mu'),
    );
  });

  it('writes and exports a validated iOS property list', async () => {
    const directory = temporaryDirectory();
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>PROJECT_ID</key><string>byulmaru-kosmo</string>
<key>BUNDLE_ID</key><string>moe.kos</string>
<key>GOOGLE_APP_ID</key><string>1:123:ios:def</string>
</dict></plist>`;
    const githubEnv = path.join(directory, 'github-env');

    const outputPath = await fetchNativeFirebaseConfig({
      accessToken: 'short-lived-token',
      environment: environment(),
      fetchImpl: async (url) => {
        assert.match(url, /\/iosApps\/1%3A123%3Aios%3Adef\/config$/u);
        return responseFor('GoogleService-Info.plist', plist);
      },
      githubEnvPath: githubEnv,
      outputDir: path.join(directory, 'config'),
      platform: 'ios',
    });

    assert.equal(fs.readFileSync(outputPath, 'utf8'), plist);
    assert.equal(path.basename(outputPath), 'GoogleService-Info.plist');
    assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
    assert.match(
      fs.readFileSync(githubEnv, 'utf8'),
      new RegExp(`^KOSMO_IOS_GOOGLE_SERVICES_FILE=${outputPath}$`, 'mu'),
    );
  });

  it('rejects a config whose package does not match the build target', async () => {
    const directory = temporaryDirectory();
    const androidConfig = JSON.stringify({
      client: [
        {
          client_info: {
            android_client_info: { package_name: 'other.example' },
            mobilesdk_app_id: '1:123:android:abc',
          },
        },
      ],
      project_info: { project_id: 'byulmaru-kosmo' },
    });

    await assert.rejects(
      fetchNativeFirebaseConfig({
        accessToken: 'short-lived-token',
        environment: environment(),
        fetchImpl: async () => responseFor('google-services.json', androidConfig),
        githubEnvPath: path.join(directory, 'github-env'),
        outputDir: path.join(directory, 'config'),
        platform: 'android',
      }),
      /expected package/u,
    );
  });

  it('does not include an HTTP error body in the failure message', async () => {
    const directory = temporaryDirectory();

    await assert.rejects(
      fetchNativeFirebaseConfig({
        accessToken: 'short-lived-token',
        environment: environment(),
        fetchImpl: async () => new Response('secret response body', { status: 403 }),
        githubEnvPath: path.join(directory, 'github-env'),
        outputDir: path.join(directory, 'config'),
        platform: 'android',
      }),
      (error) => {
        assert.match(error.message, /HTTP 403/u);
        assert.doesNotMatch(error.message, /secret response body/u);
        return true;
      },
    );
  });
});
