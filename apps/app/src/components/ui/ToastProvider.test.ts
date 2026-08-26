import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as ToastProviderModule from './ToastProvider';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let entered = false;
let platformOS: 'android' | 'ios' | 'web' = 'web';
const PressableHost = 'Pressable' as unknown as ElementType;
const TextHost = 'Text' as unknown as ElementType;
const ViewHost = 'View' as unknown as ElementType;

function flattenStyle(style: unknown) {
  return Object.assign({}, ...(Array.isArray(style) ? style : [style]).filter(Boolean));
}

mockModule('react-native', {
  Animated: { View: 'AnimatedView' },
  Platform: {
    get OS() {
      return platformOS;
    },
  },
  Pressable: PressableHost,
  StyleSheet: { absoluteFill: {}, create: <T>(styles: T) => styles },
  Text: 'Text',
  useWindowDimensions: () => ({ width: 1400 }),
  View: 'View',
});
mockModule('react-native-safe-area-context', { useSafeAreaInsets: () => ({ bottom: 0 }) });
mockModule('@/theme/ThemeProvider', {
  useElevation: () => ({ floating: {} }),
  useTheme: () => ({
    backgroundInverse: 'inverse-background',
    feedbackDangerBase: 'danger-base',
    feedbackDangerBorder: 'danger-border',
    feedbackDangerOnSubtle: 'danger-on-subtle',
    feedbackDangerSubtle: 'danger-subtle',
    feedbackInfoBase: 'info-base',
    feedbackInfoBorder: 'info-border',
    feedbackInfoOnSubtle: 'info-on-subtle',
    feedbackInfoSubtle: 'info-subtle',
    feedbackSuccessBase: 'success-base',
    feedbackSuccessBorder: 'success-border',
    feedbackSuccessOnSubtle: 'success-on-subtle',
    feedbackSuccessSubtle: 'success-subtle',
    feedbackWarningBase: 'warning-base',
    feedbackWarningBorder: 'warning-border',
    feedbackWarningOnSubtle: 'warning-on-subtle',
    feedbackWarningSubtle: 'warning-subtle',
    foregroundInverse: 'inverse-foreground',
  }),
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

test('toast maps the inverse default and subtle feedback tone rails', async () => {
  assert.ok(toastProviderModule);
  const { ToastProvider, useToast } = toastProviderModule;
  let api: ReturnType<typeof useToast> | undefined;
  function Harness() {
    api = useToast();
    return null;
  }

  const cases = [
    {
      background: 'inverse-background',
      border: undefined,
      foreground: 'inverse-foreground',
      tone: undefined,
    },
    {
      background: 'info-subtle',
      border: 'info-base',
      foreground: 'info-on-subtle',
      tone: 'info' as const,
    },
    {
      background: 'success-subtle',
      border: 'success-base',
      foreground: 'success-on-subtle',
      tone: 'success' as const,
    },
    {
      background: 'warning-subtle',
      border: 'warning-base',
      foreground: 'warning-on-subtle',
      tone: 'warning' as const,
    },
    {
      background: 'danger-subtle',
      border: 'danger-base',
      foreground: 'danger-on-subtle',
      tone: 'danger' as const,
    },
  ] as const;

  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(ToastProvider, null, createElement(Harness)));
  });
  for (const sample of cases) {
    await act(async () => {
      api?.showToast('알림', sample.tone ? { tone: sample.tone } : undefined);
    });
    const surface = renderer?.root.findByType(ViewHost);
    const style = flattenStyle(surface?.props.style);
    assert.equal(style.backgroundColor, sample.background);
    assert.equal(style.paddingVertical, 12);
    const message = renderer?.root.findByType(TextHost);
    assert.equal(flattenStyle(message?.props.style).color, sample.foreground);
    assert.equal(style.borderLeftWidth, sample.tone ? 4 : undefined);
    assert.equal(style.borderLeftColor, sample.border);
  }
  await act(async () => renderer?.unmount());
});

test('action toast follows the Figma source auto-layout contract', async () => {
  assert.ok(toastProviderModule);
  const { ToastProvider, useToast } = toastProviderModule;
  let api: ReturnType<typeof useToast> | undefined;
  function Harness() {
    api = useToast();
    return null;
  }

  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(ToastProvider, null, createElement(Harness)));
  });
  await act(async () => {
    api?.showToast('위험 알림', {
      action: { label: '다시 시도', onPress: () => undefined },
      tone: 'danger',
    });
  });

  const surface = renderer?.root.findByType(ViewHost);
  const message = renderer?.root
    .findAllByType(TextHost)
    .find((node) => node.children.includes('위험 알림'));
  const action = renderer?.root
    .findAllByType(PressableHost)
    .find((node) => node.props.accessibilityRole === 'button');
  assert.ok(message);
  assert.ok(action);
  const actionLabel = action.findByType(TextHost);
  const surfaceStyle = flattenStyle(surface?.props.style);
  const messageStyle = flattenStyle(message.props.style);
  const actionLabelStyle = flattenStyle(actionLabel.props.style);

  assert.deepEqual(
    {
      actionTextDecorationLine: actionLabelStyle.textDecorationLine,
      messageFlex: messageStyle.flex,
      messageTransform: messageStyle.transform,
      surfaceMaxWidth: surfaceStyle.maxWidth,
      surfaceWidth: surfaceStyle.width,
    },
    {
      actionTextDecorationLine: undefined,
      messageFlex: 1,
      messageTransform: undefined,
      surfaceMaxWidth: 360,
      surfaceWidth: '100%',
    },
  );

  await act(async () => renderer?.unmount());
});

test('action toast keeps a 44px target and adds only Android 2px hitSlop', async () => {
  assert.ok(toastProviderModule);
  const { ToastProvider, useToast } = toastProviderModule;
  let api: ReturnType<typeof useToast> | undefined;
  function Harness() {
    api = useToast();
    return null;
  }

  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(ToastProvider, null, createElement(Harness)));
  });

  const showActionToast = async () => {
    await act(async () => {
      api?.showToast('다시 시도해 주세요.', {
        action: { label: '다시 시도', onPress: () => undefined },
      });
    });
  };

  for (const [nextPlatform, expectedHitSlop] of [
    ['web', undefined],
    ['ios', undefined],
    ['android', 2],
  ] as const) {
    platformOS = nextPlatform;
    await showActionToast();
    const surface = renderer?.root.findByType(ViewHost);
    assert.equal(flattenStyle(surface?.props.style).paddingVertical, 4);
    const action = renderer?.root
      .findAllByType(PressableHost)
      .find((node) => node.props.accessibilityRole === 'button');
    assert.ok(action);
    const actionStyle = flattenStyle(action.props.style);
    assert.equal(actionStyle.alignItems, 'center');
    assert.equal(actionStyle.justifyContent, 'center');
    assert.equal(actionStyle.minHeight, 44);
    assert.equal(actionStyle.minWidth, 44);
    assert.equal(action.props.hitSlop, expectedHitSlop);
  }
  await act(async () => renderer?.unmount());
  platformOS = 'web';
});
