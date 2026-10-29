import assert from 'node:assert/strict';
import { before, beforeEach, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType, ReactElement, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const viewHost = 'View' as unknown as ElementType;
const animatedViewHost = 'AnimatedView' as unknown as ElementType;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

const mockPlatform: { OS: string } = { OS: 'web' };
let reducedMotion = false;
const theme = { stateHover: 'hover', statePressed: 'pressed' };
let pressState = { hovered: false, pressed: false };
const timingCalls: Array<{
  active: boolean;
  duration: number;
  handle: AnimatedColorMock;
  stopCalls: number;
  target: AnimatedColorMock;
}> = [];
let setValueCalls = 0;

class AnimatedColorMock {
  constructor(public value: string) {}
  setValue(value: string) {
    setValueCalls += 1;
    this.value = value;
  }
  stopAnimation(callback?: () => void) {
    callback?.();
  }
}

const PressableHost = ({
  children,
  ...props
}: {
  children?: ReactNode | ((state: typeof pressState) => ReactNode);
  [key: string]: unknown;
}) =>
  createElement(
    'Pressable',
    props,
    typeof children === 'function' ? children(pressState) : children,
  );

mockModule('react-native', {
  processColor: () => undefined,
  Animated: {
    Color: AnimatedColorMock,
    View: 'AnimatedView',
    timing: (
      value: AnimatedColorMock,
      config: { duration: number; toValue: AnimatedColorMock },
    ) => {
      const timing = {
        active: false,
        duration: config.duration,
        handle: value,
        stopCalls: 0,
        target: config.toValue,
      };
      timingCalls.push(timing);
      return {
        start: () => {
          timing.active = true;
        },
        stop: () => {
          timing.active = false;
          timing.stopCalls += 1;
        },
      };
    },
  },
  Easing: { bezier: () => () => 0 },
  Platform: mockPlatform,
  Pressable: PressableHost,
  StyleSheet: {
    absoluteFill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
    create: <T>(styles: T) => styles,
    flatten: (style: unknown) => flattenStyle(style),
  },
  View: 'View',
});
mockModule('@/theme/ThemeProvider', {
  useReducedMotion: () => reducedMotion,
  useTheme: () => theme,
  useThemeMode: () => 'light',
});
mockModule('@/theme/tokens', {
  motion: {
    duration: { fast: 120, instant: 0, standard: 200 },
    easing: { standard: 'standard-easing' },
    easingPoints: { standard: [0.17, 0.73, 0.14, 1] },
  },
  radius: { 12: 12, full: 999 },
});

type IconButtonProps = {
  accessibilityLabel: string;
  accessibilityRole?: 'button' | 'link';
  accessibilityState?: { busy?: boolean; expanded?: boolean };
  children: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  controlRef?: unknown;
  disabled?: boolean;
  feedbackRadius?: number;
  feedbackTone?: 'inverse';
  focusable?: boolean;
  hitSlop?: number;
  onFocus?: () => void;
  onPressIn?: () => void;
  style?: unknown;
  targetSize?: number;
  visualSize?: number;
  visualStyle?: unknown;
};
type IconButtonComponent = (props: IconButtonProps) => ReactElement;

let IconButton: IconButtonComponent | undefined;
let getIconButtonHitSlop:
  | ((renderedTargetSize: number, effectiveTargetSize: number) => number)
  | undefined;
let getIconButtonOverlayGeometry:
  | ((
      platform: string,
      visualSize: number,
      visualInset: number,
    ) => { targetInset: number; targetSize: number; visualInset: number })
  | undefined;
let getIconButtonPlatformGeometry:
  | ((
      platform: string,
      targetSize: number,
      visualSize?: number,
    ) => { minimumHitSlop: number; minimumTargetSize: number })
  | undefined;
let getInteractionTargetSize: ((platform: string) => number) | undefined;

before(async () => {
  mockPlatform.OS = 'ios';
  try {
    const module = await import('./IconButton').catch(() => null);
    IconButton = module?.IconButton as IconButtonComponent | undefined;
    getIconButtonHitSlop = module?.getIconButtonHitSlop as typeof getIconButtonHitSlop;
    getIconButtonOverlayGeometry = module?.getIconButtonOverlayGeometry as
      | typeof getIconButtonOverlayGeometry
      | undefined;
    getIconButtonPlatformGeometry = module?.getIconButtonPlatformGeometry as
      | typeof getIconButtonPlatformGeometry
      | undefined;
    ({ getInteractionTargetSize } = await import('./interactionTarget'));
  } finally {
    mockPlatform.OS = 'web';
  }
});

beforeEach(() => {
  mockPlatform.OS = 'web';
  pressState = { hovered: false, pressed: false };
  reducedMotion = false;
  timingCalls.length = 0;
  setValueCalls = 0;
});

function renderIconButton(props: IconButtonProps): ReactTestInstance {
  assert.ok(IconButton, 'IconButton component must exist');
  pressState = { hovered: false, pressed: false };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(IconButton!, props));
  });
  return renderer.root.findByType(PressableHost);
}

