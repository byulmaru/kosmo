import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  experiments: {
    reactCompiler: true,
    typedRoutes: true,
  },
  ios: {
    bundleIdentifier: 'moe.kos',
  },
  android: {
    package: 'moe.kos',
  },
  name: 'kosmo',
  orientation: 'portrait',
  plugins: [
    './plugins/with-gradle-parallel-disabled.cjs',
    [
      'expo-router',
      {
        origin: process.env.EXPO_PUBLIC_ORIGIN,
        unstable_useServerRendering: true,
      },
    ],
    'expo-secure-store',
  ],
  scheme: 'kosmo',
  slug: 'kosmo',
  userInterfaceStyle: 'automatic',
  version: '1.0.0',
  web: {
    output: 'server',
  },
};

export default config;
