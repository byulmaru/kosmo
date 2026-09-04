import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, beforeEach, mock, test } from 'node:test';
import { createElement, forwardRef } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as ColorPickerPanelModule from './ColorPickerPanel';

const require = createRequire(import.meta.url);

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HostProps = {
  children?: ReactNode;
  style?: unknown;
};

const PressableHost = forwardRef<unknown, HostProps>(function PressableMock(props, ref) {
  return createElement('Pressable', { ...props, ref }, props.children);
});
const ButtonHost = forwardRef<unknown, HostProps>(function ButtonMock(props, ref) {
  return createElement('Button', { ...props, ref }, props.children);
});
const TextFieldHost = forwardRef<unknown, HostProps>(function TextFieldMock(props, ref) {
  return createElement('TextField', { ...props, ref }, props.children);
});
const DefsHost = 'Defs' as unknown as ElementType;
const LinearGradientHost = 'LinearGradient' as unknown as ElementType;
const RectHost = 'Rect' as unknown as ElementType;
const StopHost = 'Stop' as unknown as ElementType;
const SvgHost = 'Svg' as unknown as ElementType;
const WarningIconHost = 'WarningIcon' as unknown as ElementType;
const TextHost = 'Text' as unknown as ElementType;
const TextInputHost = 'TextInput' as unknown as ElementType;
const ViewHost = 'View' as unknown as ElementType;

let platformOS: 'ios' | 'web' = 'web';
let reducedMotion = false;

type PanResponderConfig = {
  onPanResponderGrant?: (event: unknown) => void;
  onPanResponderMove?: (event: unknown) => void;
  onPanResponderRelease?: (event: unknown) => void;
  onStartShouldSetPanResponder?: () => boolean;
};

mockModule('react-native', {
  PanResponder: {
    create: (config: PanResponderConfig) => ({
      panHandlers: {
        onResponderGrant: config.onPanResponderGrant,
        onResponderMove: config.onPanResponderMove,
        onResponderRelease: config.onPanResponderRelease,
      },
    }),
  },
  Platform: {
    get OS() {
      return platformOS;
    },
  },
  Pressable: PressableHost,
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: TextHost,
  TextInput: TextInputHost,
  View: ViewHost,
});
mockModule('react-native-svg', {
  Defs: DefsHost,
  LinearGradient: LinearGradientHost,
  Rect: RectHost,
  Stop: StopHost,
  Svg: SvgHost,
});
mockModule(require.resolve('lucide-react-native'), { TriangleAlert: WarningIconHost });
mockModule('@/components/ui/Button', { Button: ButtonHost });
mockModule('@/components/ui/TextField', { TextField: TextFieldHost });
mockModule('@/theme/ThemeProvider', {
  useReducedMotion: () => reducedMotion,
  useElevation: () => ({ floating: { boxShadow: 'shadow' } }),
  useTheme: () => ({
    backgroundCanvas: 'canvas',
    backgroundElevated: 'elevated',
    backgroundSurface: 'surface',
    borderDefault: 'border',
    borderDisabled: 'disabled-border',
    feedbackWarningBorder: 'warning-border',
    feedbackWarningOnSubtle: 'warning-text',
    feedbackWarningSubtle: 'warning-surface',
    fixedWhite: 'white',
    foregroundPrimary: 'primary',
    foregroundSecondary: 'secondary',
    stateDisabledForeground: 'disabled-foreground',
    stateDisabledSurface: 'disabled-surface',
    stateFocusRing: 'focus-ring',
    stateHover: 'hover',
    statePressed: 'pressed',
  }),
});
mockModule('@/theme/tokens', {
  borderWidths: { 0: 0, 1: 1, 2: 2 },
  colors: {
    dark: { backgroundSurface: 'dark-surface', foregroundPrimary: 'dark-foreground' },
    light: { backgroundSurface: 'light-surface', foregroundPrimary: 'light-foreground' },
  },
  motion: {
    duration: { fast: 120, instant: 0 },
    easing: { standard: 'standard-easing' },
  },
  radius: { 4: 4, 8: 8, 12: 12, full: 999 },
  space: { 4: 4, 8: 8, 12: 12, 16: 16, 24: 24, 48: 48 },
  textStyles: {
    uiCopyM: { fontSize: 14, lineHeight: 20 },
    uiCopyS: { fontSize: 12, lineHeight: 16 },
    uiHeadingS: { fontSize: 20, lineHeight: 26 },
    uiLabelL: { fontSize: 16, lineHeight: 24 },
    uiLabelM: { fontSize: 14, lineHeight: 20 },
    uiLabelS: { fontSize: 12, lineHeight: 16 },
  },
});

