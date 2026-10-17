import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement, useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as ToastProviderModule from './ToastProvider';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let reducedMotion = false;
let holdEnterAnimation = false;
let holdExitAnimation = false;
let pendingEnter: ((result: { finished: boolean }) => void) | undefined;
let pendingExit: ((result: { finished: boolean }) => void) | undefined;
let platformOS: 'android' | 'ios' | 'web' = 'web';
let windowWidth = 1400;
const PressableHost = 'Pressable' as unknown as ElementType;
const TextHost = 'Text' as unknown as ElementType;
const ViewHost = 'View' as unknown as ElementType;

class AnimatedValue {
  constructor(public value: number) {}

  setValue(value: number) {
    this.value = value;
  }

  interpolate() {
    return 0;
  }
}

function controlledTiming(value: AnimatedValue, config: Readonly<{ toValue: number }>) {
  return {
    start(callback?: (result: { finished: boolean }) => void) {
      value.setValue(config.toValue);
      if (config.toValue === 1 && holdEnterAnimation) {
        pendingEnter = callback;
      } else if (config.toValue === 0 && holdExitAnimation) {
        pendingExit = callback;
      } else {
        callback?.({ finished: true });
      }
    },
    stop() {
      pendingEnter = undefined;
      pendingExit = undefined;
    },
  };
}

function flattenStyle(style: unknown) {
  return Object.assign({}, ...(Array.isArray(style) ? style : [style]).filter(Boolean));
}

mockModule('react-native', {
  Animated: { Value: AnimatedValue, View: 'AnimatedView', timing: controlledTiming },
  Easing: { bezier: (...points: number[]) => points.join(',') },
  Platform: {
    get OS() {
      return platformOS;
    },
  },
  Pressable: PressableHost,
  StyleSheet: { absoluteFill: {}, create: <T>(styles: T) => styles },
  Text: 'Text',
  useWindowDimensions: () => ({ width: windowWidth }),
  View: 'View',
});
mockModule('react-native-safe-area-context', { useSafeAreaInsets: () => ({ bottom: 0 }) });
mockModule('@/theme/ThemeProvider', {
  useReducedMotion: () => reducedMotion,
  useElevation: () => ({ floating: {} }),
  useTheme: () => ({
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
  }),
});
mockModule('@/theme/tokens', {
  breakpoints: { compact: 768 },
  radius: { 12: 12 },
  space: { 4: 4, 8: 8, 12: 12, 16: 16 },
  textStyles: { uiCopyM: {}, uiLabelM: {} },
  motion: {
    duration: { emphasized: 360, fast: 120, standard: 200 },
    easingPoints: { enter: [0.16, 1, 0.3, 1], exit: [0.4, 0, 1, 1] },
  },
});

let toastProviderModule: typeof ToastProviderModule | undefined;

before(async () => {
  toastProviderModule = await import('./ToastProvider');
});

test('a child can show an error toast on initial mount', async () => {
  assert.ok(toastProviderModule);
  const { ToastProvider, useToast } = toastProviderModule;
  function Harness() {
    const { showToast } = useToast();
    useEffect(() => showToast('목록을 불러오지 못했어요', { tone: 'danger' }), [showToast]);
    return null;
  }
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(createElement(ToastProvider, null, createElement(Harness)));
    });
    assert.equal(renderer.root.findAllByType('AnimatedView' as ElementType).length, 1);
    assert.ok(
      renderer.root
        .findAllByType(TextHost)
        .some((node) => node.props.children === '목록을 불러오지 못했어요'),
    );
  } finally {
    await act(async () => renderer?.unmount());
  }
});

test('다른 토스트가 잠시 표시된 뒤 지속 재시도 토스트를 복원하고 정리할 수 있다', async () => {
  assert.ok(toastProviderModule);
  const { ToastProvider, useToast } = toastProviderModule;
  let api: ReturnType<typeof useToast> | undefined;
  function Harness() {
    api = useToast();
    return null;
  }
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(ToastProvider, null, createElement(Harness)));
  });
  const hasMessage = (message: string) =>
    renderer.root.findAllByType(TextHost).some((node) => node.props.children === message);

  let dismissPersistent: (() => void) | undefined;
  let dismissTemporary: (() => void) | undefined;
  await act(async () => {
    dismissPersistent = api?.showToast('페이지 재시도', {
      action: { label: '다시 시도', onPress: () => undefined },
      persistent: true,
      tone: 'danger',
    });
    dismissTemporary = api?.showToast('북마크 실패', { tone: 'danger' });
  });
  assert.equal(hasMessage('북마크 실패'), true);
  await act(async () => dismissTemporary?.());
  assert.equal(hasMessage('페이지 재시도'), true);
  await act(async () => dismissPersistent?.());
  assert.equal(renderer.root.findAllByType('AnimatedView' as ElementType).length, 0);

  await act(async () => {
    dismissPersistent = api?.showToast('이전 화면 재시도', { persistent: true, tone: 'danger' });
    dismissTemporary = api?.showToast('다른 알림', { tone: 'info' });
  });
  await act(async () => dismissPersistent?.());
  await act(async () => dismissTemporary?.());
  assert.equal(renderer.root.findAllByType('AnimatedView' as ElementType).length, 0);
  await act(async () => renderer.unmount());
});

