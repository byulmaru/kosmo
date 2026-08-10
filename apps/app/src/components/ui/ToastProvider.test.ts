import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as ToastProviderModule from './ToastProvider';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let entered = false;

mockModule('react-native', {
  Animated: { View: 'AnimatedView' },
  Platform: { OS: 'web' },
  Pressable: 'Pressable',
  StyleSheet: { absoluteFill: {}, create: <T>(styles: T) => styles },
  Text: 'Text',
  useWindowDimensions: () => ({ width: 1400 }),
  View: 'View',
});
mockModule('react-native-safe-area-context', { useSafeAreaInsets: () => ({ bottom: 0 }) });
mockModule('@/theme/ThemeProvider', {
  useElevation: () => ({ floating: {} }),
  useTheme: () => ({ accent: 'accent', background: 'background' }),
});
mockModule('@/theme/tokens', {
  breakpoints: { compact: 768 },
  radius: { 12: 12 },
  space: { 4: 4, 8: 8, 12: 12, 16: 16 },
  textStyles: { uiCopyM: {}, uiLabelM: {} },
});
mockModule('@/theme/useOverlayMotion', {
  useToastMotion: (visible: boolean) => ({
    entered: visible && entered,
    mounted: visible,
    progress: { interpolate: () => 0 },
  }),
});

let toastProviderModule: typeof ToastProviderModule | undefined;

before(async () => {
  toastProviderModule = await import('./ToastProvider');
});

test('toast dwell timer starts after its enter motion finishes', async () => {
  assert.ok(toastProviderModule);
  const { ToastProvider, useToast } = toastProviderModule;
  const delays: number[] = [];
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = ((_: TimerHandler, delay?: number) => {
    delays.push(delay ?? 0);
    return delays.length as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;

  let api: ReturnType<typeof useToast> | undefined;
  function Harness() {
    api = useToast();
    return null;
  }

  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(createElement(ToastProvider, null, createElement(Harness)));
    });
    await act(async () => {
      api?.showToast('저장했습니다.');
    });
    assert.deepEqual(delays, []);

    entered = true;
    await act(async () =>
      renderer?.update(createElement(ToastProvider, null, createElement(Harness))),
    );
    assert.deepEqual(delays, [3000]);
  } finally {
    await act(async () => renderer?.unmount());
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    entered = false;
  }
});