let colorPickerPanelModule: typeof ColorPickerPanelModule | undefined;

before(async () => {
  colorPickerPanelModule = await import('./ColorPickerPanel');
});

beforeEach(() => {
  platformOS = 'web';
  reducedMotion = false;
});

function renderPanel({
  disabled = false,
  onCancel = () => undefined,
  onChange = () => undefined,
  onCommit = () => undefined,
  value = { brightness: 75, hue: 180, saturation: 25 },
  contrastWarning,
}: Partial<ColorPickerPanelModule.ColorPickerPanelProps> = {}) {
  assert.ok(colorPickerPanelModule);
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(
      createElement(colorPickerPanelModule!.ColorPickerPanel, {
        contrastWarning,
        disabled,
        onCancel,
        onChange,
        onCommit,
        value,
      }),
    );
  });
  assert.ok(renderer);
  return renderer;
}

function flattenStyle(style: unknown): Record<string, unknown> {
  return Object.assign(
    {},
    ...(Array.isArray(style) ? style.flat(Infinity).filter(Boolean) : [style]),
  );
}

function nodeStyle(node: { props: { style?: unknown } }) {
  const style = node.props.style;
  return flattenStyle(
    typeof style === 'function' ? style({ hovered: false, pressed: false }) : style,
  );
}

function pressables(renderer: ReactTestRenderer) {
  return renderer.root.findAllByType(PressableHost);
}

function findByTestID(renderer: ReactTestRenderer, testID: string) {
  return renderer.root.findByProps({ testID });
}

