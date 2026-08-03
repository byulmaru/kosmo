import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { setStringAsync } from './postClipboard.web';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function installNavigator(value: unknown): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value,
  });
}

afterEach(() => {
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', originalNavigator);
  } else {
    Reflect.deleteProperty(globalThis, 'navigator');
  }
});

describe('Web post clipboard boundary', () => {
  it('writes through the async clipboard API and confirms success', async () => {
    const values: string[] = [];
    installNavigator({ clipboard: { writeText: async (value: string) => values.push(value) } });

    assert.equal(await setStringAsync('https://kosmo.example/@alice/post-1'), true);
    assert.deepEqual(values, ['https://kosmo.example/@alice/post-1']);
  });

  it('returns false when the async clipboard API is unavailable', async () => {
    installNavigator({});

    assert.equal(await setStringAsync('unavailable'), false);
  });

  it('returns false when the async clipboard API rejects', async () => {
    let attempted = false;
    installNavigator({
      clipboard: {
        writeText: async () => {
          attempted = true;
          throw new Error('permission denied');
        },
      },
    });

    assert.equal(await setStringAsync('rejected'), false);
    assert.equal(attempted, true);
  });
});
