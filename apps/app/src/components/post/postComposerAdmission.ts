import { randomUUID } from 'expo-crypto';

/**
 * A Quote admission is created immediately before the first request for one
 * logical composer attempt. The server uses the timestamp prefix to enforce
 * the first-start window and the UUID suffix for
 * uniqueness across retries and reconnects.
 */
export function createPostComposerAdmissionId(): string {
  return `${Date.now()}:${randomUUID()}`;
}