function renderVisual(
  button: ReactTestInstance,
  state: { hovered: boolean; pressed: boolean },
): ReactTestRenderer {
  assert.equal(typeof button.props.children, 'function');
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(button.props.children(state) as ReactElement);
  });
  return renderer;
}

function updateVisual(
  renderer: ReactTestRenderer,
  button: ReactTestInstance,
  state: { hovered: boolean; pressed: boolean },
) {
  act(() => {
    renderer.update(button.props.children(state) as ReactElement);
  });
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!Array.isArray(style)) {
    return typeof style === 'object' && style !== null ? (style as Record<string, unknown>) : {};
  }

  return Object.assign({}, ...style.flat(Infinity).filter(Boolean));
}

test('platform target mapping stays centralized for Web, iOS, and Android', () => {
  assert.ok(getInteractionTargetSize, 'target size resolver must exist');
  assert.equal(getInteractionTargetSize('web'), 32);
  assert.equal(getInteractionTargetSize('ios'), 44);
  assert.equal(getInteractionTargetSize('android'), 48);
  assert.equal(getInteractionTargetSize('windows'), 48);
});

test('hit slop preserves the requested effective region from the rendered layout box', () => {
  assert.ok(getIconButtonHitSlop, 'hit slop resolver must exist');
  assert.equal(getIconButtonHitSlop(40, 48), 4);
  assert.equal(getIconButtonHitSlop(32, 48), 8);
  assert.equal(getIconButtonHitSlop(48, 44), 0);
});

test('overlay geometry preserves the visual inset while keeping the platform target in bounds', () => {
  assert.ok(getIconButtonOverlayGeometry, 'overlay geometry resolver must exist');
  assert.deepEqual(getIconButtonOverlayGeometry('web', 32, 4), {
    targetInset: 4,
    targetSize: 32,
    visualInset: 0,
  });
  assert.deepEqual(getIconButtonOverlayGeometry('ios', 32, 4), {
    targetInset: 0,
    targetSize: 44,
    visualInset: 4,
  });
  assert.deepEqual(getIconButtonOverlayGeometry('android', 32, 4), {
    targetInset: 0,
    targetSize: 48,
    visualInset: 4,
  });
});

test('Native target expansion preserves the rendered layout while Web keeps an actual element floor', () => {
  assert.ok(getIconButtonPlatformGeometry, 'platform geometry resolver must exist');
  assert.deepEqual(getIconButtonPlatformGeometry('web', 16, 12), {
    minimumHitSlop: 0,
    minimumTargetSize: 32,
  });
  assert.deepEqual(getIconButtonPlatformGeometry('ios', 40, 40), {
    minimumHitSlop: 2,
    minimumTargetSize: 40,
  });
  assert.deepEqual(getIconButtonPlatformGeometry('android', 44, 44), {
    minimumHitSlop: 2,
    minimumTargetSize: 44,
  });
  assert.deepEqual(getIconButtonPlatformGeometry('android', 48, 32), {
    minimumHitSlop: 0,
    minimumTargetSize: 48,
  });
});

test('Native style-only square preserves its layout and moves the platform deficit into hit slop', () => {
  for (const [platform, expectedHitSlop] of [
    ['ios', 2],
    ['android', 4],
  ] as const) {
    mockPlatform.OS = platform;
    try {
      const button = renderIconButton({
        accessibilityLabel: '미디어 추가',
        children: '+',
        style: { height: 40, width: 40 },
      });
      const targetStyle = flattenStyle(
        (button.props.style as (state: { pressed: boolean }) => unknown)({ pressed: false }),
      );

      assert.equal(targetStyle.height, 40);
      assert.equal(targetStyle.width, 40);
      assert.equal(targetStyle.minHeight, 40);
      assert.equal(targetStyle.minWidth, 40);
      assert.deepEqual(button.props.hitSlop, {
        bottom: expectedHitSlop,
        left: expectedHitSlop,
        right: expectedHitSlop,
        top: expectedHitSlop,
      });
    } finally {
      mockPlatform.OS = 'web';
    }
  }
});

