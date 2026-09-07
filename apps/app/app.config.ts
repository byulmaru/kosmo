import type { ExpoConfig } from 'expo/config';

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
  userInterfaceStyle: 'light',
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
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#FEFEFE',
      foregroundImage: './assets/brand/app-icon-android-foreground.png',
    },
    package: 'moe.kos',
    versionCode: androidVersionCode(),
    predictiveBackGestureEnabled: true,
  },
  web: {
    favicon: './public/favicon-32x32.png',
    output: 'single',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
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
