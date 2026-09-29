import type { AnalyticsCaptureOptions } from './events';

function createUuid(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function createAnalyticsCaptureOptions(
  accountId: string,
  timestamp = new Date(),
  uuid = createUuid(),
): AnalyticsCaptureOptions {
  return { accountId, timestamp, uuid };
}
