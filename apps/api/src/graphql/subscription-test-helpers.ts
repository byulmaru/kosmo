import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

export async function waitForSubscriberCount(
  readCount: () => Promise<number>,
  count: number,
): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    if ((await readCount()) === count) {
      return;
    }
    await delay(25);
  }
  assert.equal(await readCount(), count);
}

export function createSseEventReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = '';

  return async function readEvent(): Promise<string | null> {
    while (true) {
      const separator = buffer.indexOf('\n\n');
      if (separator >= 0) {
        const event = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        if (event.trim() !== '' && !event.startsWith(':')) {
          return event;
        }
        continue;
      }

      const result = await reader.read();
      if (result.done) {
        return null;
      }
      buffer += decoder.decode(result.value, { stream: true }).replaceAll('\r\n', '\n');
    }
  };
}

export function getSseData(event: string | null): unknown {
  assert.ok(event);
  const data = event
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart())
    .join('\n');
  return JSON.parse(data);
}

export async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), 5_000);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