test('Native function style uses an explicit stable size for layout and hit slop', () => {
  for (const [platform, expectedHitSlop] of [
    ['ios', 2],
    ['android', 4],
  ] as const) {
    mockPlatform.OS = platform;
    try {
      const button = renderIconButton({
        accessibilityLabel: '미디어 추가',
        children: '+',
        style: ({ pressed }: { pressed: boolean }) => ({
          backgroundColor: pressed ? 'gray' : 'white',
          height: 40,
          width: 40,
        }),
        targetSize: 40,
      });
      const targetStyle = flattenStyle(
        (button.props.style as (state: { pressed: boolean }) => unknown)({ pressed: true }),
      );

      assert.equal(targetStyle.backgroundColor, 'gray');
      assert.equal(targetStyle.height, 40);
      assert.equal(targetStyle.width, 40);
      assert.equal(targetStyle.minHeight, 40);
      assert.equal(targetStyle.minWidth, 40);
      assert.deepEqual(button.props.hitSlop, {
        bottom: expectedHitSlop,
        left: expectedHitSlop,
        right: expectedHitSlop,
        top: expectedHitSlop,
      });
    } finally {
      mockPlatform.OS = 'web';
    }
  }
});

test('caller target and style cannot lower the Web interaction floor', () => {
  const button = renderIconButton({
    accessibilityLabel: '검색 지우기',
    children: '×',
    hitSlop: -4,
    style: { height: 12, minHeight: 12, minWidth: 12, width: 12 },
    targetSize: 16,
  });
  const targetStyle = flattenStyle(
    (button.props.style as (state: { pressed: boolean }) => unknown)({ pressed: false }),
  );

  assert.equal(targetStyle.minHeight, 32);
  assert.equal(targetStyle.minWidth, 32);
  assert.equal(button.props.hitSlop, 0);
});

test('caller can preserve an interaction target larger than the platform floor', () => {
  const button = renderIconButton({
    accessibilityLabel: '닫기',
    children: '×',
    targetSize: 56,
  });
  const targetStyle = flattenStyle(
    (button.props.style as (state: { pressed: boolean }) => unknown)({ pressed: false }),
  );

  assert.equal(targetStyle.minHeight, 56);
  assert.equal(targetStyle.minWidth, 56);
});

test('visual size remains independent from the accessible input target', () => {
  const button = renderIconButton({
    accessibilityLabel: '#공예 제거',
    children: '×',
    style: { position: 'absolute' },
    targetSize: 44,
    visualSize: 32,
    visualStyle: ({ pressed }: { pressed: boolean }) => ({
      backgroundColor: pressed ? 'gray' : 'white',
      borderWidth: 1,
    }),
  });
  const targetStyle = flattenStyle(
    (button.props.style as (state: { pressed: boolean }) => unknown)({ pressed: false }),
  );
  const visualRenderer = renderVisual(button, { hovered: false, pressed: false });
  const visual = visualRenderer.root.findByType(viewHost);

  assert.equal(button.type, PressableHost);
  assert.equal(targetStyle.minHeight, 44);
  assert.equal(targetStyle.minWidth, 44);
  assert.equal(targetStyle.position, 'absolute');
  assert.equal(targetStyle.backgroundColor, undefined);
  assert.ok(visual);
  const visualStyle = flattenStyle(visual.props.style);
  assert.equal(visualStyle.height, 32);
  assert.equal(visualStyle.width, 32);
  assert.equal(visualStyle.backgroundColor, 'white');
  assert.equal(visualStyle.borderWidth, 1);
});

test('visualStyle without visualSize keeps the requested feedback dimensions', () => {
  const button = renderIconButton({
    accessibilityLabel: '더보기',
    children: '…',
    targetSize: 44,
    visualStyle: { borderWidth: 1 },
  });
  const renderer = renderVisual(button, { hovered: false, pressed: false });
  const visualStyle = flattenStyle(renderer.root.findByType(viewHost).props.style);
  const feedbackStyle = flattenStyle(renderer.root.findByType(animatedViewHost).props.style);

  assert.equal(visualStyle.height, 44);
  assert.equal(visualStyle.width, 44);
  assert.equal(visualStyle.borderWidth, 1);
  assert.equal(feedbackStyle.height, 44);
  assert.equal(feedbackStyle.width, 44);
});

