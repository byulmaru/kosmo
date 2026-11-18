/* eslint-disable @typescript-eslint/no-require-imports -- Expo loads config plugins as CommonJS. */
const { withAppBuildGradle } = require('expo/config-plugins');

const DEFAULT_PROGUARD_FILE = 'getDefaultProguardFile("proguard-android.txt")';
const OPTIMIZED_PROGUARD_FILE = 'getDefaultProguardFile("proguard-android-optimize.txt")';

function withAndroidCodeOptimization(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    const { contents } = gradleConfig.modResults;

    if (contents.includes(OPTIMIZED_PROGUARD_FILE)) {
      return gradleConfig;
    }

    if (!contents.includes(DEFAULT_PROGUARD_FILE)) {
      throw new Error(
        'Unable to enable Android code optimization: expected app/build.gradle to contain ' +
          `"${DEFAULT_PROGUARD_FILE}" or "${OPTIMIZED_PROGUARD_FILE}". ` +
          'The generated Gradle template may have changed.',
      );
    }

    gradleConfig.modResults.contents = contents.replace(
      DEFAULT_PROGUARD_FILE,
      OPTIMIZED_PROGUARD_FILE,
    );
    return gradleConfig;
  });
}

module.exports = withAndroidCodeOptimization;
