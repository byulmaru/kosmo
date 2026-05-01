/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');

const { withDangerousMod, withGradleProperties } = require('expo/config-plugins');

function upsertProperty(properties, key, value) {
  const property = properties.find((item) => item.type === 'property' && item.key === key);

  if (property) {
    property.value = value;
    return;
  }

  properties.push({
    type: 'property',
    key,
    value,
  });
}

module.exports = function withGradleParallelDisabled(config) {
  config = withGradleProperties(config, (config) => {
    upsertProperty(config.modResults, 'org.gradle.parallel', 'false');
    return config;
  });

  return withDangerousMod(config, [
    'android',
    async (config) => {
      const buildGradlePath = path.join(
        config.modRequest.projectRoot,
        '..',
        '..',
        'node_modules',
        'expo-modules-core',
        'android',
        'build.gradle',
      );

      if (!fs.existsSync(buildGradlePath)) {
        return config;
      }

      const source = fs.readFileSync(buildGradlePath, 'utf8');
      const previous = `  afterEvaluate {
    println("Linking react-native-worklets native libs into expo-modules-core build tasks")
    println(workletsProject.tasks.getByName("mergeDebugNativeLibs"))
    println(workletsProject.tasks.getByName("mergeReleaseNativeLibs"))
    tasks.getByName("buildCMakeDebug").dependsOn(workletsProject.tasks.getByName("mergeDebugNativeLibs"))
    tasks.getByName("buildCMakeRelWithDebInfo").dependsOn(workletsProject.tasks.getByName("mergeReleaseNativeLibs"))
  }`;
      const next = `  afterEvaluate {
    println("Linking react-native-worklets native libs into expo-modules-core build tasks")
    def debugWorkletsTask = workletsProject.tasks.findByName("mergeDebugNativeLibs")
      ?: workletsProject.tasks.findByName("buildCMakeDebug")
      ?: workletsProject.tasks.findByName("externalNativeBuildDebug")
    def releaseWorkletsTask = workletsProject.tasks.findByName("mergeReleaseNativeLibs")
      ?: workletsProject.tasks.findByName("buildCMakeRelWithDebInfo")
      ?: workletsProject.tasks.findByName("externalNativeBuildRelease")

    if (debugWorkletsTask != null) {
      tasks.getByName("buildCMakeDebug").dependsOn(debugWorkletsTask)
    }
    if (releaseWorkletsTask != null) {
      tasks.getByName("buildCMakeRelWithDebInfo").dependsOn(releaseWorkletsTask)
    }
  }`;

      if (source.includes(previous)) {
        fs.writeFileSync(buildGradlePath, source.replace(previous, next));
      }

      const settingsExtensionPath = path.join(
        config.modRequest.projectRoot,
        '..',
        '..',
        'node_modules',
        '@react-native',
        'gradle-plugin',
        'settings-plugin',
        'src',
        'main',
        'kotlin',
        'com',
        'facebook',
        'react',
        'ReactSettingsExtension.kt',
      );

      if (!fs.existsSync(settingsExtensionPath)) {
        return config;
      }

      const settingsSource = fs.readFileSync(settingsExtensionPath, 'utf8');
      const previousSettings = `          ?.associate { deps ->
            ":\${deps.nameCleansed}" to File(deps.platforms?.android?.sourceDir)
          } ?: emptyMap()
    }`;
      const nextSettings = `          ?.associate { deps ->
            ":\${deps.nameCleansed}" to normalizeBunAndroidSourceDir(
                deps.nameCleansed,
                File(deps.platforms?.android?.sourceDir)
            )
          } ?: emptyMap()
    }

    private fun normalizeBunAndroidSourceDir(projectName: String, sourceDir: File): File {
      val normalizedPath = sourceDir.path.replace('\\\\', '/')
      val marker = "/node_modules/.bun/"
      val nestedPackage = "/node_modules/$projectName/android"

      if (!normalizedPath.contains(marker) || !normalizedPath.endsWith(nestedPackage)) {
        return sourceDir
      }

      val rootNodeModulesPath = normalizedPath.substringBefore(marker) + "/node_modules"
      val hoistedSourceDir = File("$rootNodeModulesPath/$projectName/android")
      return if (hoistedSourceDir.exists()) hoistedSourceDir else sourceDir
    }`;

      if (settingsSource.includes(previousSettings)) {
        fs.writeFileSync(
          settingsExtensionPath,
          settingsSource.replace(previousSettings, nextSettings),
        );
      }

      return config;
    },
  ]);
};
