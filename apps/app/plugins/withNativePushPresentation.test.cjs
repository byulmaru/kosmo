/* eslint-disable @typescript-eslint/no-require-imports -- CNG plugin smoke check is CommonJS. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const xcode = require(
  require.resolve('xcode', {
    paths: [path.dirname(require.resolve('expo/config-plugins'))],
  }),
);
const plist = require(
  require.resolve('@expo/plist', {
    paths: [path.dirname(require.resolve('expo/config-plugins'))],
  }),
).default;

const plugin = require('./withNativePushPresentation');

const EXPO_MESSAGING_SERVICE = 'expo.modules.notifications.service.ExpoFirebaseMessagingService';
const RNFB_MESSAGING_SERVICE =
  'io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService';
const EXPO_NOTIFICATION_RECEIVER = 'expo.modules.notifications.service.NotificationsService';
const RNFB_NOTIFICATION_RECEIVER =
  'io.invertase.firebase.messaging.ReactNativeFirebaseMessagingReceiver';
const KOSMO_MESSAGING_SERVICE = 'moe.kos.notifications.KosmoFirebaseMessagingService';
const KOSMO_NOTIFICATION_RECEIVER = 'moe.kos.notifications.KosmoNotificationsService';

function componentName(component) {
  return component?.$?.['android:name'];
}

function manifestFixture() {
  return {
    manifest: {
      $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
      application: [
        {
          service: [
            { $: { 'android:name': EXPO_MESSAGING_SERVICE } },
            { $: { 'android:name': RNFB_MESSAGING_SERVICE } },
          ],
          receiver: [
            { $: { 'android:name': EXPO_NOTIFICATION_RECEIVER } },
            { $: { 'android:name': RNFB_NOTIFICATION_RECEIVER } },
          ],
        },
      ],
    },
  };
}

async function applyManifest(modResults) {
  const config = plugin({ _internal: { isDebug: false } });
  const result = await config.mods.android.manifest({
    modRequest: { platform: 'android', modName: 'manifest' },
    modResults,
  });
  return result.modResults;
}

async function applyMainApplication(contents) {
  const config = plugin({ _internal: { isDebug: false } });
  const result = await config.mods.android.mainApplication({
    modRequest: { platform: 'android', modName: 'mainApplication' },
    modResults: { contents },
  });
  return result.modResults.contents;
}

async function applyAppBuildGradle(contents) {
  const config = plugin({ _internal: { isDebug: false } });
  const result = await config.mods.android.appBuildGradle({
    modRequest: { platform: 'android', modName: 'appBuildGradle' },
    modResults: { contents },
  });
  return result.modResults.contents;
}

async function applyDangerousMod(platformProjectRoot) {
  const config = plugin({ _internal: { isDebug: false } });
  await config.mods.android.dangerous({
    modRequest: { platform: 'android', modName: 'dangerous', platformProjectRoot },
    modResults: {},
  });
}

async function applyXcodeProject(project) {
  const config = plugin({ _internal: { isDebug: false } });
  const result = await config.mods.ios.xcodeproj({
    modRequest: { platform: 'ios', modName: 'xcodeproj' },
    modResults: project,
  });
  return result.modResults;
}

function unquote(value) {
  return typeof value === 'string' ? value.replace(/^"|"$/g, '') : value;
}

function assertMarkedForRemoval(components, name) {
  const component = components.find((candidate) => componentName(candidate) === name);
  assert.ok(component, `expected ${name} to remain as a manifest merge removal marker`);
  assert.equal(component.$['tools:node'], 'remove');
}

async function main() {
  const firstManifest = await applyManifest(manifestFixture());
  const application = firstManifest.manifest.application[0];
  assert.equal(firstManifest.manifest.$['xmlns:tools'], 'http://schemas.android.com/tools');
  assertMarkedForRemoval(application.service, EXPO_MESSAGING_SERVICE);
  assertMarkedForRemoval(application.service, RNFB_MESSAGING_SERVICE);
  assertMarkedForRemoval(application.receiver, EXPO_NOTIFICATION_RECEIVER);
  assert.equal(
    application.receiver.filter(
      (component) => componentName(component) === RNFB_NOTIFICATION_RECEIVER,
    ).length,
    1,
  );

  assert.equal(
    application.service.filter((component) => componentName(component) === KOSMO_MESSAGING_SERVICE)
      .length,
    1,
  );
  assert.equal(
    application.receiver.filter(
      (component) => componentName(component) === KOSMO_NOTIFICATION_RECEIVER,
    ).length,
    1,
  );
  const messagingService = application.service.find(
    (component) => componentName(component) === KOSMO_MESSAGING_SERVICE,
  );
  assert.equal(
    messagingService['intent-filter'][0].action[0].$['android:name'],
    'com.google.firebase.MESSAGING_EVENT',
  );
  const notificationReceiver = application.receiver.find(
    (component) => componentName(component) === KOSMO_NOTIFICATION_RECEIVER,
  );
  const actions = notificationReceiver['intent-filter'][0].action.map(
    (action) => action.$['android:name'],
  );
  assert.ok(actions.includes('expo.modules.notifications.NOTIFICATION_EVENT'));
  assert.ok(actions.includes('android.intent.action.BOOT_COMPLETED'));

  const secondManifest = await applyManifest(structuredClone(firstManifest));
  assert.deepEqual(secondManifest, firstManifest, 'manifest transform must be idempotent');

  const kotlinMainApplication = `package moe.kos

import android.app.Application

class MainApplication : Application() {
  override fun onCreate() {
    PackageList(this).packages.apply {
      add(SomeExistingPackage())
    }
  }
}
`;
  const transformedKotlin = await applyMainApplication(kotlinMainApplication);
  assert.equal(
    transformedKotlin.match(/import moe\.kos\.notifications\.KosmoPushPresentationPackage/g)
      ?.length,
    1,
  );
  assert.equal(transformedKotlin.match(/add\(KosmoPushPresentationPackage\(\)\)/g)?.length, 1);
  assert.equal(
    await applyMainApplication(transformedKotlin),
    transformedKotlin,
    'Kotlin transform must be idempotent',
  );

  const javaMainApplication = `package moe.kos;

import android.app.Application;
import java.util.List;
import com.facebook.react.ReactPackage;

public class MainApplication extends Application {
  protected List<ReactPackage> getPackages() {
    List<ReactPackage> packages = new PackageList(this).getPackages();
    return packages;
  }
}
`;
  const transformedJava = await applyMainApplication(javaMainApplication);
  assert.equal(
    transformedJava.match(/import moe\.kos\.notifications\.KosmoPushPresentationPackage;/g)?.length,
    1,
  );
  assert.equal(
    transformedJava.match(/packages\.add\(new KosmoPushPresentationPackage\(\)\);/g)?.length,
    1,
  );
  assert.equal(
    await applyMainApplication(transformedJava),
    transformedJava,
    'Java transform must be idempotent',
  );

  const appBuildGradle = `android {\n  namespace 'moe.kos'\n}\n\ndependencies {\n  implementation('com.facebook.react:react-android')\n}\n`;
  const transformedBuildGradle = await applyAppBuildGradle(appBuildGradle);
  assert.equal(
    transformedBuildGradle.match(
      /implementation "com\.google\.firebase:firebase-messaging:25\.0\.1"/g,
    )?.length,
    1,
  );
  assert.equal(
    await applyAppBuildGradle(transformedBuildGradle),
    transformedBuildGradle,
    'app Gradle dependency transform must be idempotent',
  );

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmo-native-push-'));
  try {
    await applyDangerousMod(tempRoot);
    const generatedJavaRoot = path.join(
      tempRoot,
      'app',
      'src',
      'main',
      'java',
      'moe',
      'kos',
      'notifications',
    );
    const generatedResRoot = path.join(tempRoot, 'app', 'src', 'main', 'res', 'layout');
    assert.ok(fs.existsSync(path.join(generatedJavaRoot, 'KosmoFirebaseMessagingService.kt')));
    assert.ok(fs.existsSync(path.join(generatedJavaRoot, 'KosmoPushPresentationModule.kt')));
    assert.ok(fs.existsSync(path.join(generatedResRoot, 'kosmo_push_notification_collapsed.xml')));
    const firstResource = fs.readFileSync(
      path.join(generatedResRoot, 'kosmo_push_notification_expanded.xml'),
      'utf8',
    );
    await applyDangerousMod(tempRoot);
    assert.equal(
      fs.readFileSync(path.join(generatedResRoot, 'kosmo_push_notification_expanded.xml'), 'utf8'),
      firstResource,
      'native source generation must be stable on repeated prebuild runs',
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  const fixturePath = path.join(__dirname, '__fixtures__', 'Kosmo.xcodeproj', 'project.pbxproj');
  const xcodeProject = xcode.project(fixturePath);
  xcodeProject.parseSync();
  const transformedProject = await applyXcodeProject(xcodeProject);
  const extensionTargetEntry = Object.entries(transformedProject.pbxNativeTargetSection()).find(
    ([key, target]) => !key.endsWith('_comment') && unquote(target.name) === 'KosmoPushContent',
  );
  assert.ok(extensionTargetEntry, 'iOS content extension target must be present');
  const [extensionTargetUuid, extensionTarget] = extensionTargetEntry;
  assert.equal(extensionTarget.productType, '"com.apple.product-type.app-extension"');
  const buildConfigurations = transformedProject
    .pbxXCConfigurationList()
    [
      extensionTarget.buildConfigurationList
    ].buildConfigurations.map(({ value }) => transformedProject.pbxXCBuildConfigurationSection()[value].buildSettings);
  for (const settings of buildConfigurations) {
    assert.equal(unquote(settings.PRODUCT_BUNDLE_IDENTIFIER), 'moe.kos.push-content');
    assert.equal(settings.CURRENT_PROJECT_VERSION, '1');
    assert.equal(settings.GENERATE_INFOPLIST_FILE, 'YES');
    assert.equal(unquote(settings.INFOPLIST_FILE), 'KosmoPushContent/KosmoPushContent-Info.plist');
    assert.equal(settings.INFOPLIST_KEY_CFBundleDisplayName, 'KosmoPushContent');
    assert.equal(unquote(settings.INFOPLIST_KEY_CFBundlePackageType), 'XPC!');
    assert.equal(
      unquote(settings.INFOPLIST_KEY_CFBundleShortVersionString),
      '$(MARKETING_VERSION)',
    );
    assert.equal(unquote(settings.INFOPLIST_KEY_CFBundleVersion), '$(CURRENT_PROJECT_VERSION)');
    assert.equal(settings.IPHONEOS_DEPLOYMENT_TARGET, '16.4');
    assert.equal(settings.APPLICATION_EXTENSION_API_ONLY, 'YES');
    assert.equal(
      unquote(settings.OTHER_LDFLAGS),
      '$(inherited) -Wl,-needed_framework,UserNotificationsUI',
    );
    assert.equal(settings.MARKETING_VERSION, '1.0');
    assert.equal(unquote(settings.PRODUCT_NAME), 'KosmoPushContent');
  }

  const sourceFileReferenceEntry = Object.entries(
    transformedProject.pbxFileReferenceSection(),
  ).find(
    ([key, file]) =>
      !key.endsWith('_comment') && unquote(file.path) === 'NotificationViewController.swift',
  );
  assert.ok(sourceFileReferenceEntry, 'extension source file reference must be present');
  const [sourceFileReferenceUuid] = sourceFileReferenceEntry;
  const sourceBuildFileEntry = Object.entries(transformedProject.pbxBuildFileSection()).find(
    ([key, buildFile]) =>
      !key.endsWith('_comment') && buildFile.fileRef === sourceFileReferenceUuid,
  );
  assert.ok(sourceBuildFileEntry, 'extension source build file must be present');
  const sourcesPhase = transformedProject.pbxSourcesBuildPhaseObj(extensionTargetUuid);
  assert.ok(
    sourcesPhase.files.some(({ value }) => value === sourceBuildFileEntry[0]),
    'extension source must be connected to its own Sources phase',
  );

  const hostTargetUuid = transformedProject.getFirstTarget().uuid;
  const extensionProductBuildFile = Object.entries(transformedProject.pbxBuildFileSection()).find(
    ([key, buildFile]) =>
      !key.endsWith('_comment') && buildFile.fileRef === extensionTarget.productReference,
  );
  assert.ok(extensionProductBuildFile, 'extension product build file must be present');
  const hostCopyFiles = transformedProject.pbxCopyfilesBuildPhaseObj(hostTargetUuid);
  assert.ok(
    hostCopyFiles.files.some(({ value }) => value === extensionProductBuildFile[0]),
    'host target must embed the extension product',
  );
  const targetDependencies = transformedProject.hash.project.objects.PBXTargetDependency;
  assert.ok(
    Object.values(targetDependencies).some(
      (dependency) => dependency.target === extensionTargetUuid,
    ),
    'host target must depend on the extension target',
  );

  const infoPlist = plist.parse(
    fs.readFileSync(
      path.join(__dirname, 'native-push', 'ios', 'KosmoPushContent-Info.plist'),
      'utf8',
    ),
  );
  assert.deepEqual(
    {
      CFBundleDisplayName: infoPlist.CFBundleDisplayName,
      CFBundleExecutable: infoPlist.CFBundleExecutable,
      CFBundleIdentifier: infoPlist.CFBundleIdentifier,
      CFBundleName: infoPlist.CFBundleName,
      CFBundlePackageType: infoPlist.CFBundlePackageType,
      CFBundleShortVersionString: infoPlist.CFBundleShortVersionString,
      CFBundleVersion: infoPlist.CFBundleVersion,
    },
    {
      CFBundleDisplayName: '$(PRODUCT_NAME)',
      CFBundleExecutable: '$(EXECUTABLE_NAME)',
      CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
      CFBundleName: '$(PRODUCT_NAME)',
      CFBundlePackageType: 'XPC!',
      CFBundleShortVersionString: '$(MARKETING_VERSION)',
      CFBundleVersion: '$(CURRENT_PROJECT_VERSION)',
    },
  );
  assert.deepEqual(
    {
      ...infoPlist.NSExtension,
      NSExtensionAttributes: { ...infoPlist.NSExtension.NSExtensionAttributes },
    },
    {
      NSExtensionPointIdentifier: 'com.apple.usernotifications.content-extension',
      NSExtensionPrincipalClass: '$(PRODUCT_MODULE_NAME).NotificationViewController',
      NSExtensionAttributes: {
        UNNotificationExtensionCategory: 'KOSMO_PUSH_PRESENTATION_V1',
        UNNotificationExtensionDefaultContentHidden: true,
        UNNotificationExtensionInitialContentSizeRatio: 0.5,
      },
    },
  );

  const firstProjectOutput = transformedProject.writeSync();
  const secondProjectOutput = await applyXcodeProject(transformedProject);
  assert.equal(
    secondProjectOutput.writeSync(),
    firstProjectOutput,
    'iOS Xcode transform must be idempotent',
  );

  console.log('Native push config plugin behavior checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
