/* eslint-disable @typescript-eslint/no-require-imports -- CNG plugin behavior test is CommonJS. */
const assert = require('node:assert/strict');

const plugin = require('./withAndroidCodeOptimization');

const appBuildGradle = `android {
    buildTypes {
        release {
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
            minifyEnabled enableMinifyInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
            def enablePngCrunchInRelease = findProperty('android.enablePngCrunchInReleaseBuilds') ?: 'true'
            crunchPngs enablePngCrunchInRelease.toBoolean()
        }
    }
}
`;

const optimizedAppBuildGradle = `android {
    buildTypes {
        release {
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
            minifyEnabled enableMinifyInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
            def enablePngCrunchInRelease = findProperty('android.enablePngCrunchInReleaseBuilds') ?: 'true'
            crunchPngs enablePngCrunchInRelease.toBoolean()
        }
    }
}
`;

async function applyPlugin(contents) {
  const config = plugin({ _internal: { isDebug: false } });
  const result = await config.mods.android.appBuildGradle({
    modRequest: {},
    modResults: { contents },
  });
  return result.modResults.contents;
}

async function main() {
  const first = await applyPlugin(appBuildGradle);
  assert.equal(first, optimizedAppBuildGradle);
  assert.equal(await applyPlugin(first), first);

  await assert.rejects(
    () => applyPlugin('android { buildTypes { release {} } }\n'),
    /Unable to enable Android code optimization.*expected app\/build\.gradle to contain/,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
