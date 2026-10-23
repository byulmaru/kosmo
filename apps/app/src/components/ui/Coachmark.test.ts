import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode, RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as CoachmarkModule from './Coachmark';

const mockModule = (specifier: string, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let dimensions = { height: 0, width: 0 };
const motionInputs: boolean[] = [];
let placement: 'top' | 'bottom' = 'bottom';

mockModule('react-native', {
  Animated: { View: 'AnimatedView' },
  Platform: { OS: 'web' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: {
    absoluteFill: {},
    create: <T>(styles: T) => styles,
  },
  Text: 'Text',
  useWindowDimensions: () => ({ height: 800, width: 400 }),
  View: 'View',
});
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
});
mockModule('@/theme/ThemeProvider', {
  useElevation: () => ({ overlay: {} }),
  useTheme: () => ({
    actionPrimaryBase: 'primary-base',
    backgroundElevated: 'background',
    borderDefault: 'border',
    borderStrong: 'border-strong',
    backgroundSurface: 'surface',
    foregroundPrimary: 'foreground',
    foregroundSecondary: 'foreground-secondary',
    overlayScrim: 'scrim',
    stateFocusRing: 'focus',
  }),
});
mockModule('@/theme/tokens', {
  borderWidths: { 0: 0, 1: 1, 2: 2 },
  iconSizes: { 16: 16 },
  layoutRecipes: { dialogActions: { gap: 4 } },
  radius: { 0: 0, 8: 8, 16: 16 },
  space: { 0: 0, 4: 4, 8: 8, 12: 12, 16: 16 },
  textStyles: { uiCopyM: {}, uiCopyS: {}, uiLabelM: {}, uiLabelS: {} },
});
mockModule('@/theme/useOverlayMotion', {
  useOverlayMotion: (visible: boolean) => {
    motionInputs.push(visible);
    return {
      entered: visible,
      mounted: visible,
      progress: { interpolate: () => 1 },
    };
  },
});
mockModule('./Button', {
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement('Button', props, children),
});
mockModule('./ModalSheetHost', {
  ModalSheetHost: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement('Modal', props, children),
});
mockModule('./Overlay', { useOverlayLifecycle: () => ({}) });
mockModule('./coachmarkPosition', {
  getCoachmarkPosition: () => ({
    arrowLeft: 30,
    left: 20,
    maxHeight: 300,
    placement,
    top: 20,
  }),
});

const anchor = {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) =>
    callback(0, 0, dimensions.width, dimensions.height),
};
const anchorRef = { current: anchor } as unknown as RefObject<NativeView | null>;

let coachmarkModule: typeof CoachmarkModule;

before(async () => {
  const globalWithFrames = globalThis as typeof globalThis & {
    cancelAnimationFrame: (handle: number) => void;
    requestAnimationFrame: (callback: (time: number) => void) => number;
  };
  globalWithFrames.requestAnimationFrame = (callback) => {
    callback(0);
    return 0;
  };
  globalWithFrames.cancelAnimationFrame = () => {};
  coachmarkModule = await import('./Coachmark');
});

afterEach(() => {
  dimensions = { height: 0, width: 0 };
  motionInputs.length = 0;
  placement = 'bottom';
});

test('delayed target starts motion only after measurement and exits after visibility ends', async () => {
  let shown = 0;
  let exited = 0;
  let renderer!: ReactTestRenderer;
  const renderCoachmark = (visible: boolean) =>
    createElement(coachmarkModule.Coachmark, {
      anchorRef,
      description: '대상을 확인하세요.',
      onClose: () => {},
      onComplete: () => {},
      onExited: () => {
        exited += 1;
      },
      onShown: () => {
        shown += 1;
      },
      visible,
    });

  await act(async () => {
    renderer = create(renderCoachmark(true));
  });
  assert.equal(motionInputs.at(-1), false);
  assert.equal(renderer.root.findByType('Modal' as never).props.visible, false);
  assert.equal(shown, 0);

  dimensions = { height: 40, width: 120 };
  await act(async () => renderer.update(renderCoachmark(true)));
  assert.equal(motionInputs.at(-1), true);
  assert.equal(renderer.root.findByType('Modal' as never).props.visible, true);

  const surface = renderer.root.findByProps({ testID: 'coachmark-surface' });
  const body = renderer.root.findByProps({ testID: 'coachmark-body' });
  await act(async () => {
    surface.props.onLayout({ nativeEvent: { layout: { width: 180 } } });
    body.props.onContentSizeChange(0, 48);
  });
  assert.equal(shown, 1);

  await act(async () => renderer.update(renderCoachmark(false)));
  assert.equal(exited, 1);
  await act(async () => renderer.unmount());
});