test('ColorPickerPanel matches the controlled plane, handles, previews, warning, and actions', () => {
  const renderer = renderPanel({ contrastWarning: '대비가 낮을 수 있어요.' });
  const surface = findByTestID(renderer, 'color-picker-surface');
  const hue = findByTestID(renderer, 'color-picker-hue');

  assert.equal(nodeStyle(surface).height, 180);
  assert.equal(nodeStyle(surface).width, '100%');
  act(() => surface.props.onLayout({ nativeEvent: { layout: { width: 328 } } }));
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-surface-handle')).height, 48);
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-surface-handle')).width, 48);
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-surface-handle')).left, 82);
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-surface-handle')).top, 45);
  assert.equal(findByTestID(renderer, 'color-picker-surface-handle').props.pointerEvents, 'none');
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-surface-cursor')).height, 20);
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-surface-cursor')).width, 20);
  assert.equal(nodeStyle(hue).minHeight, 48);
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-hue-track')).height, 12);
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-hue-handle')).height, 48);
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-hue-handle')).width, 48);
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-hue-handle')).left, 164);
  assert.equal(findByTestID(renderer, 'color-picker-hue-handle').props.pointerEvents, 'none');
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-hue-thumb')).height, 20);
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-hue-thumb')).width, 20);
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-hue-thumb')).borderColor, 'white');

  const panel = findByTestID(renderer, 'color-picker-panel');
  assert.equal(nodeStyle(panel).borderWidth, 1);
  assert.equal(nodeStyle(panel).padding, 15);
  assert.equal(nodeStyle(panel).boxShadow, 'shadow');
  assert.equal(
    renderer.root.findAllByType(TextHost).some((node) => node.props.children === '색상 선택'),
    true,
  );
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-current-swatch-target')).height, 48);
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-current-swatch-target')).width, 48);
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-current-swatch')).height, 32);
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-current-swatch')).width, 32);
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-hex-field')).flex, 1);
  assert.equal(
    nodeStyle(findByTestID(renderer, 'color-picker-preview-cards')).flexDirection,
    'row',
  );
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-preview-light')).flex, 1);
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-preview-dark')).flex, 1);
  assert.equal(
    nodeStyle(findByTestID(renderer, 'color-picker-preview-light-sample')).width,
    '100%',
  );
  assert.equal(nodeStyle(findByTestID(renderer, 'color-picker-preview-dark-sample')).width, '100%');
  assert.equal(
    nodeStyle(findByTestID(renderer, 'color-picker-preview-light')).backgroundColor,
    'light-surface',
  );
  assert.equal(
    nodeStyle(findByTestID(renderer, 'color-picker-preview-dark')).backgroundColor,
    'dark-surface',
  );
  const lightSample = findByTestID(renderer, 'color-picker-preview-light-sample');
  const darkSample = findByTestID(renderer, 'color-picker-preview-dark-sample');
  assert.equal(nodeStyle(lightSample).backgroundColor, 'light-surface');
  assert.equal(nodeStyle(darkSample).backgroundColor, 'dark-surface');
  const aaTexts = renderer.root
    .findAllByType(TextHost)
    .filter((node) => node.props.children === 'Aa');
  assert.equal(aaTexts.length, 2);
  assert.equal(nodeStyle(aaTexts[0]!).color, '#8FBFBF');
  assert.equal(nodeStyle(aaTexts[1]!).color, '#8FBFBF');

  const warning = findByTestID(renderer, 'color-picker-warning');
  assert.equal(warning.props.accessibilityLiveRegion, 'polite');
  assert.equal(nodeStyle(warning).borderWidth, 1);
  assert.equal(
    renderer.root.findAllByType(TextHost).some((node) => node.props.children === '!'),
    false,
  );
  const warningIcon = findByTestID(renderer, 'color-picker-warning-icon');
  assert.equal(warningIcon.props.accessibilityElementsHidden, true);
  assert.equal(warningIcon.props.importantForAccessibility, 'no-hide-descendants');
  assert.equal(warningIcon.props.accessible, false);
  assert.equal(warningIcon.props['aria-hidden'], true);
  assert.equal(renderer.root.findByType(WarningIconHost).props.color, 'warning-text');
  const buttons = renderer.root.findAllByType(ButtonHost);
  assert.equal(
    buttons.every((button) => button.props.size === undefined),
    true,
  );
  assert.equal(
    buttons.every((button) => nodeStyle(button).flex === 1),
    true,
  );
  assert.equal(
    buttons.every((button) => nodeStyle(button).minHeight === 40),
    true,
  );
});

