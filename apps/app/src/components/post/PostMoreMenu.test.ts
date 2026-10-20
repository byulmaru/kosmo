import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { usePostMoreMenuItem as UsePostMoreMenuItemExport } from './PostMoreMenu';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const analyticsCalls: Array<[string, Record<string, unknown>]> = [];
const toastCalls: Array<[string, Record<string, unknown>]> = [];
const generationRef = { current: 0 };
let clipboardResult = true;
let deferClipboard = false;
let resolveClipboard: ((result: boolean) => void) | null = null;
let renderer: ReactTestRenderer | null = null;
let menuItem: ReturnType<typeof UsePostMoreMenuItemExport> | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('lucide-react-native', { Link2: 'Link2' });
mockModule('@/analytics/client', {
  trackAnalytics: (event: string, properties: Record<string, unknown>) => {
    analyticsCalls.push([event, properties]);
  },
});
mockModule('@/components/post/postClipboard', {
  setStringAsync: () =>
    deferClipboard
      ? new Promise<boolean>((resolve) => {
          resolveClipboard = resolve;
        })
      : Promise.resolve(clipboardResult),
});
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({
    showToast: (message: string, options: Record<string, unknown>) => {
      toastCalls.push([message, options]);
    },
  }),
});
mockModule('@/config/origin', { getPublicWebOrigin: () => 'https://kosmo.example' });
mockModule('@/relay/RelayEnvironmentBoundary', {
  useRelayEnvironmentGeneration: () => generationRef,
});

function Harness() {
  menuItem = usePostMoreMenuItem({ postId: 'post-a', relativeHandle: '@owner' });
  return createElement('Harness');
}

let usePostMoreMenuItem: typeof UsePostMoreMenuItemExport;

before(async () => {
  ({ usePostMoreMenuItem } = await import('./PostMoreMenu'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  analyticsCalls.length = 0;
  toastCalls.length = 0;
  generationRef.current = 0;
  clipboardResult = true;
  deferClipboard = false;
  resolveClipboard = null;
  menuItem = null;
});

async function renderMenu() {
  await act(async () => {
    renderer = create(createElement(Harness));
  });
  assert.ok(menuItem);
  return menuItem;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('PostMoreMenu analytics', () => {
  it('클립보드 복사 성공 뒤 post 링크를 한 번 기록한다', async () => {
    const item = await renderMenu();

    await act(async () => {
      item.onSelect();
    });
    await flush();

    assert.deepEqual(analyticsCalls, [['link_copied', { target: 'post' }]]);
    assert.deepEqual(toastCalls, [['링크를 복사했어요', { tone: 'success' }]]);
  });

  it('클립보드 실패는 추적하지 않고 오류 상태를 표시한다', async () => {
    clipboardResult = false;
    const item = await renderMenu();

    await act(async () => {
      item.onSelect();
    });
    await flush();

    assert.deepEqual(analyticsCalls, []);
    assert.deepEqual(toastCalls, [
      ['링크를 복사하지 못했습니다. 잠시 후 다시 시도해 주세요.', { tone: 'danger' }],
    ]);
  });

  it('환경 세대가 바뀐 늦은 복사 완료는 UI 성공을 유지하되 추적하지 않는다', async () => {
    deferClipboard = true;
    const item = await renderMenu();

    await act(async () => {
      item.onSelect();
      await Promise.resolve();
    });
    generationRef.current = 1;
    assert.ok(resolveClipboard);
    resolveClipboard(true);
    await flush();

    assert.deepEqual(analyticsCalls, []);
    assert.deepEqual(toastCalls, [['링크를 복사했어요', { tone: 'success' }]]);
  });
});
