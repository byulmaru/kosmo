import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as StateViewModule from './StateView';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TextHost = 'Text' as unknown as ElementType;
const ViewHost = 'View' as unknown as ElementType;
const ButtonHost = 'Button' as unknown as ElementType;
const AnimatedViewHost = 'AnimatedView' as unknown as ElementType;
const DefsHost = 'Defs' as unknown as ElementType;
const LinearGradientHost = 'LinearGradient' as unknown as ElementType;
const RectHost = 'Rect' as unknown as ElementType;
const StopHost = 'Stop' as unknown as ElementType;
const SvgHost = 'Svg' as unknown as ElementType;
let platform = 'web';
let themeMode = 'light';
let reducedMotion = false;
const timingCalls: Array<Record<string, unknown>> = [];
const delayCalls: number[] = [];

class MockAnimatedValue {
  constructor(public value: number) {}

  interpolate(config: Record<string, unknown>) {
    return { config, type: 'interpolation' };
  }

  setValue(value: number) {
    this.value = value;
  }
}

const Animated = {
  Easing: { linear: 'linear' },
  View: AnimatedViewHost,
  Value: MockAnimatedValue,
  loop: (animation: { start: () => void; stop: () => void }) => animation,
  delay: (duration: number) => {
    delayCalls.push(duration);
    return { start: () => undefined, stop: () => undefined };
  },
  sequence: (animations: Array<{ start: () => void; stop: () => void }>) => ({
    start: () => animations[0]?.start(),
    stop: () => animations[0]?.stop(),
  }),
  timing: (_value: MockAnimatedValue, config: Record<string, unknown>) => {
    timingCalls.push(config);
    return {
      start: () => undefined,
      stop: () => undefined,
    };
  },
};

mockModule('react-native', {
  ActivityIndicator: 'ActivityIndicator',
  Animated,
  Easing: Animated.Easing,
  Platform: {
    get OS() {
      return platform;
    },
  },
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: TextHost,
  View: ViewHost,
});
mockModule('react-native-svg', {
  Defs: DefsHost,
  LinearGradient: LinearGradientHost,
  Rect: RectHost,
  Stop: StopHost,
  Svg: SvgHost,
});
mockModule('@/theme/ThemeProvider', {
  useReducedMotion: () => reducedMotion,
  useThemeMode: () => themeMode,
  useTheme: () => ({
    fixedWhite: '#FFFFFF',
    feedbackDangerOnSubtle: 'danger-on-subtle',
    feedbackDangerSubtle: 'danger-subtle',
    foregroundPrimary: 'foreground',
    foregroundSecondary: 'secondary',
    stateDisabledSurface: 'disabled-surface',
  }),
});
mockModule('@/theme/tokens', {
  radius: { 8: 8, 12: 12, full: 999 },
  space: { 8: 8, 16: 16, 32: 32 },
  motion: { duration: { skeletonWave: 2000 } },
  textStyles: { uiCopyM: {}, uiLabelL: {} },
});
mockModule('./Button', { Button: ButtonHost });

let stateViewModule: typeof StateViewModule | undefined;

before(async () => {
  stateViewModule = await import('./StateView');
});

afterEach(() => {
  platform = 'web';
  themeMode = 'light';
  reducedMotion = false;
  timingCalls.length = 0;
  delayCalls.length = 0;
});

test('alert StateView keeps the host surface with danger copy and primary recovery action', async () => {
  assert.ok(stateViewModule);
  const { StateView } = stateViewModule;
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      createElement(StateView, {
        actionLabel: '다시 시도',
        alert: true,
        description: '잠시 후 다시 시도해 주세요.',
        onAction: () => undefined,
        title: '불러오지 못했어요',
      }),
    );
  });

  const root = renderer?.root.findByType(ViewHost);
  assert.ok(root);
  const rootStyle = Object.assign({}, ...root.props.style.flat().filter(Boolean));
  const text = renderer?.root.findAllByType(TextHost) ?? [];
  assert.equal(rootStyle.backgroundColor, undefined);
  assert.equal(text[0]?.props.style[1].color, 'danger-on-subtle');
  assert.equal(text[1]?.props.style[1].color, 'danger-on-subtle');
  assert.equal(renderer?.root.findByType(ButtonHost).props.tone, 'primary');
  await act(async () => renderer?.unmount());
});

