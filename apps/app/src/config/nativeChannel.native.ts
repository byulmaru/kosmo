import * as Updates from 'expo-updates';
import { isNativeChannel, switchNativeChannelWithClient } from './nativeChannelCore';
import type { NativeChannel, NativeChannelSwitchResult } from './nativeChannelCore';

function isDevelopmentRuntime(): boolean {
  return (globalThis as typeof globalThis & { __DEV__?: unknown }).__DEV__ === true;
}

/**
 * Expo Updates exposes the active request header as a module-evaluation singleton. A development
 * client has no configured channel, so retain the existing dev fallback until a release-like
 * binary supplies the declared prod header.
 */
export function getNativeDeploymentChannel(): NativeChannel {
  if (isNativeChannel(Updates.channel)) {
    return Updates.channel;
  }

  if (Updates.channel !== null && Updates.channel !== '') {
    throw new Error('A valid native update channel (dev or prod) is required.');
  }

  return isDevelopmentRuntime() ? 'dev' : 'prod';
}

export function switchNativeChannel(
  targetChannel: NativeChannel,
  clearSession: () => Promise<void>,
): Promise<NativeChannelSwitchResult> {
  return switchNativeChannelWithClient(targetChannel, clearSession, {
    channel: getNativeDeploymentChannel(),
    fetchUpdateAsync: Updates.fetchUpdateAsync,
    reloadAsync: Updates.reloadAsync,
    setUpdateRequestHeadersOverride: Updates.setUpdateRequestHeadersOverride,
  });
}