test('button semantics and interaction props are forwarded without losing press state', () => {
  const controlRef = { current: null };
  const onPressIn = () => undefined;
  const button = renderIconButton({
    accessibilityLabel: '프로필 편집 닫기',
    accessibilityState: { busy: true, expanded: true },
    children: ({ pressed }) => (pressed ? '눌림' : '기본'),
    controlRef,
    disabled: true,
    hitSlop: 4,
    onPressIn,
    style: ({ pressed }: { pressed: boolean }) => ({ backgroundColor: pressed ? 'gray' : 'white' }),
    targetSize: 44,
  });
  const disabledStyle = flattenStyle(
    (button.props.style as (state: { pressed: boolean }) => unknown)({ pressed: true }),
  );
  const pressedVisual = renderVisual(button, { hovered: false, pressed: true });
  const pressedContent = pressedVisual.root.findByType(viewHost).props.children;

  assert.equal(button.props.accessibilityLabel, '프로필 편집 닫기');
  assert.equal(button.props.accessibilityRole, 'button');
  assert.equal(button.props.disabled, true);
  assert.deepEqual(button.props.accessibilityState, { busy: true, disabled: true, expanded: true });
  assert.equal(button.props.hitSlop, 4);
  assert.equal(button.props.onPressIn, onPressIn);
  assert.equal(button.props.ref, controlRef);
  assert.equal(disabledStyle.backgroundColor, 'gray');
  assert.deepEqual(Array.isArray(pressedContent) ? pressedContent[1] : pressedContent, '눌림');
});

test('a navigation adapter can preserve link semantics', () => {
  const link = renderIconButton({
    accessibilityLabel: '뒤로',
    accessibilityRole: 'link',
    children: '←',
  });

  assert.equal(link.props.accessibilityRole, 'link');
});

test('consumer feedback radius changes only the temporary surface and preserves focus target', () => {
  const onFocus = () => undefined;
  const button = renderIconButton({
    accessibilityLabel: '반응한 프로필 보기',
    children: '…',
    feedbackRadius: 12,
    focusable: true,
    onFocus,
    targetSize: 44,
  });
  const getSurfaceStyle = (pressed: boolean) =>
    flattenStyle(
      renderVisual(button, { hovered: false, pressed }).root.findByType(animatedViewHost).props
        .style,
    );
  const targetStyle = flattenStyle(
    (button.props.style as (state: { pressed: boolean }) => unknown)({ pressed: true }),
  );

  assert.equal(getSurfaceStyle(true).borderRadius, 12);
  assert.equal(getSurfaceStyle(true).backgroundColor, 'pressed');
  assert.equal(getSurfaceStyle(false).backgroundColor, 'transparent');
  assert.equal(button.props.accessibilityLabel, '반응한 프로필 보기');
  assert.equal(button.props.accessibilityRole, 'button');
  assert.equal(button.props.focusable, true);
  assert.equal(button.props.onFocus, onFocus);
  assert.equal(button.props.hitSlop, undefined);
  assert.equal(targetStyle.height, 44);
  assert.equal(targetStyle.width, 44);

  const disabledButton = renderIconButton({
    accessibilityLabel: '반응한 프로필 보기',
    children: '…',
    disabled: true,
    feedbackRadius: 12,
    targetSize: 44,
  });
  const disabledSurface = flattenStyle(
    renderVisual(disabledButton, { hovered: true, pressed: true }).root.findByType(animatedViewHost)
      .props.style,
  );
  assert.equal(disabledSurface.borderRadius, 12);
  assert.equal(disabledSurface.backgroundColor, 'transparent');
});