test('ColorPickerPanel transitions Web target feedback without animating value geometry', () => {
  const renderer = renderPanel();
  const surface = findByTestID(renderer, 'color-picker-surface');
  const hue = findByTestID(renderer, 'color-picker-hue');
  const surfaceStyle = flattenStyle(surface.props.style({ hovered: true, pressed: false }));
  const hueStyle = flattenStyle(hue.props.style({ hovered: true, pressed: false }));

  assert.equal(surfaceStyle.transitionDuration, '120ms');
  assert.equal(surfaceStyle.transitionProperty, 'background-color');
  assert.equal(surfaceStyle.transitionTimingFunction, 'standard-easing');
  assert.equal(surfaceStyle.backgroundColor, 'hover');
  assert.equal(hueStyle.transitionDuration, '120ms');
  assert.equal(hueStyle.transitionProperty, 'background-color');
  assert.equal(hueStyle.backgroundColor, 'hover');

  const pressedSurfaceStyle = flattenStyle(surface.props.style({ hovered: true, pressed: true }));
  const pressedHueStyle = flattenStyle(hue.props.style({ hovered: true, pressed: true }));
  assert.equal(pressedSurfaceStyle.backgroundColor, 'pressed');
  assert.equal(pressedHueStyle.backgroundColor, 'pressed');

  const surfaceHandleStyle = nodeStyle(findByTestID(renderer, 'color-picker-surface-handle'));
  const hueHandleStyle = nodeStyle(findByTestID(renderer, 'color-picker-hue-handle'));
  const surfaceCursorStyle = nodeStyle(findByTestID(renderer, 'color-picker-surface-cursor'));
  const hueThumbStyle = nodeStyle(findByTestID(renderer, 'color-picker-hue-thumb'));
  assert.equal(surfaceHandleStyle.left, 82);
  assert.equal(surfaceHandleStyle.top, 45);
  assert.equal(hueHandleStyle.left, 164);
  assert.equal(surfaceHandleStyle.transitionProperty, undefined);
  assert.equal(hueHandleStyle.transitionProperty, undefined);
  assert.equal(surfaceCursorStyle.transitionProperty, undefined);
  assert.equal(hueThumbStyle.transitionProperty, undefined);

  reducedMotion = true;
  const reducedRenderer = renderPanel();
  const reducedSurfaceStyle = flattenStyle(
    findByTestID(reducedRenderer, 'color-picker-surface').props.style({
      hovered: false,
      pressed: true,
    }),
  );
  assert.equal(reducedSurfaceStyle.transitionDuration, '0ms');

  platformOS = 'ios';
  const nativeRenderer = renderPanel();
  const nativeSurfaceStyle = flattenStyle(
    findByTestID(nativeRenderer, 'color-picker-surface').props.style({
      hovered: false,
      pressed: true,
    }),
  );
  assert.equal(nativeSurfaceStyle.transitionDuration, undefined);
  assert.equal(nativeSurfaceStyle.transitionProperty, undefined);

  const disabledRenderer = renderPanel({ disabled: true });
  const disabledSurfaceStyle = flattenStyle(
    findByTestID(disabledRenderer, 'color-picker-surface').props.style({
      hovered: true,
      pressed: true,
    }),
  );
  const disabledHueStyle = flattenStyle(
    findByTestID(disabledRenderer, 'color-picker-hue').props.style({
      hovered: true,
      pressed: true,
    }),
  );
  assert.equal(disabledSurfaceStyle.backgroundColor, 'disabled-surface');
  assert.equal(disabledHueStyle.backgroundColor, 'disabled-surface');
});

test('ColorPickerPanel maps dynamic pointer coordinates and keyboard/custom AT changes', () => {
  const changes: ColorPickerPanelModule.ColorPickerValue[] = [];
  const renderer = renderPanel({ onChange: (value) => changes.push(value) });
  const [surface, hue] = pressables(renderer);
  assert.ok(surface);
  assert.ok(hue);

  act(() => surface.props.onLayout({ nativeEvent: { layout: { width: 328 } } }));
  act(() => surface.props.onPress({ nativeEvent: { locationX: 164, locationY: 90 } }));
  assert.deepEqual(changes.at(-1), { brightness: 50, hue: 180, saturation: 50 });

  const surfaceRects = renderer.root.findAllByType(RectHost);
  assert.equal(surfaceRects[0]?.props.fill, 'hsl(180, 100%, 50%)');

  const key = { key: 'ArrowRight', preventDefault: () => undefined };
  act(() => surface.props.onKeyDown(key));
  assert.deepEqual(changes.at(-1), { brightness: 75, hue: 180, saturation: 26 });
  assert.deepEqual(surface.props.accessibilityValue, {
    max: 100,
    min: 0,
    now: 25,
    text: '채도 25, 밝기 75',
  });
  assert.deepEqual(hue.props.accessibilityValue, { max: 360, min: 0, now: 180 });
  assert.equal(surface.props.role, 'slider');
  assert.equal(hue.props.role, 'slider');
  assert.deepEqual(surface.props.accessibilityActions, [
    { name: 'increment' },
    { name: 'decrement' },
    { label: '밝기 높이기', name: 'increase-brightness' },
    { label: '밝기 낮추기', name: 'decrease-brightness' },
  ]);

  act(() => hue.props.onLayout({ nativeEvent: { layout: { width: 328 } } }));
  act(() => hue.props.onPress({ nativeEvent: { locationX: 246 } }));
  assert.deepEqual(changes.at(-1), { brightness: 75, hue: 270, saturation: 25 });

  platformOS = 'ios';
  const nativeChanges: ColorPickerPanelModule.ColorPickerValue[] = [];
  const nativeRenderer = renderPanel({ onChange: (value) => nativeChanges.push(value) });
  const nativeSurface = pressables(nativeRenderer)[0];
  assert.ok(nativeSurface);
  act(() =>
    nativeSurface.props.onAccessibilityAction({
      nativeEvent: { actionName: 'increase-brightness' },
    }),
  );
  assert.deepEqual(nativeChanges, [{ brightness: 76, hue: 180, saturation: 25 }]);
});

