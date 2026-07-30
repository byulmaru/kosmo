import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const clipboardModule = new URL('./clipboard.ts', import.meta.url).href;

afterEach(() => mock.restoreAll());

describe('기본 clipboard adapter', () => {
  it('expo-clipboard에 화면의 ID를 그대로 전달한다', async () => {
    const setStringAsync = mock.fn(async () => undefined);
    mock.module('expo-clipboard', {
      namedExports: { setStringAsync },
    } as unknown as Parameters<typeof mock.module>[1]);

    const { copyToClipboard } = await import(`${clipboardModule}?success`);

    assert.equal(await copyToClipboard('event-default'), true);
    assert.equal(setStringAsync.mock.callCount(), 1);
    assert.deepEqual(setStringAsync.mock.calls[0].arguments, ['event-default']);
  });

  it('clipboard 오류를 실패 결과로 안전하게 변환한다', async () => {
    const setStringAsync = mock.fn(async () => {
      throw new Error('clipboard unavailable');
    });
    mock.module('expo-clipboard', {
      namedExports: { setStringAsync },
    } as unknown as Parameters<typeof mock.module>[1]);

    const { copyToClipboard } = await import(`${clipboardModule}?failure`);

    assert.equal(await copyToClipboard('event-failure'), false);
  });
});