test('default feedback owns a circular surface while preserving state and geometry', () => {
  const button = renderIconButton({
    accessibilityLabel: '닫기',
    children: '×',
    targetSize: 44,
  });
  const surfaceStyle = (state: { hovered: boolean; pressed: boolean }) => {
    const renderer = renderVisual(button, state);
    return flattenStyle(renderer.root.findByType(animatedViewHost).props.style);
  };
  const rootStyle = flattenStyle(
    (button.props.style as (state: { hovered: boolean; pressed: boolean }) => unknown)({
      hovered: false,
      pressed: false,
    }),
  );

  assert.equal(rootStyle.opacity, undefined);
  assert.equal(surfaceStyle({ hovered: false, pressed: false }).backgroundColor, 'transparent');
  assert.equal(surfaceStyle({ hovered: false, pressed: false }).borderRadius, 999);
  assert.equal(surfaceStyle({ hovered: false, pressed: false }).height, 44);
  assert.equal(surfaceStyle({ hovered: true, pressed: false }).backgroundColor, 'hover');
  assert.equal(surfaceStyle({ hovered: true, pressed: true }).backgroundColor, 'pressed');
  assert.equal(surfaceStyle({ hovered: false, pressed: true }).backgroundColor, 'pressed');
  assert.equal(surfaceStyle({ hovered: false, pressed: false }).transitionDuration, undefined);

  const wrapper = renderVisual(button, { hovered: false, pressed: false }).root.findByType(
    viewHost,
  );
  assert.equal(flattenStyle(wrapper.props.style).height, 44);
  assert.equal(flattenStyle(wrapper.props.style).width, 44);
});

test('feedback retargets hover and pressed colors at 120ms on one visual handle', () => {
  const button = renderIconButton({ accessibilityLabel: '닫기', children: '×', targetSize: 44 });
  const renderer = renderVisual(button, { hovered: false, pressed: false });
  const feedback = () => renderer.root.findByType(animatedViewHost);

  updateVisual(renderer, button, { hovered: true, pressed: false });
  const hoverHandle = flattenStyle(feedback().props.style).backgroundColor;
  assert.ok(hoverHandle instanceof AnimatedColorMock);
  const hoverTiming = timingCalls.at(-1);
  assert.ok(hoverTiming);
  assert.equal(hoverTiming.duration, 120);
  assert.equal(hoverTiming.handle, hoverHandle);
  assert.equal(hoverTiming.target.value, 'hover');
  assert.equal(hoverTiming.active, true);

  timingCalls.length = 0;
  updateVisual(renderer, button, { hovered: false, pressed: true });
  const pressedHandle = flattenStyle(feedback().props.style).backgroundColor;
  assert.equal(pressedHandle, hoverHandle);
  const pressedTiming = timingCalls.at(-1);
  assert.ok(pressedTiming);
  assert.equal(pressedTiming.duration, 120);
  assert.equal(pressedTiming.handle, pressedHandle);
  assert.equal(pressedTiming.target.value, 'pressed');
  assert.equal(pressedTiming.active, true);

  timingCalls.length = 0;
  updateVisual(renderer, button, { hovered: true, pressed: false });
  const hoverReturnHandle = flattenStyle(feedback().props.style).backgroundColor;
  assert.equal(hoverReturnHandle, pressedHandle);
  const hoverReturnTiming = timingCalls.at(-1);
  assert.ok(hoverReturnTiming);
  assert.equal(hoverReturnTiming.duration, 120);
  assert.equal(hoverReturnTiming.handle, hoverReturnHandle);
  assert.equal(hoverReturnTiming.target.value, 'hover');
  assert.equal(hoverReturnTiming.active, true);

  timingCalls.length = 0;
  updateVisual(renderer, button, { hovered: false, pressed: false });
  const finalIdleHandle = flattenStyle(feedback().props.style).backgroundColor;
  assert.equal(finalIdleHandle, hoverReturnHandle);
  const finalIdleTiming = timingCalls.at(-1);
  assert.ok(finalIdleTiming);
  assert.equal(finalIdleTiming.duration, 120);
  assert.equal(finalIdleTiming.handle, finalIdleHandle);
  assert.equal(finalIdleTiming.target.value, 'transparent');
  assert.equal(finalIdleTiming.active, true);
});

test('reduced motion stops pending feedback and commits the latest color immediately', () => {
  const button = renderIconButton({ accessibilityLabel: '닫기', children: '×', targetSize: 44 });
  const renderer = renderVisual(button, { hovered: false, pressed: false });

  updateVisual(renderer, button, { hovered: true, pressed: false });
  const pendingTiming = timingCalls.at(-1);
  assert.ok(pendingTiming);
  const setValueCountBeforeReduced = setValueCalls;
  reducedMotion = true;
  updateVisual(renderer, button, { hovered: false, pressed: true });

  assert.equal(timingCalls.length, 1);
  assert.equal(pendingTiming.active, false);
  assert.ok(pendingTiming.stopCalls > 0);
  assert.ok(setValueCalls > setValueCountBeforeReduced);
  assert.equal(
    flattenStyle(renderer.root.findByType(animatedViewHost).props.style).backgroundColor,
    'pressed',
  );
  reducedMotion = false;
});

