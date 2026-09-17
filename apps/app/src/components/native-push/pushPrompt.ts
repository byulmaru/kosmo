type NativePushPromptAcceptOptions = {
  markPromptComplete: () => Promise<void>;
  onCompleted: () => void;
  requestPermission: () => Promise<unknown>;
  syncPermissionAndToken: () => Promise<void>;
};

/**
 * Completes the prompt only after the OS request and server token synchronization both succeed.
 * The caller keeps the prompt mounted when this rejects so the user can retry.
 */
export async function acceptNativePushPrompt({
  markPromptComplete,
  onCompleted,
  requestPermission,
  syncPermissionAndToken,
}: NativePushPromptAcceptOptions): Promise<void> {
  await requestPermission();
  await syncPermissionAndToken();
  await markPromptComplete();
  onCompleted();
}
