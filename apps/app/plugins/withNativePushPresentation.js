/* eslint-disable @typescript-eslint/no-require-imports -- Expo loads config plugins as CommonJS. */
const fs = require('node:fs');
const path = require('node:path');
const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
  withXcodeProject,
} = require('expo/config-plugins');

const ANDROID_PACKAGE = 'moe.kos.notifications';
const TOOLS_NAMESPACE = 'http://schemas.android.com/tools';
const NATIVE_SOURCE_ROOT = path.join(__dirname, 'native-push', 'android');
const IOS_NATIVE_SOURCE_ROOT = path.join(__dirname, 'native-push', 'ios');
const IOS_EXTENSION_NAME = 'KosmoPushContent';
const IOS_EXTENSION_BUNDLE_IDENTIFIER = 'moe.kos.push-content';
const IOS_EXTENSION_SOURCE_ROOT = `${IOS_EXTENSION_NAME}`;
const IOS_EXTENSION_SOURCE_FILE = 'NotificationViewController.swift';
const REMOVED_MESSAGING_SERVICE_SUFFIXES = [
  'expo.modules.notifications.service.ExpoFirebaseMessagingService',
  'io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService',
];
const REMOVED_NOTIFICATION_RECEIVER_SUFFIX =
  'expo.modules.notifications.service.NotificationsService';
const MESSAGING_SERVICE_NAME = `${ANDROID_PACKAGE}.KosmoFirebaseMessagingService`;
const NOTIFICATION_RECEIVER_NAME = `${ANDROID_PACKAGE}.KosmoNotificationsService`;
const PRESENTATION_PACKAGE_IMPORT_KOTLIN = `import ${ANDROID_PACKAGE}.KosmoPushPresentationPackage`;
const PRESENTATION_PACKAGE_IMPORT_JAVA = `${PRESENTATION_PACKAGE_IMPORT_KOTLIN};`;
const PRESENTATION_PACKAGE_ADD = 'add(KosmoPushPresentationPackage())';
const PRESENTATION_PACKAGE_ADD_JAVA = 'packages.add(new KosmoPushPresentationPackage());';
const FIREBASE_MESSAGING_DEPENDENCY =
  'implementation "com.google.firebase:firebase-messaging:25.0.1"';

function componentName(component) {
  return component?.$?.['android:name'] ?? '';
}

function withToolsRemove(component) {
  return {
    ...component,
    $: {
      ...(component.$ ?? {}),
      'tools:node': 'remove',
    },
  };
}

function removeLibraryComponents(components, componentNames) {
  const result = [...components];
  for (const nameToRemove of componentNames) {
    let found = false;
    for (let index = 0; index < result.length; index += 1) {
      if (!componentName(result[index]).endsWith(nameToRemove)) {
        continue;
      }
      found = true;
      result[index] = withToolsRemove(result[index]);
    }
    if (!found) {
      result.push(
        withToolsRemove({
          $: {
            'android:name': nameToRemove,
          },
        }),
      );
    }
  }
  return result;
}

const messagingService = {
  $: {
    'android:name': MESSAGING_SERVICE_NAME,
    'android:exported': 'false',
  },
  'intent-filter': [
    {
      action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }],
    },
  ],
};