test('ColorPickerPanel emits continuous native drag changes for surface and hue', () => {
  platformOS = 'ios';
  const surfaceChanges: ColorPickerPanelModule.ColorPickerValue[] = [];
  const surfaceRenderer = renderPanel({ onChange: (value) => surfaceChanges.push(value) });
  const surface = pressables(surfaceRenderer)[0];
  assert.ok(surface);
  act(() => surface.props.onLayout({ nativeEvent: { layout: { width: 328 } } }));

  act(() => surface.props.onResponderGrant?.({ nativeEvent: { locationX: 82, locationY: 135 } }));
  assert.deepEqual(surfaceChanges, [{ brightness: 25, hue: 180, saturation: 25 }]);
  act(() => surface.props.onResponderMove?.({ nativeEvent: { locationX: 246, locationY: 45 } }));
  assert.deepEqual(surfaceChanges, [
    { brightness: 25, hue: 180, saturation: 25 },
    { brightness: 75, hue: 180, saturation: 75 },
  ]);

  const hueChanges: ColorPickerPanelModule.ColorPickerValue[] = [];
  const hueRenderer = renderPanel({ onChange: (value) => hueChanges.push(value) });
  const hue = pressables(hueRenderer)[1];
  assert.ok(hue);
  act(() => hue.props.onLayout({ nativeEvent: { layout: { width: 328 } } }));

  act(() => hue.props.onResponderGrant?.({ nativeEvent: { locationX: 82 } }));
  assert.deepEqual(hueChanges, [{ brightness: 75, hue: 90, saturation: 25 }]);
  act(() => hue.props.onResponderMove?.({ nativeEvent: { locationX: 246 } }));
  assert.deepEqual(hueChanges, [
    { brightness: 75, hue: 90, saturation: 25 },
    { brightness: 75, hue: 270, saturation: 25 },
  ]);
});

