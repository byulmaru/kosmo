import * as Updates from 'expo-updates';
import type { NativeChannel } from './nativeChannel';

/**
 * Expo Updates exposes the active request header as a module-evaluation singleton. A development
 * client has no configured channel, so retain the existing dev fallback until a release-like
 * binary supplies the declared prod header.
 */
export function getNativeDeploymentChannel(): NativeChannel {
  const channel = Updates.channel;
  if (channel === 'dev' || channel === 'prod') {
    return channel;
  }

  if (channel !== null && channel !== '') {
    throw new Error('A valid native update channel (dev or prod) is required.');
  }

  return (globalThis as typeof globalThis & { __DEV__?: unknown }).__DEV__ === true
    ? 'dev'
    : 'prod';
}

export async function switchNativeChannel(
  targetChannel: NativeChannel,
  clearSession: () => Promise<void>,
) {
  const currentChannel = getNativeDeploymentChannel();
  if (currentChannel === targetChannel) {
    return 'unchanged' as const;
  }

  let targetOverrideApplied = false;

  try {
    Updates.setUpdateRequestHeadersOverride({ 'expo-channel-name': targetChannel });
    targetOverrideApplied = true;

    if (!(await Updates.fetchUpdateAsync()).isNew) {
      throw new Error('The selected native channel has no compatible update.');
    }

    await clearSession();
    await Updates.reloadAsync();
    return 'reloading' as const;
  } catch {
    if (targetOverrideApplied) {
      try {
        Updates.setUpdateRequestHeadersOverride({ 'expo-channel-name': currentChannel });
      } catch {
        // The original process is still running; there is no useful local recovery action when the
        // native override itself cannot be restored.
      }
    }

    return 'failed' as const;
  }
}