const notificationReceiver = {
  $: {
    'android:name': NOTIFICATION_RECEIVER_NAME,
    'android:enabled': 'true',
    'android:exported': 'false',
  },
  'intent-filter': [
    {
      action: [
        { $: { 'android:name': 'expo.modules.notifications.NOTIFICATION_EVENT' } },
        { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
        { $: { 'android:name': 'android.intent.action.REBOOT' } },
        { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
        { $: { 'android:name': 'com.htc.intent.action.QUICKBOOT_POWERON' } },
        { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
      ],
    },
  ],
};

function withNativePushManifest(config) {
  return withAndroidManifest(config, (manifestConfig) => {
    const manifest = manifestConfig.modResults.manifest;
    manifest.$ ??= {};
    manifest.$['xmlns:tools'] ??= TOOLS_NAMESPACE;
    const application = manifest.application?.[0];
    if (!application) {
      throw new Error('Native push presentation requires an Android application manifest.');
    }

    application.service = removeLibraryComponents(
      application.service ?? [],
      REMOVED_MESSAGING_SERVICE_SUFFIXES,
    );
    application.service = application.service.filter(
      (component, index, components) =>
        componentName(component) !== MESSAGING_SERVICE_NAME ||
        components.findIndex((candidate) => componentName(candidate) === MESSAGING_SERVICE_NAME) ===
          index,
    );
    if (
      !application.service.some((component) => componentName(component) === MESSAGING_SERVICE_NAME)
    ) {
      application.service.push(messagingService);
    }

    application.receiver = removeLibraryComponents(application.receiver ?? [], [
      REMOVED_NOTIFICATION_RECEIVER_SUFFIX,
    ]);
    application.receiver = application.receiver.filter(
      (component, index, components) =>
        componentName(component) !== NOTIFICATION_RECEIVER_NAME ||
        components.findIndex(
          (candidate) => componentName(candidate) === NOTIFICATION_RECEIVER_NAME,
        ) === index,
    );
    if (
      !application.receiver.some(
        (component) => componentName(component) === NOTIFICATION_RECEIVER_NAME,
      )
    ) {
      application.receiver.push(notificationReceiver);
    }

    return manifestConfig;
  });
}

function withPresentationPackage(config) {
  return withMainApplication(config, (applicationConfig) => {
    let contents = applicationConfig.modResults.contents;
    const isJava = /^\s*import [^\n;]+;\s*$/m.test(contents);
    const packageImport = isJava
      ? PRESENTATION_PACKAGE_IMPORT_JAVA
      : PRESENTATION_PACKAGE_IMPORT_KOTLIN;
    if (!contents.includes(packageImport)) {
      contents = contents.replace(/(^package\s+[^\n]+\n)/m, `$1\n${packageImport}\n`);
    }

    if (
      !contents.includes(PRESENTATION_PACKAGE_ADD) &&
      !contents.includes(PRESENTATION_PACKAGE_ADD_JAVA)
    ) {
      const kotlinPackages = /(PackageList\(this\)\.packages\.apply\s*\{\n)/;
      const javaPackages =
        /(List<ReactPackage>\s+packages\s*=\s*new PackageList\(this\)\.getPackages\(\);\n)/;
      if (kotlinPackages.test(contents)) {
        contents = contents.replace(kotlinPackages, `$1    ${PRESENTATION_PACKAGE_ADD}\n`);
      } else if (javaPackages.test(contents)) {
        contents = contents.replace(javaPackages, `$1    ${PRESENTATION_PACKAGE_ADD_JAVA}\n`);
      } else {
        throw new Error(
          'Native push presentation could not find the generated MainApplication package list.',
        );
      }
    }

    applicationConfig.modResults.contents = contents;
    return applicationConfig;
  });
}

function withFirebaseMessagingDependency(config) {
  return withAppBuildGradle(config, (buildGradleConfig) => {
    let contents = buildGradleConfig.modResults.contents;
    if (!contents.includes(FIREBASE_MESSAGING_DEPENDENCY)) {
      const dependencies = /(^dependencies\s*\{\n)/m;
      if (!dependencies.test(contents)) {
        throw new Error(
          'Native push presentation could not find the generated app dependencies block.',
        );
      }
      contents = contents.replace(dependencies, `$1    ${FIREBASE_MESSAGING_DEPENDENCY}\n`);
    }
    buildGradleConfig.modResults.contents = contents;
    return buildGradleConfig;
  });
}

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function withNativePushSources(config) {
  return withDangerousMod(config, [
    'android',
    async (dangerousConfig) => {
      const androidRoot = dangerousConfig.modRequest.platformProjectRoot;
      copyDirectory(
        path.join(NATIVE_SOURCE_ROOT, 'src', 'main', 'java'),
        path.join(androidRoot, 'app', 'src', 'main', 'java'),
      );
      copyDirectory(
        path.join(NATIVE_SOURCE_ROOT, 'src', 'main', 'res'),
        path.join(androidRoot, 'app', 'src', 'main', 'res'),
      );
      return dangerousConfig;
    },
  ]);
}

function unquote(value) {
  return typeof value === 'string' ? value.replace(/^"|"$/g, '') : value;
}

function removeUndefinedValues(value) {
  if (Array.isArray(value)) {
    value.forEach(removeUndefinedValues);
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) {
      delete value[key];
    } else {
      removeUndefinedValues(child);
    }
  }
}

function findNativeTarget(project, name) {
  const targets = project.pbxNativeTargetSection();
  return Object.entries(targets).find(
    ([key, target]) => !key.endsWith('_comment') && unquote(target.name) === name,
  );
}

function updateTargetBuildSettings(project, targetUuid, settings) {
  const target = project.pbxNativeTargetSection()[targetUuid];
  const configurationList = project.pbxXCConfigurationList()[target.buildConfigurationList];
  const configurations = project.pbxXCBuildConfigurationSection();
  for (const configuration of configurationList.buildConfigurations) {
    Object.assign(configurations[configuration.value].buildSettings, settings);
  }
}

function ensureIosTargetDependency(project, hostTargetUuid, extensionTargetUuid) {
  const hostTarget = project.pbxNativeTargetSection()[hostTargetUuid];
  const objects = project.hash.project.objects;
  objects.PBXTargetDependency ??= {};
  objects.PBXContainerItemProxy ??= {};
  const targetDependencies = objects.PBXTargetDependency;
  const alreadyDepends = (hostTarget.dependencies ?? []).some(
    ({ value }) => targetDependencies[value]?.target === extensionTargetUuid,
  );
  if (!alreadyDepends) {
    project.addTargetDependency(hostTargetUuid, [extensionTargetUuid]);
  }
}

function ensureIosSourceBuildPhase(project, targetUuid) {
  if (!project.buildPhase('Sources', targetUuid)) {
    project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', targetUuid);
  }
  if (!project.buildPhase('Resources', targetUuid)) {
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', targetUuid);
  }
  if (!project.buildPhase('Frameworks', targetUuid)) {
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', targetUuid);
  }
}

function ensureIosSourceFile(project, filePath, targetUuid) {
  let sourceGroupUuid = project.findPBXGroupKey({ name: IOS_EXTENSION_SOURCE_ROOT });
  if (!sourceGroupUuid) {
    sourceGroupUuid = project.pbxCreateGroup(IOS_EXTENSION_SOURCE_ROOT, IOS_EXTENSION_SOURCE_ROOT);
    const rootGroupUuid = project.getFirstProject().firstProject.mainGroup;
    project.addToPbxGroup(sourceGroupUuid, rootGroupUuid);
  }
  const sourceFile = project.hasFile(filePath);
  if (!sourceFile) {
    project.addSourceFile(filePath, { target: targetUuid }, sourceGroupUuid);
  }
}

function withNativePushIosProject(config) {
  return withXcodeProject(config, (projectConfig) => {
    const project = projectConfig.modResults;
    const hostTargetUuid = project.getFirstTarget().uuid;
    project.hash.project.objects.PBXTargetDependency ??= {};
    project.hash.project.objects.PBXContainerItemProxy ??= {};
    let extensionTargetEntry = findNativeTarget(project, IOS_EXTENSION_NAME);
    if (!extensionTargetEntry) {
      const extensionTarget = project.addTarget(
        IOS_EXTENSION_NAME,
        'app_extension',
        IOS_EXTENSION_SOURCE_ROOT,
        IOS_EXTENSION_BUNDLE_IDENTIFIER,
      );
      extensionTargetEntry = [extensionTarget.uuid, extensionTarget.pbxNativeTarget];
    }

    const [extensionTargetUuid] = extensionTargetEntry;
    ensureIosSourceBuildPhase(project, extensionTargetUuid);
    ensureIosSourceFile(project, IOS_EXTENSION_SOURCE_FILE, extensionTargetUuid);
    ensureIosTargetDependency(project, hostTargetUuid, extensionTargetUuid);
    updateTargetBuildSettings(project, extensionTargetUuid, {
      APPLICATION_EXTENSION_API_ONLY: 'YES',
      CLANG_ENABLE_MODULES: 'YES',
      CURRENT_PROJECT_VERSION: '1',
      GENERATE_INFOPLIST_FILE: 'YES',
      INFOPLIST_FILE: `${IOS_EXTENSION_SOURCE_ROOT}/${IOS_EXTENSION_NAME}-Info.plist`,
      INFOPLIST_KEY_CFBundleDisplayName: IOS_EXTENSION_NAME,
      INFOPLIST_KEY_CFBundlePackageType: '"XPC!"',
      INFOPLIST_KEY_CFBundleShortVersionString: '"$(MARKETING_VERSION)"',
      INFOPLIST_KEY_CFBundleVersion: '"$(CURRENT_PROJECT_VERSION)"',
      IPHONEOS_DEPLOYMENT_TARGET: '16.4',
      MARKETING_VERSION: '1.0',
      // The extension context is registered when this framework loads. Protocol-only
      // Swift imports do not retain it in the linked executable.
      OTHER_LDFLAGS: '"$(inherited) -Wl,-needed_framework,UserNotificationsUI"',
      PRODUCT_BUNDLE_IDENTIFIER: IOS_EXTENSION_BUNDLE_IDENTIFIER,
      PRODUCT_NAME: IOS_EXTENSION_NAME,
      SKIP_INSTALL: 'YES',
      SWIFT_VERSION: '5.0',
      TARGETED_DEVICE_FAMILY: '"1,2"',
    });
    removeUndefinedValues(project.hash.project.objects);

    return projectConfig;
  });
}

function withNativePushIosSources(config) {
  return withDangerousMod(config, [
    'ios',
    async (dangerousConfig) => {
      const iosRoot = dangerousConfig.modRequest.platformProjectRoot;
      copyDirectory(IOS_NATIVE_SOURCE_ROOT, path.join(iosRoot, IOS_EXTENSION_SOURCE_ROOT));
      return dangerousConfig;
    },
  ]);
}

function withNativePushPresentation(config) {
  const androidConfig = withNativePushSources(
    withPresentationPackage(withFirebaseMessagingDependency(withNativePushManifest(config))),
  );
  return withNativePushIosSources(withNativePushIosProject(androidConfig));
}

module.exports = withNativePushPresentation;