test('ColorPickerPanel gates surface Web drags by pointer identity and cleanup events', () => {
  const changes: ColorPickerPanelModule.ColorPickerValue[] = [];
  const renderer = renderPanel({ onChange: (value) => changes.push(value) });
  let surface = findByTestID(renderer, 'color-picker-surface');
  const capturedPointerIds: number[] = [];
  const currentTarget = {
    setPointerCapture: (pointerId: number) => capturedPointerIds.push(pointerId),
  };

  act(() =>
    surface.props.onPointerDown?.({
      currentTarget,
      nativeEvent: { button: 0, isPrimary: false, locationX: 246, locationY: 45, pointerId: 2 },
    }),
  );
  assert.deepEqual(changes, []);
  assert.deepEqual(capturedPointerIds, []);
  act(() =>
    surface.props.onPointerDown?.({
      currentTarget,
      nativeEvent: { button: 2, isPrimary: true, locationX: 246, locationY: 45, pointerId: 3 },
    }),
  );
  assert.deepEqual(changes, []);
  assert.deepEqual(capturedPointerIds, []);

  act(() =>
    surface.props.onPointerDown?.({
      currentTarget,
      nativeEvent: { button: 0, isPrimary: true, locationX: 82, locationY: 135, pointerId: 11 },
    }),
  );
  assert.deepEqual(changes, [{ brightness: 25, hue: 180, saturation: 25 }]);
  assert.deepEqual(capturedPointerIds, [11]);
  act(() =>
    surface.props.onPointerMove?.({
      nativeEvent: { locationX: 246, locationY: 45, pointerId: 12 },
    }),
  );
  assert.equal(changes.length, 1);
  act(() => surface.props.onPointerUp?.({ nativeEvent: { pointerId: 12 } }));
  act(() =>
    surface.props.onPointerMove?.({
      nativeEvent: { locationX: 246, locationY: 45, pointerId: 11 },
    }),
  );
  assert.deepEqual(changes.at(-1), { brightness: 75, hue: 180, saturation: 75 });
  act(() => surface.props.onPointerUp?.({ nativeEvent: { pointerId: 11 } }));
  act(() =>
    surface.props.onPointerMove?.({
      nativeEvent: { locationX: 82, locationY: 135, pointerId: 11 },
    }),
  );
  assert.equal(changes.length, 2);

  surface = findByTestID(renderer, 'color-picker-surface');
  act(() =>
    surface.props.onPointerDown?.({
      currentTarget,
      nativeEvent: { button: 0, isPrimary: true, locationX: 82, locationY: 135, pointerId: 13 },
    }),
  );
  act(() => surface.props.onPointerCancel?.({ nativeEvent: { pointerId: 12 } }));
  act(() =>
    surface.props.onPointerMove?.({
      nativeEvent: { locationX: 246, locationY: 45, pointerId: 13 },
    }),
  );
  assert.deepEqual(changes.at(-1), { brightness: 75, hue: 180, saturation: 75 });
  act(() => surface.props.onPointerCancel?.({ nativeEvent: { pointerId: 13 } }));
  act(() =>
    surface.props.onPointerMove?.({
      nativeEvent: { locationX: 246, locationY: 45, pointerId: 13 },
    }),
  );
  assert.equal(changes.length, 4);

  act(() =>
    surface.props.onPointerDown?.({
      currentTarget,
      nativeEvent: { button: 0, isPrimary: true, locationX: 82, locationY: 135, pointerId: 14 },
    }),
  );
  act(() => surface.props.onLostPointerCapture?.({ nativeEvent: { pointerId: 14 } }));
  act(() =>
    surface.props.onPointerMove?.({
      nativeEvent: { locationX: 246, locationY: 45, pointerId: 14 },
    }),
  );
  assert.equal(changes.length, 5);

  const disabledCapturedPointerIds: number[] = [];
  const disabledRenderer = renderPanel({
    disabled: true,
    onChange: () => assert.fail('disabled surface started a pointer drag'),
  });
  const disabledSurface = findByTestID(disabledRenderer, 'color-picker-surface');
  act(() =>
    disabledSurface.props.onPointerDown?.({
      currentTarget: {
        setPointerCapture: (pointerId: number) => disabledCapturedPointerIds.push(pointerId),
      },
      nativeEvent: { button: 0, isPrimary: true, locationX: 246, locationY: 45, pointerId: 15 },
    }),
  );
  assert.deepEqual(disabledCapturedPointerIds, []);
});

test('ColorPickerPanel gates hue Web drags by pointer identity', () => {
  const changes: ColorPickerPanelModule.ColorPickerValue[] = [];
  const renderer = renderPanel({ onChange: (value) => changes.push(value) });
  const hue = findByTestID(renderer, 'color-picker-hue');
  const capturedPointerIds: number[] = [];
  const currentTarget = {
    setPointerCapture: (pointerId: number) => capturedPointerIds.push(pointerId),
  };

  act(() =>
    hue.props.onPointerDown?.({
      currentTarget,
      nativeEvent: { button: 2, isPrimary: true, locationX: 82, pointerId: 21 },
    }),
  );
  assert.deepEqual(changes, []);
  assert.deepEqual(capturedPointerIds, []);
  act(() =>
    hue.props.onPointerDown?.({
      currentTarget,
      nativeEvent: { button: 0, isPrimary: true, locationX: 82, pointerId: 22 },
    }),
  );
  assert.deepEqual(changes, [{ brightness: 75, hue: 90, saturation: 25 }]);
  act(() => hue.props.onPointerMove?.({ nativeEvent: { locationX: 246, pointerId: 21 } }));
  assert.equal(changes.length, 1);
  act(() => hue.props.onPointerMove?.({ nativeEvent: { locationX: 246, pointerId: 22 } }));
  assert.deepEqual(changes.at(-1), { brightness: 75, hue: 270, saturation: 25 });
  act(() => hue.props.onPointerUp?.({ nativeEvent: { pointerId: 21 } }));
  act(() => hue.props.onPointerUp?.({ nativeEvent: { pointerId: 22 } }));
  act(() => hue.props.onPointerMove?.({ nativeEvent: { locationX: 82, pointerId: 22 } }));
  assert.equal(changes.length, 2);
});

