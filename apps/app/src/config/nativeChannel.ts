import type { NativeChannel, NativeChannelSwitchResult } from './nativeChannelCore';

export type { NativeChannel } from './nativeChannelCore';

/**
 * Native adapter fallback used by Web and Node tooling. Metro resolves the `.native` adapter for
 * iOS and Android, where this function reads the Expo Updates channel singleton.
 */
export function getNativeDeploymentChannel(): NativeChannel | null {
  return null;
}

export const switchNativeChannel: (
  targetChannel: NativeChannel,
  clearSession: () => Promise<void>,
) => Promise<NativeChannelSwitchResult> = async () => 'failed';
