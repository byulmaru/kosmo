import type { ExpoConfig } from 'expo/config';

const otaBaseUrl = 'https://expo-ota.byulmaru.co/releases/kosmo-native';
const googleServicesJson = process.env.KOSMO_ANDROID_GOOGLE_SERVICES_FILE;
const googleServiceInfoPlist = process.env.KOSMO_IOS_GOOGLE_SERVICES_FILE;
// Temporary Android workaround: expo-font 56 ignores requested weights for runtime-loaded variable fonts (SUIT defaults to 100).
// Upstream fix: https://github.com/expo/expo/pull/48129
// Remove this list and the Android expo-font plugin config after upgrading to an Expo SDK with the fix (expo-font >=58.0.0)
// and verifying runtime-loaded SUIT/Pretendard weights in a new Android build without this registration.
// Keep the existing useFonts fallback until then.
const staticFontFaces = [
  [400, 'Regular'],
  [600, 'SemiBold'],
  [700, 'Bold'],
  [800, 'ExtraBold'],
] as const;

function androidVersionCode(): number {
  const configured = process.env.KOSMO_ANDROID_VERSION_CODE;
  if (configured === undefined) {
    return 1;
  }

  if (!/^[1-9]\d*$/.test(configured)) {
    throw new Error('KOSMO_ANDROID_VERSION_CODE must be a positive integer.');
  }

  const versionCode = Number(configured);
  if (!Number.isSafeInteger(versionCode) || versionCode > 2_147_483_647) {
    throw new Error('KOSMO_ANDROID_VERSION_CODE is outside Android versionCode limits.');
  }

  return versionCode;
}

const iosBuildNumber = process.env.IOS_BUILD_NUMBER ?? '1';

if (!/^[1-9]\d*$/.test(iosBuildNumber)) {
  throw new Error('IOS_BUILD_NUMBER must be a positive integer.');
}

const config: ExpoConfig = {
  name: 'Kosmo',
  slug: 'kosmo',
  version: '0.0.1',
  scheme: 'kosmo',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  icon: './assets/brand/app-icon-ios-light.png',
  ios: {
    appleTeamId: process.env.APPLE_DEVELOPER_TEAM_ID,
    buildNumber: iosBuildNumber,
    bundleIdentifier: 'moe.kos',
    config: {
      usesNonExemptEncryption: false,
    },
    icon: './assets/brand/app-icon-ios-light.png',
    supportsTablet: true,
    infoPlist: {
      LSApplicationCategoryType: 'public.app-category.social-networking',
    },
    ...(googleServiceInfoPlist ? { googleServicesFile: googleServiceInfoPlist } : {}),
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#FEFEFE',
      foregroundImage: './assets/brand/app-icon-android-foreground.png',
    },
    package: 'moe.kos',
    versionCode: androidVersionCode(),
    predictiveBackGestureEnabled: true,
    ...(googleServicesJson ? { googleServicesFile: googleServicesJson } : {}),
  },
  web: {
    favicon: './public/favicon-32x32.png',
    output: 'single',
  },
  runtimeVersion: '0.4',
  updates: {
    checkAutomatically: 'ON_LOAD',
    codeSigningCertificate: './certs/certificate.pem',
    codeSigningMetadata: {
      alg: 'rsa-v1_5-sha256',
      keyid: '2026-09',
    },
    enabled: true,
    requestHeaders: { 'expo-channel-name': 'prod' },
    url: otaBaseUrl,
  },
  plugins: [
    'expo-router',
    [
      'expo-font',
      {
        android: {
          fonts: [
            {
              fontFamily: 'SUIT Variable',
              fontDefinitions: staticFontFaces.map(([weight, face]) => ({
                path: `@sun-typeface/suit/fonts/static/ttf/SUIT-${face}.ttf`,
                weight,
              })),
            },
            {
              fontFamily: 'Pretendard Variable',
              fontDefinitions: staticFontFaces.map(([weight, face]) => ({
                path: `pretendard/dist/public/static/Pretendard-${face}.otf`,
                weight,
              })),
            },
          ],
        },
      },
    ],
    'expo-secure-store',
    'expo-notifications',
    // RNFirebase SPM is incompatible with static frameworks; use CocoaPods for static RNFB linkage.
    [
      '@react-native-firebase/app',
      {
        ios: {
          disableSPM: true,
        },
      },
    ],
    '@react-native-firebase/messaging',
    [
      'expo-build-properties',
      {
        ios: {
          useFrameworks: 'static',
          forceStaticLinking: ['RNFBApp', 'RNFBMessaging'],
        },
      },
    ],
    './plugins/withIosResourceBundleDeploymentTarget',
    [
      '@sentry/react-native/expo',
      {
        experimental_android: {
          enableAndroidGradlePlugin: true,
        },
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
      },
    ],
    [
      'expo-image-picker',
      {
        cameraPermission: false,
        microphonePermission: false,
        photosPermission: '게시물에 추가할 이미지를 선택하려면 사진 접근 권한이 필요합니다.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