test('toast dwell timer starts after its enter motion finishes', async (t) => {
  assert.ok(toastProviderModule);
  const { ToastProvider, useToast } = toastProviderModule;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  holdEnterAnimation = true;
  reducedMotion = false;

  let api: ReturnType<typeof useToast> | undefined;
  function Harness() {
    api = useToast();
    return null;
  }

  // @ts-expect-error Toast callers must choose an explicit semantic tone.
  const toneRequired: Parameters<ReturnType<typeof useToast>['showToast']> = ['tone 없는 알림'];
  void toneRequired;

  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(createElement(ToastProvider, null, createElement(Harness)));
    });
    await act(async () => {
      api?.showToast('저장했습니다.', { tone: 'success' });
    });
    assert.equal(renderer?.root.findAllByType('AnimatedView' as ElementType).length, 1);
    await act(async () => t.mock.timers.tick(3000));
    assert.equal(
      renderer?.root.findAllByType('AnimatedView' as ElementType).length,
      1,
      'enter motion이 끝나기 전에는 dwell 시간이 지나도 닫히지 않아야 한다',
    );

    holdEnterAnimation = false;
    await act(async () => pendingEnter?.({ finished: true }));
    pendingEnter = undefined;

    await act(async () => t.mock.timers.tick(2000));
    holdEnterAnimation = true;
    for (const nextReducedMotion of [true, false, true, false]) {
      reducedMotion = nextReducedMotion;
      await act(async () =>
        renderer?.update(createElement(ToastProvider, null, createElement(Harness))),
      );
      await act(async () => pendingEnter?.({ finished: true }));
      pendingEnter = undefined;
    }
    holdEnterAnimation = false;
    await act(async () => t.mock.timers.tick(999));
    assert.equal(renderer?.root.findAllByType('AnimatedView' as ElementType).length, 1);
    await act(async () => t.mock.timers.tick(1));
    assert.equal(renderer?.root.findAllByType('AnimatedView' as ElementType).length, 0);
    let dismiss: (() => void) | undefined;
    await act(async () => {
      dismiss = api?.showToast('이미지를 불러오지 못했어요.', {
        tone: 'danger',
        persistent: true,
        action: { label: '다시 시도', onPress: () => undefined },
      });
    });
    await act(async () => t.mock.timers.tick(3000));
    assert.equal(
      renderer?.root.findAllByType('AnimatedView' as ElementType).length,
      1,
      'persistent Action Toast에는 자동 닫힘 timer가 없어야 한다',
    );
    await act(async () => dismiss?.());
    assert.equal(renderer?.root.findAllByType('AnimatedView' as ElementType).length, 0);
  } finally {
    await act(async () => renderer?.unmount());
    t.mock.timers.reset();
    reducedMotion = false;
    holdEnterAnimation = false;
    pendingEnter = undefined;
  }
});

test('dismissed action is removed from input and accessibility during exit', async () => {
  assert.ok(toastProviderModule);
  const { ToastProvider, useToast } = toastProviderModule;
  let api: ReturnType<typeof useToast> | undefined;
  let actionCalls = 0;
  function Harness() {
    api = useToast();
    return null;
  }

  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(createElement(ToastProvider, null, createElement(Harness)));
    });
    let dismiss: (() => void) | undefined;
    await act(async () => {
      dismiss = api?.showToast('다시 시도해 주세요.', {
        action: { label: '다시 시도', onPress: () => actionCalls++ },
        persistent: true,
        tone: 'danger',
      });
    });
    const action = renderer?.root
      .findAllByType(PressableHost)
      .find((node) => node.props.accessibilityRole === 'button');
    assert.ok(action);
    const onPress = action.props.onPress as () => void;

    holdExitAnimation = true;
    await act(async () => dismiss?.());
    assert.equal(renderer?.root.findAllByType(PressableHost).length, 0);
    const host = renderer?.root.findByType('AnimatedView' as ElementType);
    assert.ok(host);
    assert.equal(host.props['aria-hidden'], true);
    assert.equal(host.props.accessibilityElementsHidden, true);
    assert.equal(host.props.importantForAccessibility, 'no-hide-descendants');
    assert.equal(flattenStyle(host.props.style).pointerEvents, 'none');
    await act(async () => onPress());
    assert.equal(actionCalls, 0);

    holdExitAnimation = false;
    await act(async () => pendingExit?.({ finished: true }));
    pendingExit = undefined;
  } finally {
    holdExitAnimation = false;
    pendingExit = undefined;
    await act(async () => renderer?.unmount());
  }
});

