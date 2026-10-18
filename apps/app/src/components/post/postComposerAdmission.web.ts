/**
 * The caller creates this immediately before the first request. Web Crypto
 * provides the same UUID v4 primitive without pulling Expo's native module
 * bridge into the browser bundle.
 */
export function createPostComposerAdmissionId(): string {
  return `${Date.now()}:${globalThis.crypto.randomUUID()}`;
}
