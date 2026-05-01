import { stack } from '@kosmo/core';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const graphqlPath = '/graphql';
const localApiPort = '3000';

function getDevServerHostname() {
  const hostUri = Constants.expoConfig?.hostUri;

  if (!hostUri) {
    return undefined;
  }

  return new URL(`http://${hostUri}`).hostname;
}

export const graphqlUrl = resolveGraphqlUrl();

function resolveGraphqlUrl() {
  if (Platform.OS === 'web') {
    return graphqlPath;
  }

  if (stack === 'local') {
    const hostname = getDevServerHostname();

    if (hostname) {
      return new URL(graphqlPath, `http://${hostname}:${localApiPort}`).toString();
    }
  }

  if (process.env.EXPO_PUBLIC_API_ORIGIN) {
    return new URL(graphqlPath, process.env.EXPO_PUBLIC_API_ORIGIN).toString();
  }

  throw new Error('EXPO_PUBLIC_API_ORIGIN is required on native builds');
}