test('ColorPickerPanel keeps externally controlled channels during a Web surface drag', () => {
  const changes: ColorPickerPanelModule.ColorPickerValue[] = [];
  const onChange = (value: ColorPickerPanelModule.ColorPickerValue) => changes.push(value);
  let controlledValue: ColorPickerPanelModule.ColorPickerValue = {
    brightness: 40,
    hue: 120,
    saturation: 20,
  };
  const renderer = renderPanel({ onChange, value: controlledValue });
  let surface = findByTestID(renderer, 'color-picker-surface');
  const currentTarget = { setPointerCapture: () => undefined };

  act(() =>
    surface.props.onPointerDown?.({
      currentTarget,
      nativeEvent: { button: 0, isPrimary: true, locationX: 82, locationY: 90, pointerId: 31 },
    }),
  );
  assert.deepEqual(changes.at(-1), { brightness: 50, hue: 120, saturation: 25 });

  controlledValue = { brightness: 50, hue: 300, saturation: 25 };
  act(() =>
    renderer.update(
      createElement(colorPickerPanelModule!.ColorPickerPanel, {
        onCancel: () => undefined,
        onChange,
        onCommit: () => undefined,
        value: controlledValue,
      }),
    ),
  );
  surface = findByTestID(renderer, 'color-picker-surface');
  act(() =>
    surface.props.onPointerMove?.({
      nativeEvent: { locationX: 246, locationY: 45, pointerId: 31 },
    }),
  );
  assert.deepEqual(changes.at(-1), { brightness: 75, hue: 300, saturation: 75 });
});

test('ColorPickerPanel derives every color surface from value and converts valid HEX input', () => {
  const changes: ColorPickerPanelModule.ColorPickerValue[] = [];
  const renderer = renderPanel({
    onChange: (value) => changes.push(value),
    value: { brightness: 100, hue: 0, saturation: 100 },
  });

  assert.equal(
    nodeStyle(findByTestID(renderer, 'color-picker-current-swatch')).backgroundColor,
    '#FF0000',
  );
  const aaTexts = renderer.root
    .findAllByType(TextHost)
    .filter((node) => node.props.children === 'Aa');
  assert.equal(nodeStyle(aaTexts[0]!).color, '#FF0000');
  assert.equal(
    nodeStyle(findByTestID(renderer, 'color-picker-hue-thumb')).backgroundColor,
    '#FF0000',
  );

  const field = renderer.root.findByType(TextFieldHost);
  assert.equal(field.props.value, '#FF0000');
  act(() => field.props.onChangeText('#123456'));
  assert.deepEqual(changes, [{ brightness: 33.73, hue: 210, saturation: 79.07 }]);
});

test('ColorPickerPanel keeps incomplete HEX as a draft and restores the controlled color on blur', () => {
  const renderer = renderPanel({ value: { brightness: 100, hue: 0, saturation: 100 } });
  let field = renderer.root.findByType(TextFieldHost);

  assert.equal(typeof field.props.onFocus, 'function');
  assert.equal(typeof field.props.onBlur, 'function');
  act(() => field.props.onFocus({}));
  act(() => field.props.onChangeText('#12'));
  field = renderer.root.findByType(TextFieldHost);
  assert.equal(field.props.value, '#12');

  act(() => field.props.onBlur({}));
  assert.equal(renderer.root.findByType(TextFieldHost).props.value, '#FF0000');
});

