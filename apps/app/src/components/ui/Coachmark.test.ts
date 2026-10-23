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
    backgroundElevated: 'background',
    borderDefault: 'border',
    foregroundPrimary: 'foreground',
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
    placement: 'bottom',
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