test('provider unmount invalidates stale toast timers and actions', async (t) => {
  assert.ok(toastProviderModule);
  const { ToastProvider, useToast } = toastProviderModule;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;
  reducedMotion = false;
  let oldApi: ReturnType<typeof useToast> | undefined;
  let oldActionCalls = 0;
  function OldHarness() {
    oldApi = useToast();
    return null;
  }

  let oldRenderer: ReactTestRenderer | undefined;
  let staleDismiss: (() => void) | undefined;
  let staleAction: (() => void) | undefined;
  let nextApi: ReturnType<typeof useToast> | undefined;
  function NextHarness() {
    nextApi = useToast();
    return null;
  }
  let nextRenderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      oldRenderer = create(createElement(ToastProvider, null, createElement(OldHarness)));
    });
    await act(async () => {
      staleDismiss = oldApi?.showToast('이전 알림', {
        action: { label: '다시 시도', onPress: () => oldActionCalls++ },
        tone: 'danger',
      });
    });
    const oldAction = oldRenderer?.root
      .findAllByType(PressableHost)
      .find((node) => node.props.accessibilityRole === 'button');
    assert.ok(oldAction);
    staleAction = oldAction.props.onPress as () => void;
    await act(async () => oldRenderer?.unmount());

    await act(async () => {
      nextRenderer = create(createElement(ToastProvider, null, createElement(NextHarness)));
    });
    await act(async () => {
      nextApi?.showToast('새 알림', { persistent: true, tone: 'info' });
    });
    await act(async () => t.mock.timers.tick(3000));
    await act(async () => staleAction?.());
    assert.equal(oldActionCalls, 0);
    await act(async () => staleDismiss?.());
    assert.equal(oldActionCalls, 0);
    assert.equal(
      nextRenderer?.root.findAllByType(TextHost).some((node) => node.props.children === '새 알림'),
      true,
    );
  } finally {
    reducedMotion = false;
    await act(async () => oldRenderer?.unmount());
    await act(async () => nextRenderer?.unmount());
    globalThis.clearTimeout = originalClearTimeout;
    t.mock.timers.reset();
  }
});

test('toast maps every semantic tone to its subtle feedback colors and rail', async () => {
  assert.ok(toastProviderModule);
  const { ToastProvider, useToast } = toastProviderModule;
  let api: ReturnType<typeof useToast> | undefined;
  function Harness() {
    api = useToast();
    return null;
  }

  const cases = [
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
      api?.showToast('알림', { tone: sample.tone });
    });
    const surface = renderer?.root.findByType(ViewHost);
    const style = flattenStyle(surface?.props.style);
    assert.equal(style.backgroundColor, sample.background);
    assert.equal(style.paddingVertical, 12);
    const message = renderer?.root.findByType(TextHost);
    assert.equal(flattenStyle(message?.props.style).color, sample.foreground);
    assert.equal(style.borderLeftWidth, 4);
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

test('toast fills a mobile viewport with 16px side margins', async () => {
  assert.ok(toastProviderModule);
  const { ToastProvider, useToast } = toastProviderModule;
  let api: ReturnType<typeof useToast> | undefined;
  function Harness() {
    api = useToast();
    return null;
  }

  windowWidth = 390;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(createElement(ToastProvider, null, createElement(Harness)));
    });
    await act(async () => {
      api?.showToast('위험 알림', { tone: 'danger' });
    });

    const surface = renderer.root.findByType(ViewHost);
    assert.equal(flattenStyle(surface.props.style).maxWidth, 358);
  } finally {
    windowWidth = 1400;
    await act(async () => renderer.unmount());
  }
});

test('action toast invokes once and its stale callbacks do not dismiss a replacement', async () => {
  assert.ok(toastProviderModule);
  const { ToastProvider, useToast } = toastProviderModule;
  let api: ReturnType<typeof useToast> | undefined;
  let actionCalls = 0;
  let dismissOriginal: (() => void) | undefined;
  let dismissReplacement: (() => void) | undefined;
  function Harness() {
    api = useToast();
    return null;
  }

  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(ToastProvider, null, createElement(Harness)));
  });
  await act(async () => {
    dismissOriginal = api?.showToast('다시 시도해 주세요.', {
      action: {
        label: '다시 시도',
        onPress: () => {
          actionCalls++;
          dismissReplacement = api?.showToast('새 알림', { tone: 'info' });
        },
      },
      persistent: true,
      tone: 'danger',
    });
  });

  const action = renderer?.root
    .findAllByType(PressableHost)
    .find((node) => node.props.accessibilityRole === 'button');
  assert.ok(action);
  const onPress = action.props.onPress as () => void;
  await act(async () => {
    onPress();
    onPress();
    dismissOriginal?.();
  });
  assert.equal(actionCalls, 1);
  assert.equal(
    renderer?.root.findAllByType(TextHost).some((node) => node.props.children === '새 알림'),
    true,
  );

  await act(async () => dismissReplacement?.());
  assert.equal(renderer?.root.findAllByType('AnimatedView' as ElementType).length, 0);

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
        tone: 'danger',
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