test('circular Skeleton preserves the requested size, border and margin', async () => {
  assert.ok(stateViewModule);
  const { Skeleton } = stateViewModule;
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      createElement(Skeleton, {
        circular: true,
        height: 40,
        style: { borderWidth: 1, marginTop: -20 },
        width: 40,
      }),
    );
  });

  const style = renderer?.root.findByType(ViewHost).props.style;
  const { borderRadius, borderWidth, height, marginTop, width } = Object.assign(
    {},
    ...style.flat(),
  );
  assert.equal(width, 40);
  assert.equal(height, 40);
  assert.ok(borderRadius >= width / 2);
  assert.equal(borderWidth, 1);
  assert.equal(marginTop, -20);
  await act(async () => renderer?.unmount());
});

test('Skeleton renders and starts the restrained wave after measuring its width', async () => {
  assert.ok(stateViewModule);
  const { Skeleton } = stateViewModule;
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(Skeleton, { height: 20, width: 160 }));
  });

  const skeleton = renderer?.root.findByType(ViewHost);
  assert.ok(skeleton);
  assert.equal(renderer?.root.findAllByType(AnimatedViewHost).length, 0);

  await act(async () => {
    skeleton.props.onLayout({ nativeEvent: { layout: { width: 160 } } });
  });

  assert.equal(renderer?.root.findAllByType(AnimatedViewHost).length, 1);
  const wave = renderer?.root.findByType(AnimatedViewHost);
  assert.ok(wave);
  const waveStyle = Object.assign({}, ...wave.props.style.flat());
  const [start, end] = waveStyle.transform[0].translateX.config.outputRange;
  assert.ok(start + waveStyle.width <= 0, 'wave starts entirely outside the left edge');
  assert.ok(end >= 160, 'wave ends entirely outside the right edge');
  assert.equal(renderer?.root.findAllByType(StopHost)[1]?.props.stopColor, '#FFFFFF');
  assert.equal(renderer?.root.findAllByType(StopHost)[1]?.props.stopOpacity, '0.7');
  assert.ok(timingCalls.some(({ duration, easing }) => duration === 2000 && easing === 'linear'));
  assert.deepEqual(delayCalls, [2000]);
  themeMode = 'dark';
  await act(async () => renderer?.update(createElement(Skeleton, { height: 20, width: 160 })));
  assert.equal(renderer?.root.findAllByType(StopHost)[1]?.props.stopOpacity, '0.16');
  await act(async () => renderer?.unmount());
});

test('Skeleton stays static while reduced motion is enabled', async () => {
  assert.ok(stateViewModule);
  const { Skeleton } = stateViewModule;
  reducedMotion = true;
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(Skeleton, { height: 20, width: 160 }));
  });

  const skeleton = renderer?.root.findByType(ViewHost);
  assert.ok(skeleton);
  await act(async () => {
    skeleton.props.onLayout({ nativeEvent: { layout: { width: 160 } } });
  });
  assert.equal(renderer?.root.findAllByType(AnimatedViewHost).length, 0);

  await act(async () => renderer?.unmount());
});

test('Skeleton stops its wave when reduced motion becomes enabled', async () => {
  assert.ok(stateViewModule);
  const { Skeleton } = stateViewModule;
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(Skeleton, { height: 20, width: 160 }));
  });
  const skeleton = renderer?.root.findByType(ViewHost);
  assert.ok(skeleton);
  await act(async () => {
    skeleton.props.onLayout({ nativeEvent: { layout: { width: 160 } } });
  });

  reducedMotion = true;
  await act(async () => {
    renderer?.update(createElement(Skeleton, { height: 20, width: 160 }));
  });
  assert.equal(renderer?.root.findAllByType(AnimatedViewHost).length, 0);
  await act(async () => renderer?.unmount());
});