test('ColorPickerPanel does not emit at controlled boundaries or after a matching pointer value', () => {
  const boundaryChanges: ColorPickerPanelModule.ColorPickerValue[] = [];
  const boundaryRenderer = renderPanel({
    onChange: (value) => boundaryChanges.push(value),
    value: { brightness: 50, hue: 180, saturation: 100 },
  });
  const boundarySurface = pressables(boundaryRenderer)[0];
  assert.ok(boundarySurface);
  act(() =>
    boundarySurface.props.onKeyDown({ key: 'ArrowRight', preventDefault: () => undefined }),
  );
  assert.deepEqual(boundaryChanges, []);

  let controlledValue: ColorPickerPanelModule.ColorPickerValue = {
    brightness: 50,
    hue: 180,
    saturation: 49,
  };
  const midpointChanges: ColorPickerPanelModule.ColorPickerValue[] = [];
  const midpointRenderer = renderPanel({
    onChange: (value) => {
      midpointChanges.push(value);
      controlledValue = value;
    },
    value: controlledValue,
  });
  const midpointSurface = pressables(midpointRenderer)[0];
  assert.ok(midpointSurface);
  act(() =>
    midpointSurface.props.onKeyDown({ key: 'ArrowRight', preventDefault: () => undefined }),
  );
  assert.deepEqual(midpointChanges, [{ brightness: 50, hue: 180, saturation: 50 }]);
  act(() =>
    midpointRenderer.update(
      createElement(colorPickerPanelModule!.ColorPickerPanel, {
        onCancel: () => undefined,
        onChange: (value: ColorPickerPanelModule.ColorPickerValue) => {
          midpointChanges.push(value);
          controlledValue = value;
        },
        onCommit: () => undefined,
        value: controlledValue,
      }),
    ),
  );
  const updatedMidpointSurface = pressables(midpointRenderer)[0];
  assert.ok(updatedMidpointSurface);
  act(() =>
    updatedMidpointSurface.props.onPress({ nativeEvent: { locationX: 164, locationY: 90 } }),
  );
  assert.deepEqual(midpointChanges, [{ brightness: 50, hue: 180, saturation: 50 }]);
});

test('ColorPickerPanel forwards Cancel and Apply with the controlled value', () => {
  const commits: ColorPickerPanelModule.ColorPickerValue[] = [];
  let cancels = 0;
  const renderer = renderPanel({
    onCancel: () => cancels++,
    onCommit: (value) => commits.push(value),
  });
  const field = renderer.root.findByType(TextFieldHost);
  const buttons = renderer.root.findAllByType(ButtonHost);

  act(() => buttons.find((button) => button.props.children === '취소')!.props.onPress());
  act(() => buttons.find((button) => button.props.children === '적용')!.props.onPress());

  assert.equal(cancels, 1);
  assert.deepEqual(commits, [{ brightness: 75, hue: 180, saturation: 25 }]);
  assert.equal(field.props.accessibilityLabel, 'HEX 색상');
});

test('disabled ColorPickerPanel blocks geometry, HEX, cancel, and commit changes', () => {
  let changed = false;
  let cancelled = false;
  let committed = false;
  const renderer = renderPanel({
    disabled: true,
    onCancel: () => {
      cancelled = true;
    },
    onChange: () => {
      changed = true;
    },
    onCommit: () => {
      committed = true;
    },
  });
  const [surface, hue] = pressables(renderer);
  const field = renderer.root.findByType(TextFieldHost);
  const buttons = renderer.root.findAllByType(ButtonHost);

  act(() => surface.props.onPress({ nativeEvent: { locationX: 180, locationY: 0 } }));
  act(() => hue.props.onPress({ nativeEvent: { locationX: 180 } }));
  act(() => field.props.onChangeText('#FFFFFF'));
  act(() => buttons.find((button) => button.props.children === '취소')!.props.onPress());
  act(() => buttons.find((button) => button.props.children === '적용')!.props.onPress());

  assert.equal(changed, false);
  assert.equal(cancelled, false);
  assert.equal(committed, false);
  assert.equal(field.props.editable, false);
  assert.equal(
    buttons.every((button) => button.props.disabled === true),
    true,
  );
  assert.equal(surface.props['aria-disabled'], true);
  assert.equal(hue.props['aria-disabled'], true);
});
