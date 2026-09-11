import type { DeploymentChannel } from './public';

export const NATIVE_CHANNEL_HEADER = 'expo-channel-name';

export type NativeChannel = DeploymentChannel;

export type NativeChannelSwitchResult = 'failed' | 'reloading' | 'unchanged';

export type NativeUpdatesClient = {
  channel: NativeChannel;
  fetchUpdateAsync: () => Promise<{ isNew: boolean }>;
  reloadAsync: () => Promise<void>;
  setUpdateRequestHeadersOverride: (requestHeaders: Record<string, string> | null) => void;
};

export function isNativeChannel(value: unknown): value is NativeChannel {
  return value === 'dev' || value === 'prod';
}

/**
 * Downloads and applies a channel update while keeping the current channel as the recovery
 * target. Expo Updates verifies runtime compatibility, the code signature, and asset hashes before
 * reporting a new update, so a non-new result is treated as a failed switch.
 */
export async function switchNativeChannelWithClient(
  targetChannel: NativeChannel,
  clearSession: () => Promise<void>,
  updates: NativeUpdatesClient,
): Promise<NativeChannelSwitchResult> {
  const currentChannel = updates.channel;

  if (!isNativeChannel(currentChannel) || currentChannel === targetChannel) {
    return currentChannel === targetChannel ? 'unchanged' : 'failed';
  }

  let targetOverrideApplied = false;

  try {
    updates.setUpdateRequestHeadersOverride({
      [NATIVE_CHANNEL_HEADER]: targetChannel,
    });
    targetOverrideApplied = true;

    const result = await updates.fetchUpdateAsync();
    if (!result.isNew) {
      throw new Error('The selected native channel has no compatible update.');
    }

    // The old credential is bound to its API/OIDC configuration. Remove it before the reload so
    // the next process starts with the selected channel and must authenticate again there.
    await clearSession();
    await updates.reloadAsync();
    return 'reloading';
  } catch {
    if (targetOverrideApplied) {
      try {
        updates.setUpdateRequestHeadersOverride({
          [NATIVE_CHANNEL_HEADER]: currentChannel,
        });
      } catch {
        // The original process is still running; there is no useful local recovery action when the
        // native override itself cannot be restored.
      }
    }

    return 'failed';
  }
}