test('onExited only fires after an actual exit, including an unready target exit', async () => {
  let exited = 0;
  let renderer!: ReactTestRenderer;
  const onExited = () => {
    exited += 1;
  };
  const renderCoachmark = (visible: boolean, callback = onExited) =>
    createElement(coachmarkModule.Coachmark, {
      anchorRef,
      description: '대상을 확인하세요.',
      onClose: () => {},
      onComplete: () => {},
      onExited: callback,
      visible,
    });

  await act(async () => {
    renderer = create(renderCoachmark(false));
  });
  assert.equal(exited, 0);

  await act(async () => renderer.update(renderCoachmark(false, () => (exited += 10))));
  assert.equal(exited, 0);

  await act(async () => renderer.update(renderCoachmark(true)));
  assert.equal(renderer.root.findByType('Modal' as never).props.visible, false);
  await act(async () => renderer.update(renderCoachmark(false)));
  assert.equal(exited, 1);

  dimensions = { height: 40, width: 120 };
  await act(async () => renderer.update(renderCoachmark(true)));
  assert.equal(renderer.root.findByType('Modal' as never).props.visible, true);
  await act(async () => renderer.update(renderCoachmark(false)));
  assert.equal(exited, 2);

  await act(async () => renderer.update(renderCoachmark(false, () => (exited += 10))));
  assert.equal(exited, 2);
  await act(async () => renderer.unmount());
});

test('exit completes when the live anchor unmounts with the hidden presentation', async () => {
  dimensions = { height: 40, width: 120 };
  let exited = 0;
  const liveAnchorRef = { current: anchor } as unknown as RefObject<NativeView | null>;
  let renderer!: ReactTestRenderer;
  const renderCoachmark = (visible: boolean) =>
    createElement(coachmarkModule.Coachmark, {
      anchorRef: liveAnchorRef,
      description: '대상을 확인하세요.',
      onClose: () => {},
      onComplete: () => {},
      onExited: () => {
        exited += 1;
      },
      visible,
    });

  await act(async () => {
    renderer = create(renderCoachmark(true));
  });
  liveAnchorRef.current = null;
  await act(async () => renderer.update(renderCoachmark(false)));
  assert.equal(exited, 1);
  await act(async () => renderer.unmount());
});

test('renders validated multi-step progress with one accessible progressbar', async () => {
  dimensions = { height: 40, width: 120 };
  let renderer!: ReactTestRenderer;
  const renderCoachmark = (progress?: { current: number; total: number }) =>
    createElement(coachmarkModule.Coachmark, {
      anchorRef,
      description: '다음 안내를 확인하세요.',
      onClose: () => {},
      onComplete: () => {},
      progress,
      visible: true,
    });

  await act(async () => {
    renderer = create(renderCoachmark({ current: 2, total: 4 }));
  });
  let progressbar = renderer.root.findByProps({ accessibilityRole: 'progressbar' });
  assert.deepEqual(progressbar.props.accessibilityValue, { max: 4, min: 1, now: 2 });
  assert.equal(progressbar.props['aria-valuemax'], 4);
  assert.equal(progressbar.props['aria-valuemin'], 1);
  assert.equal(progressbar.props['aria-valuenow'], 2);
  let segments = renderer.root.findAllByProps({ testID: 'coachmark-progress-segment' });
  assert.equal(segments.length, 4);
  assert.equal(segments[0]?.props.style[1].backgroundColor, 'primary-base');
  assert.equal(segments[1]?.props.style[1].backgroundColor, 'primary-base');
  assert.equal(segments[2]?.props.style[1].backgroundColor, 'border');
  assert.equal(segments[3]?.props.style[1].backgroundColor, 'border');

  await act(async () => renderer.update(renderCoachmark({ current: 3, total: 4 })));
  progressbar = renderer.root.findByProps({ accessibilityRole: 'progressbar' });
  assert.deepEqual(progressbar.props.accessibilityValue, { max: 4, min: 1, now: 3 });
  assert.equal(progressbar.props['aria-valuenow'], 3);
  segments = renderer.root.findAllByProps({ testID: 'coachmark-progress-segment' });
  assert.equal(segments[2]?.props.style[1].backgroundColor, 'primary-base');

  await act(async () => renderer.update(renderCoachmark({ current: 1, total: 1 })));
  assert.equal(renderer.root.findAllByProps({ accessibilityRole: 'progressbar' }).length, 0);
  await act(async () => renderer.update(renderCoachmark({ current: 0, total: 4 })));
  assert.equal(renderer.root.findAllByProps({ accessibilityRole: 'progressbar' }).length, 0);
  await act(async () => renderer.update(renderCoachmark({ current: 1.5, total: 4 })));
  assert.equal(renderer.root.findAllByProps({ accessibilityRole: 'progressbar' }).length, 0);
  await act(async () => renderer.unmount());
});

test('draws the coachmark arrow with the surface border on both placements', async () => {
  dimensions = { height: 40, width: 120 };
  let renderer!: ReactTestRenderer;
  const renderCoachmark = () =>
    createElement(coachmarkModule.Coachmark, {
      anchorRef,
      description: '대상을 확인하세요.',
      onClose: () => {},
      onComplete: () => {},
      visible: true,
    });

  await act(async () => {
    renderer = create(renderCoachmark());
  });
  let arrow = renderer.root.findByProps({ testID: 'coachmark-arrow' });
  assert.equal(arrow.props.style[1].borderColor, 'border');
  assert.equal(arrow.props.style[2].borderTopWidth, 1);
  assert.equal(arrow.props.style[2].borderLeftWidth, 1);

  placement = 'top';
  await act(async () => renderer.update(renderCoachmark()));
  arrow = renderer.root.findByProps({ testID: 'coachmark-arrow' });
  assert.equal(arrow.props.style[1].borderColor, 'border');
  assert.equal(arrow.props.style[2].borderBottomWidth, 1);
  assert.equal(arrow.props.style[2].borderRightWidth, 1);

  await act(async () => renderer.unmount());
});
