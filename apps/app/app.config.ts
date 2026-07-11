import type { ExpoConfig } from 'expo/config';

const publicEnvironmentAliases = {
  EXPO_PUBLIC_OIDC_CLIENT_ID: 'PUBLIC_OIDC_CLIENT_ID',
  EXPO_PUBLIC_OIDC_ISSUER: 'PUBLIC_OIDC_ISSUER',
  EXPO_PUBLIC_WEB_ORIGIN: 'PUBLIC_ORIGIN',
} as const;

for (const [expoName, existingName] of Object.entries(publicEnvironmentAliases)) {
  process.env[expoName] ??= process.env[existingName];
}

const config: ExpoConfig = {
  name: 'Kosmo',
  slug: 'kosmo',
  version: '0.0.1',
  scheme: 'kosmo',
  orientation: 'default',
  userInterfaceStyle: 'light',
  ios: {
    buildNumber: '1',
    bundleIdentifier: 'moe.kos',
    supportsTablet: true,
    infoPlist: {
      LSApplicationCategoryType: 'public.app-category.social-networking',
    },
  },
  android: {
    package: 'moe.kos',
    versionCode: 1,
    predictiveBackGestureEnabled: true,
  },
  web: {
    output: 'single',
  },
  plugins: ['expo-router', 'expo-secure-store'],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