test('disabled feedback keeps the common opacity and hides the surface', () => {
  const button = renderIconButton({
    accessibilityLabel: '닫기',
    children: '×',
    disabled: true,
    style: { opacity: 0.7 },
    targetSize: 44,
  });
  const rootStyle = flattenStyle(
    (button.props.style as (state: { hovered: boolean; pressed: boolean }) => unknown)({
      hovered: true,
      pressed: true,
    }),
  );
  const disabledVisual = renderVisual(button, { hovered: true, pressed: true });

  assert.equal(rootStyle.opacity, 0.45);
  assert.equal(
    flattenStyle(disabledVisual.root.findByType(animatedViewHost).props.style).backgroundColor,
    'transparent',
  );
});

test('enabled feedback preserves static and state-dependent caller opacity', () => {
  for (const style of [
    { opacity: 0.6 },
    ({ pressed }: { pressed: boolean }) => ({ opacity: pressed ? 0.7 : 0.9 }),
  ]) {
    const button = renderIconButton({ accessibilityLabel: '닫기', children: '×', style });
    for (const pressed of [false, true]) {
      const rootStyle = flattenStyle(
        (button.props.style as (state: { pressed: boolean }) => unknown)({ pressed }),
      );
      assert.equal(rootStyle.opacity, typeof style === 'function' ? (pressed ? 0.7 : 0.9) : 0.6);
    }
  }
});

test('inverse feedback uses the media contrast while reduced motion is instant', () => {
  const button = renderIconButton({
    accessibilityLabel: '이미지 뷰어 닫기',
    children: '×',
    feedbackTone: 'inverse',
    targetSize: 48,
  });
  const surfaceStyle = (state: { hovered: boolean; pressed: boolean }) => {
    return flattenStyle(renderVisual(button, state).root.findByType(animatedViewHost).props.style);
  };

  assert.equal(
    surfaceStyle({ hovered: true, pressed: false }).backgroundColor,
    'rgba(255, 255, 255, 0.16)',
  );
  assert.equal(
    surfaceStyle({ hovered: true, pressed: true }).backgroundColor,
    'rgba(255, 255, 255, 0.24)',
  );

  reducedMotion = true;
  try {
    const reducedButton = renderIconButton({
      accessibilityLabel: '이미지 뷰어 닫기',
      children: '×',
      feedbackTone: 'inverse',
      targetSize: 48,
    });
    assert.equal(
      flattenStyle(
        renderVisual(reducedButton, { hovered: false, pressed: false }).root.findByType(
          animatedViewHost,
        ).props.style,
      ).backgroundColor,
      'transparent',
    );
  } finally {
    reducedMotion = false;
  }
});

test('Native pressed feedback is immediate and preserves the platform target', () => {
  mockPlatform.OS = 'ios';
  try {
    const button = renderIconButton({
      accessibilityLabel: '반응한 프로필 보기',
      children: '…',
      feedbackRadius: 12,
      targetSize: 44,
    });
    const surfaceStyle = flattenStyle(
      renderVisual(button, { hovered: false, pressed: true }).root.findByType(animatedViewHost)
        .props.style,
    );
    const targetStyle = flattenStyle(
      (button.props.style as (state: { pressed: boolean }) => unknown)({ pressed: true }),
    );

    assert.equal(surfaceStyle.backgroundColor, 'pressed');
    assert.equal(surfaceStyle.borderRadius, 12);
    assert.equal(surfaceStyle.transitionDuration, undefined);
    assert.equal(targetStyle.height, 44);
    assert.equal(targetStyle.width, 44);
  } finally {
    mockPlatform.OS = 'web';
  }
});

test('default target has a bounded square size in a stretching parent', () => {
  const button = renderIconButton({ accessibilityLabel: 'More', children: '+', targetSize: 32 });
  const style = flattenStyle(
    (button.props.style as (state: { pressed: boolean }) => unknown)({ pressed: false }),
  );
  assert.equal(style.width, 32);
  assert.equal(style.height, 32);
});
