import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import test from 'node:test';
import {
  collectExportPackageKeys,
  collectFontPackageKeys,
  collectNativePackageKeys,
} from './app-license-scope.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'kosmo-app-license-scope-'));
  mkdirSync(join(root, 'apps/app'), { recursive: true });
  writeFileSync(
    join(root, 'apps/app/package.json'),
    JSON.stringify({ name: '@kosmo/app', version: '1.0.0' }),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeFile(filePath, contents = '') {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function addPackage(root, name, version, files = {}) {
  const packagePath = join(root, 'node_modules', ...name.split('/'));
  mkdirSync(packagePath, { recursive: true });
  writeFile(join(packagePath, 'package.json'), JSON.stringify({ name, version }));
  for (const [filePath, contents] of Object.entries(files)) {
    writeFile(join(packagePath, filePath), contents);
  }
  return packagePath;
}

function addWorkspacePackage(root, name, version, directory) {
  const packagePath = join(root, directory);
  mkdirSync(packagePath, { recursive: true });
  writeFile(join(packagePath, 'package.json'), JSON.stringify({ name, version }));
  return packagePath;
}

function exportFixture(root, name, assetMap = {}) {
  const exportDir = join(root, 'exports', name);
  writeFile(join(exportDir, 'assetmap.json'), JSON.stringify(assetMap));
  mkdirSync(join(exportDir, 'assets'), { recursive: true });
  return exportDir;
}

function writeMap(exportDir, sources, extras = {}) {
  writeFile(
    join(exportDir, '_expo/static/js/index.js.map'),
    JSON.stringify({ version: 3, sources, ...extras }),
  );
}

function emitAsset(exportDir, relativeDirectory, sourcePath) {
  const contents = readFileSync(sourcePath);
  const hash = createHash('md5').update(contents).digest('hex');
  const extension = extname(sourcePath);
  const stem = basename(sourcePath, extension);
  const scale = /(@\d+x)$/.exec(stem)?.[1] ?? '';
  const prefix = scale ? stem.slice(0, -scale.length) : stem;
  const emittedName = `${prefix}.${hash}${scale}${extension}`;
  writeFile(join(exportDir, 'assets', relativeDirectory, emittedName), contents);
}

test('collects Metro package sources and independently attributes emitted web assets', (t) => {
  const root = fixture(t);
  const mapped = addPackage(root, 'map-dep', '1.0.0', { 'index.js': '', 'nested/index.js': '' });
  writeFile(join(mapped, 'nested/package.json'), JSON.stringify({ type: 'module' }));
  const emitted = addPackage(root, 'emitted-only', '2.0.0', { 'fonts/font.woff2': 'font bytes' });
  const local = addWorkspacePackage(root, '@kosmo/local', '3.0.0', 'packages/local');
  writeFile(join(local, 'index.js'));
  writeFile(join(root, 'apps/app/assets/brand/local-logo.png'), 'local logo');
  writeFile(join(root, 'apps/app/assets/icons/close@2x.png'), '2x icon');
  writeFile(join(root, 'apps/app/assets/icons/close@3x.png'), '3x icon');

  const exportDir = exportFixture(root, 'web');
  writeMap(exportDir, [
    '/node_modules/map-dep/index.js?ctx=metro',
    '/node_modules/map-dep/nested/index.js',
    '/packages/local/index.js',
    '__prelude__',
  ]);
  emitAsset(exportDir, '__node_modules/emitted-only/fonts', join(emitted, 'fonts/font.woff2'));
  emitAsset(exportDir, 'assets/brand', join(root, 'apps/app/assets/brand/local-logo.png'));
  emitAsset(exportDir, 'assets/icons', join(root, 'apps/app/assets/icons/close@2x.png'));
  emitAsset(exportDir, 'assets/icons', join(root, 'apps/app/assets/icons/close@3x.png'));

  assert.deepEqual(collectExportPackageKeys(exportDir, { root, platform: 'web' }), [
    'emitted-only@2.0.0',
    'map-dep@1.0.0',
  ]);
});

test('fails for emitted npm assets without an original file and unknown local asset origins', (t) => {
  const root = fixture(t);
  addPackage(root, 'missing-asset', '1.0.0');

  const missingNpm = exportFixture(root, 'missing-npm-asset');
  writeMap(missingNpm, ['__prelude__']);
  writeFile(
    join(
      missingNpm,
      'assets/__node_modules/missing-asset/assets/icon.00000000000000000000000000000000.png',
    ),
  );
  assert.throws(
    () => collectExportPackageKeys(missingNpm, { root, platform: 'web' }),
    /Could not resolve original source for emitted web asset/,
  );

  const missingLocal = exportFixture(root, 'unknown-local-asset');
  writeMap(missingLocal, ['__prelude__']);
  writeFile(join(missingLocal, 'assets/assets/unlisted/icon.00000000000000000000000000000000.png'));
  assert.throws(
    () => collectExportPackageKeys(missingLocal, { root, platform: 'web' }),
    /Could not resolve original source for emitted web asset/,
  );
});

test('collects native asset-map file and location packages with source-map packages', (t) => {
  const root = fixture(t);
  addPackage(root, 'native-map-dep', '1.0.0', { 'index.js': '' });
  const asset = addPackage(root, 'native-asset-dep', '2.0.0', { 'assets/icon.png': '' });
  const exportDir = exportFixture(root, 'android', {
    icon: {
      fileSystemLocation: join(asset, 'assets'),
      files: [join(asset, 'assets/icon.png')],
    },
  });
  writeMap(exportDir, ['/node_modules/native-map-dep/index.js', '\0polyfill:assets-registry']);

  assert.deepEqual(collectExportPackageKeys(exportDir, { root, platform: 'android' }), [
    'native-asset-dep@2.0.0',
    'native-map-dep@1.0.0',
  ]);
});

test('fails when export outputs or real source paths are missing', (t) => {
  const root = fixture(t);
  const noMap = exportFixture(root, 'missing-map');
  assert.throws(
    () => collectExportPackageKeys(noMap, { root, platform: 'web' }),
    /did not emit source maps/,
  );

  const noAssetMap = join(root, 'exports/no-assetmap');
  writeMap(noAssetMap, ['__prelude__']);
  assert.throws(
    () => collectExportPackageKeys(noAssetMap, { root, platform: 'web' }),
    /did not emit.*assetmap/,
  );

  const missingSource = exportFixture(root, 'missing-source');
  writeMap(missingSource, ['/node_modules/absent-package/index.js']);
  assert.throws(
    () => collectExportPackageKeys(missingSource, { root, platform: 'web' }),
    /references missing source/,
  );

  const missingAsset = exportFixture(root, 'missing-asset', {
    icon: { fileSystemLocation: join(root, 'node_modules/absent-package/assets'), files: [] },
  });
  writeMap(missingAsset, ['__prelude__']);
  assert.throws(
    () => collectExportPackageKeys(missingAsset, { root, platform: 'android' }),
    /no source files/,
  );
});

test('skips only named Metro virtual sources and rejects unsupported map shapes', (t) => {
  const root = fixture(t);
  const knownVirtual = exportFixture(root, 'known-virtual');
  writeMap(knownVirtual, ['__debugid__', '\0polyfill:external-require']);
  assert.deepEqual(collectExportPackageKeys(knownVirtual, { root, platform: 'web' }), []);

  const unknownVirtual = exportFixture(root, 'unknown-virtual');
  writeMap(unknownVirtual, ['\0polyfill:unrecognized']);
  assert.throws(
    () => collectExportPackageKeys(unknownVirtual, { root, platform: 'web' }),
    /Unrecognized Metro virtual source/,
  );

  const rooted = exportFixture(root, 'source-root');
  writeMap(rooted, ['__prelude__'], { sourceRoot: '/sources' });
  assert.throws(
    () => collectExportPackageKeys(rooted, { root, platform: 'web' }),
    /sourceRoot are not supported/,
  );

  const indexed = exportFixture(root, 'indexed');
  writeMap(indexed, [], {
    sections: [{ offset: { line: 0, column: 0 }, map: { sources: ['__prelude__'] } }],
  });
  assert.throws(
    () => collectExportPackageKeys(indexed, { root, platform: 'web' }),
    /Indexed source maps are not supported/,
  );
});

test('collects Expo and React Native autolink roots and excludes a workspace module', (t) => {
  const root = fixture(t);
  const expoAndroid = addPackage(root, 'expo-android-module', '1.2.0', {
    'android/build.gradle': '',
  });
  const expoApple = addPackage(root, 'expo-apple-module', '2.3.0', { 'ios/module.podspec': '' });
  const reactNative = addPackage(root, '@native/rn-module', '3.4.0', {
    'android/build.gradle': '',
    'ios/module.podspec': '',
  });
  const localExpo = addWorkspacePackage(
    root,
    '@kosmo/local-expo-module',
    '4.5.0',
    'packages/local-expo-module',
  );
  writeFile(join(localExpo, 'android/build.gradle'));
  writeFile(join(localExpo, 'ios/module.podspec'));

  const android = collectNativePackageKeys({
    root,
    platform: 'android',
    expoResolution: {
      modules: [
        {
          packageName: 'expo-android-module',
          packageVersion: '1.2.0',
          projects: [{ sourceDir: join(expoAndroid, 'android') }],
        },
        {
          packageName: '@kosmo/local-expo-module',
          packageVersion: '4.5.0',
          projects: [{ sourceDir: join(localExpo, 'android') }],
        },
      ],
    },
    reactNativeConfig: {
      dependencies: {
        '@native/rn-module': {
          root: reactNative,
          platforms: { android: { sourceDir: join(reactNative, 'android') } },
        },
      },
    },
  });
  assert.deepEqual(android, ['@native/rn-module@3.4.0', 'expo-android-module@1.2.0']);

  const ios = collectNativePackageKeys({
    root,
    platform: 'ios',
    expoResolution: {
      modules: [
        {
          packageName: 'expo-apple-module',
          packageVersion: '2.3.0',
          pods: [{ podspecDir: join(expoApple, 'ios') }],
        },
      ],
    },
    reactNativeConfig: {
      dependencies: {
        '@native/rn-module': {
          root: reactNative,
          platforms: { ios: { podspecPath: join(reactNative, 'ios/module.podspec') } },
        },
      },
    },
  });
  assert.deepEqual(ios, ['@native/rn-module@3.4.0', 'expo-apple-module@2.3.0']);
});

test('rejects unresolved or mismatched native link roots', (t) => {
  const root = fixture(t);
  const expo = addPackage(root, 'expo-module', '1.0.0', { 'android/build.gradle': '' });
  assert.throws(
    () =>
      collectNativePackageKeys({
        root,
        platform: 'android',
        expoResolution: {
          modules: [
            {
              packageName: 'expo-module',
              packageVersion: '1.0.0',
              projects: [{ sourceDir: join(expo, 'missing') }],
            },
          ],
        },
        reactNativeConfig: { dependencies: {} },
      }),
    /does not exist/,
  );

  assert.throws(
    () =>
      collectNativePackageKeys({
        root,
        platform: 'android',
        expoResolution: {
          modules: [
            {
              packageName: 'expo-module',
              packageVersion: '9.9.9',
              projects: [{ sourceDir: join(expo, 'android') }],
            },
          ],
        },
        reactNativeConfig: { dependencies: {} },
      }),
    /metadata did not match its root/,
  );
});

test('collects static font packages from evaluated Expo config and skips app-local font files', (t) => {
  const root = fixture(t);
  addPackage(root, '@fonts/suit', '1.0.0', { 'fonts/suit.ttf': '' });
  addPackage(root, 'pretendard', '2.0.0', { 'fonts/pretendard.otf': '' });
  addPackage(root, 'font-licenses', '3.0.0', { 'fonts/license.ttf': '' });
  writeFile(join(root, 'apps/app/assets/local.ttf'));

  assert.deepEqual(
    collectFontPackageKeys({
      root,
      publicConfig: {
        plugins: [
          [
            'expo-font',
            {
              fonts: ['font-licenses/fonts/license.ttf'],
              android: {
                fonts: [
                  {
                    fontFamily: 'SUIT Variable',
                    fontDefinitions: [{ path: '@fonts/suit/fonts/suit.ttf', weight: 400 }],
                  },
                ],
              },
              ios: {
                fonts: ['pretendard/fonts/pretendard.otf', './assets/local.ttf'],
              },
            },
          ],
        ],
      },
    }),
    ['@fonts/suit@1.0.0', 'font-licenses@3.0.0', 'pretendard@2.0.0'],
  );
});

test('fails when evaluated Expo font definitions cannot resolve', (t) => {
  const root = fixture(t);
  assert.throws(
    () =>
      collectFontPackageKeys({
        root,
        publicConfig: {
          plugins: [
            [
              'expo-font',
              {
                android: {
                  fonts: [
                    {
                      fontFamily: 'Missing',
                      fontDefinitions: [{ path: './missing.ttf', weight: 400 }],
                    },
                  ],
                },
              },
            ],
          ],
        },
      }),
    /Could not resolve evaluated expo-font resource/,
  );
});
