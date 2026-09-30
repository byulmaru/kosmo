import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, forwardRef, useImperativeHandle, useRef } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { PostMediaItem } from '@/components/post/PostMediaImage';
import type { PostMediaViewerSurfaceProps } from './PostMediaViewerSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);

const mockPlatform: { OS: string } = { OS: 'web' };
let mockWindowHeight = 844;
let mockReducedMotion = false;
const scrollCalls: Array<{ animated?: boolean; x?: number; y?: number }> = [];
const zoomToCalls: Array<{
  animated?: boolean;
  height: number;
  width: number;
  x: number;
  y: number;
}> = [];
const MockImage = Object.assign((props: Record<string, unknown>) => createElement('Image', props), {
  getSize: (_url: string, onSuccess: (width: number, height: number) => void) =>
    onSuccess(1600, 900),
});
const MockScrollView = forwardRef<
  {
    scrollTo: (options: { animated?: boolean; x?: number; y?: number }) => void;
    scrollResponderZoomTo: (
      rect: {
        animated?: boolean;
        height: number;
        width: number;
        x: number;
        y: number;
      },
      animated?: boolean,
    ) => void;
  },
  Record<string, unknown>
>((props, ref) => {
  useImperativeHandle(
    ref,
    () => ({
      scrollTo: (options) => scrollCalls.push(options),
      scrollResponderZoomTo: (rect, animated) => zoomToCalls.push({ ...rect, animated }),
    }),
    [],
  );
  return createElement('ScrollView', props, props.children as ReactNode);
});
const getToast = () =>
  renderer?.root.findAll((node) => typeof node.type === 'function' && node.type.name === 'Toast')[0]
    ?.props ?? null;
const getToastRetry = () => getToast()?.action.onPress;
mock.module('@/theme/useOverlayMotion', {
  exports: {
    useToastMotion: (visible: boolean) => ({
      mounted: visible,
      progress: { interpolate: () => 0 },
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('react-native', {
  exports: {
    ActivityIndicator: 'ActivityIndicator',
    Animated: { View: 'AnimatedView' },
    Image: MockImage,
    Platform: mockPlatform,
    Pressable: (props: Record<string, unknown>) => {
      const children = props.children;
      return createElement(
        'Pressable',
        props,
        typeof children === 'function' ? children({ pressed: false }) : (children as ReactNode),
      );
    },
    ScrollView: MockScrollView,
    StyleSheet: {
      absoluteFillObject: {
        bottom: 0,
        left: 0,
        position: 'absolute',
        right: 0,
        top: 0,
      },
      create: <T>(styles: T) => styles,
    },
    Text: 'Text',
    View: 'View',
    useWindowDimensions: () => ({ height: mockWindowHeight, width: 390 }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/ui/IconButton', {
  exports: {
    IconButton: (props: Record<string, unknown>) => createElement('IconButton', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/theme/ThemeProvider', {
  exports: {
    useElevation: () => ({ floating: {} }),
    useReducedMotion: () => mockReducedMotion,
    useTheme: () => ({ backgroundCanvas: '#ffffff' }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

type GestureCallback = (...args: unknown[]) => void;
type FakeGesture = {
  enabled: (value: boolean) => FakeGesture;
  enabledValue?: boolean;
  gestures?: FakeGesture[];
  externalGestures?: FakeGesture[];
  maxPointers: (value: number) => FakeGesture;
  maxPointersValue?: number;
  name: string;
  numberOfTaps: (value: number) => FakeGesture;
  numberOfTapsValue?: number;
  onEnd: (callback: GestureCallback) => FakeGesture;
  onTouchesDown: (callback: GestureCallback) => FakeGesture;
  onFinalize: (callback: GestureCallback) => FakeGesture;
  onStart: (callback: GestureCallback) => FakeGesture;
  onUpdate: (callback: GestureCallback) => FakeGesture;
  simultaneousWithExternalGesture: (...gestures: FakeGesture[]) => FakeGesture;
  onFinalizeCallback?: GestureCallback;
  onEndCallback?: GestureCallback;
  onTouchesDownCallback?: GestureCallback;
  onStartCallback?: GestureCallback;
  onUpdateCallback?: GestureCallback;
};
function fakeGesture(name: string): FakeGesture {
  const gesture = {
    enabled: (value: boolean) => {
      gesture.enabledValue = value;
      return gesture;
    },
    maxPointers: (value: number) => {
      gesture.maxPointersValue = value;
      return gesture;
    },
    numberOfTaps: (value: number) => {
      gesture.numberOfTapsValue = value;
      return gesture;
    },
    simultaneousWithExternalGesture: (...gestures: FakeGesture[]) => {
      gesture.externalGestures = gestures;
      return gesture;
    },
    name,
    onEnd: (callback: GestureCallback) => {
      gesture.onEndCallback = callback;
      return gesture;
    },
    onTouchesDown: (callback: GestureCallback) => {
      gesture.onTouchesDownCallback = callback;
      return gesture;
    },
    onFinalize: (callback: GestureCallback) => {
      gesture.onFinalizeCallback = callback;
      return gesture;
    },
    onStart: (callback: GestureCallback) => {
      gesture.onStartCallback = callback;
      return gesture;
    },
    onUpdate: (callback: GestureCallback) => {
      gesture.onUpdateCallback = callback;
      return gesture;
    },
  } as FakeGesture;
  return gesture;
}

mock.module('react-native-gesture-handler', {
  exports: {
    Gesture: {
      Pan: () => fakeGesture('pan'),
      Pinch: () => fakeGesture('pinch'),
      Tap: () => fakeGesture('tap'),
      Native: () => fakeGesture('native'),
      Simultaneous: (...gestures: FakeGesture[]) => ({
        ...fakeGesture('simultaneous'),
        gestures,
      }),
    },
    GestureDetector: (props: Record<string, unknown>) =>
      createElement('GestureDetector', props, props.children as ReactNode),
    GestureHandlerRootView: (props: Record<string, unknown>) =>
      createElement('GestureHandlerRootView', props, props.children as ReactNode),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('react-native-reanimated', {
  exports: {
    default: { View: 'AnimatedView' },
    runOnJS: (callback: GestureCallback) => callback,
    runOnUI: (callback: GestureCallback) => callback,
    useAnimatedStyle: (callback: () => unknown) => callback,
    useSharedValue: <T>(value: T) => useRef({ value }).current,
  },
} as unknown as Parameters<typeof mock.module>[1]);

const icon = (type: string) => (props: Record<string, unknown>) => createElement(type, props);

mock.module(require.resolve('lucide-react-native'), {
  exports: {
    ChevronLeftIcon: icon('ChevronLeftIcon'),
    ChevronRightIcon: icon('ChevronRightIcon'),
    XIcon: icon('XIcon'),
  },
} as unknown as Parameters<typeof mock.module>[1]);

type SurfaceProps = Readonly<{
  contentRevisionId: string | null;
  compactDetail?: ReactNode;
  contextRail?: ReactNode;
  currentIndex: number;
  media: readonly PostMediaItem[];
  onClose: () => void;
  onIndexChange: (index: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  onRetry: () => void;
  presentation: 'compact' | 'wide';
  style?: Record<string, unknown>;
  viewState: 'ready' | 'loading' | 'error' | 'unavailable';
}>;

let PostMediaViewerSurface: ComponentType<SurfaceProps> | undefined;
let AndroidZoomImage: ComponentType<Record<string, unknown>> | undefined;
let AndroidPagerGesture: ComponentType<Record<string, unknown>> | undefined;
let IOSDoubleTap: ComponentType<Record<string, unknown>> | undefined;
type IOSDoubleTapTestProps = {
  children?: ReactNode;
  enabled: boolean;
  onDoubleTap: (point: { x: number; y: number }) => void;
};
let iosDoubleTapProps: IOSDoubleTapTestProps | undefined;
let renderer: ReactTestRenderer | null = null;
let androidRenderer: ReactTestRenderer | null = null;

mock.module(require.resolve('./PostMediaViewerIOSDoubleTap.tsx'), {
  exports: {
    IOSDoubleTap: (props: IOSDoubleTapTestProps) => {
      iosDoubleTapProps = props;
      return props.children ?? null;
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

before(async () => {
  const androidZoomModule = await import('./PostMediaViewerAndroidZoom.android');
  // Node does not resolve Metro's .android suffix; execute the actual platform module.
  mock.module(require.resolve('./PostMediaViewerAndroidZoom.tsx'), {
    exports: androidZoomModule,
  } as unknown as Parameters<typeof mock.module>[1]);
  PostMediaViewerSurface = (await import('./PostMediaViewerSurface'))
    .PostMediaViewerSurface as ComponentType<SurfaceProps>;
  AndroidZoomImage = androidZoomModule.AndroidZoomImage as ComponentType<Record<string, unknown>>;
  AndroidPagerGesture = androidZoomModule.AndroidPagerGesture as ComponentType<
    Record<string, unknown>
  >;
  IOSDoubleTap = (await import('./PostMediaViewerIOSDoubleTap.ios')).IOSDoubleTap as ComponentType<
    Record<string, unknown>
  >;
});

afterEach(async () => {
  mockPlatform.OS = 'web';
  mockWindowHeight = 844;
  mockReducedMotion = false;
  scrollCalls.length = 0;
  zoomToCalls.length = 0;
  iosDoubleTapProps = undefined;
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  if (androidRenderer) {
    await act(async () => androidRenderer?.unmount());
    androidRenderer = null;
  }
});

describe('PostMediaViewerSurface', () => {
  it('Android native zoom locks paging, clamps one-pointer pan, and releases on reset', async () => {
    const NativeZoom = AndroidZoomImage;
    const PagerGesture = AndroidPagerGesture;
    assert.ok(NativeZoom);
    assert.ok(PagerGesture);
    const zoomedChanges: boolean[] = [];
    const props = {
      children: createElement('View', { style: { height: 585, width: 390 } }),
      onZoomedChange: (zoomed: boolean) => zoomedChanges.push(zoomed),
      status: 'ready' as const,
      viewportSize: { height: 600, width: 390 },
    };
    await act(async () => {
      androidRenderer = create(createElement(PagerGesture, null, createElement(NativeZoom, props)));
    });
    const nativeRenderer = androidRenderer;
    assert.ok(nativeRenderer);
    assert.equal(
      nativeRenderer.root
        .findAll((node) => String(node.type) === 'GestureDetector')
        .some((node) => node.props.gesture.name === 'native'),
      true,
    );
    const image = nativeRenderer.root.findAll((node) => String(node.type) === 'AnimatedView')[0];
    assert.ok(image);
    await act(async () =>
      image.props.onLayout({ nativeEvent: { layout: { height: 585, width: 390 } } }),
    );

    const detector = () =>
      nativeRenderer.root
        .findAll((node) => String(node.type) === 'GestureDetector')
        .find((node) => Array.isArray(node.props.gesture?.gestures));
    const gestures = () => detector()?.props.gesture.gestures as FakeGesture[];
    const pinch = () => gestures()?.find((gesture) => gesture.name === 'pinch');
    assert.equal(pinch()?.externalGestures?.[0]?.name, 'native');
    await act(async () => pinch()?.onTouchesDownCallback?.({ numberOfTouches: 1 }));
    assert.deepEqual(zoomedChanges, []);
    await act(async () => pinch()?.onTouchesDownCallback?.({ numberOfTouches: 2 }));
    assert.deepEqual(zoomedChanges, [true]);
    await act(async () => pinch()?.onStartCallback?.({ focalX: 195, focalY: 300 }));
    assert.deepEqual(zoomedChanges, [true]);
    await act(async () => pinch()?.onUpdateCallback?.({ focalX: 195, focalY: 300, scale: 99 }));
    const maxScaleStyle = image.props.style[1] as () => {
      transform: Array<Record<string, number>>;
    };
    assert.equal(maxScaleStyle().transform[2]?.scale, 4);
    await act(async () => pinch()?.onUpdateCallback?.({ focalX: 195, focalY: 300, scale: 2 }));
    await act(async () => pinch()?.onFinalizeCallback?.({}, false));
    assert.deepEqual(zoomedChanges, [true]);

    const pan = () => gestures()?.find((gesture) => gesture.name === 'pan');
    const tap = () => gestures()?.find((gesture) => gesture.name === 'tap');
    assert.equal(pan()?.maxPointersValue, 1);
    assert.equal(pan()?.enabledValue, true);
    assert.equal(tap()?.numberOfTapsValue, 2);
    assert.equal(tap()?.externalGestures?.[0]?.name, 'native');
    await act(async () => pan()?.onStartCallback?.({}));
    await act(async () => pan()?.onUpdateCallback?.({ translationX: 9999, translationY: -9999 }));
    const animatedStyle = image.props.style[1] as () => {
      transform: Array<Record<string, number>>;
    };
    assert.deepEqual(animatedStyle().transform, [
      { translateX: 195 },
      { translateY: -285 },
      { scale: 2 },
    ]);
    await act(async () => tap()?.onEndCallback?.({ x: 300, y: 100 }, true));
    assert.deepEqual(animatedStyle().transform, [
      { translateX: 285 },
      { translateY: -370 },
      { scale: 4 },
    ]);
    assert.deepEqual(zoomedChanges, [true]);
    await act(async () => tap()?.onEndCallback?.({ x: 300, y: 100 }, true));
    assert.deepEqual(animatedStyle().transform, [
      { translateX: 0 },
      { translateY: 0 },
      { scale: 1 },
    ]);
    assert.deepEqual(zoomedChanges, [true, false]);
    await act(async () => tap()?.onEndCallback?.({ x: 50, y: 50 }, true));
    assert.deepEqual(animatedStyle().transform, [
      { translateX: 145 },
      { translateY: 250 },
      { scale: 2 },
    ]);
    await act(async () => tap()?.onEndCallback?.({ x: 340, y: 550 }, true));
    assert.deepEqual(animatedStyle().transform, [
      { translateX: 145 },
      { translateY: 250 },
      { scale: 4 },
    ]);
    await act(async () => tap()?.onEndCallback?.({ x: 200, y: 300 }, true));
    assert.deepEqual(animatedStyle().transform, [
      { translateX: 0 },
      { translateY: 0 },
      { scale: 1 },
    ]);
    await act(async () => tap()?.onEndCallback?.({ x: 340, y: 550 }, true));
    assert.deepEqual(animatedStyle().transform, [
      { translateX: -145 },
      { translateY: -250 },
      { scale: 2 },
    ]);
    await act(async () => tap()?.onEndCallback?.({ x: 340, y: 550 }, true));
    assert.deepEqual(animatedStyle().transform, [
      { translateX: -435 },
      { translateY: -750 },
      { scale: 4 },
    ]);
    await act(async () => tap()?.onEndCallback?.({ x: 200, y: 300 }, true));
    assert.deepEqual(animatedStyle().transform, [
      { translateX: 0 },
      { translateY: 0 },
      { scale: 1 },
    ]);

    await act(async () => {
      nativeRenderer.update(
        createElement(
          PagerGesture,
          null,
          createElement(NativeZoom, { ...props, status: 'loading' as const }),
        ),
      );
    });
    assert.deepEqual(zoomedChanges.at(-1), false);

    await act(async () => {
      nativeRenderer.update(createElement(PagerGesture, null, createElement(NativeZoom, props)));
    });
    const resetPinch = () =>
      detector()?.props.gesture.gestures.find((gesture: FakeGesture) => gesture.name === 'pinch');
    await act(async () => resetPinch()?.onStartCallback?.({ focalX: 195, focalY: 300 }));
    await act(async () =>
      resetPinch()?.onUpdateCallback?.({ focalX: 195, focalY: 300, scale: 0.25 }),
    );
    const resetImage = nativeRenderer.root.findAll(
      (node) => String(node.type) === 'AnimatedView',
    )[0];
    assert.equal(
      (resetImage.props.style[1] as () => { transform: Array<Record<string, number>> })()
        .transform[2]?.scale,
      1,
    );
    await act(async () => resetPinch()?.onFinalizeCallback?.({}, false));
    assert.deepEqual(zoomedChanges.at(-1), false);
    const resetTap = () =>
      detector()?.props.gesture.gestures.find((gesture: FakeGesture) => gesture.name === 'tap');
    await act(async () => resetTap()?.onEndCallback?.({ x: 300, y: 100 }, true));
    assert.deepEqual(
      (resetImage.props.style[1] as () => { transform: Array<Record<string, number>> })().transform,
      [{ translateX: -105 }, { translateY: 200 }, { scale: 2 }],
    );
    assert.deepEqual(zoomedChanges.at(-1), true);
    await act(async () => resetTap()?.onEndCallback?.({ x: 300, y: 100 }, true));
    assert.equal(
      (resetImage.props.style[1] as () => { transform: Array<Record<string, number>> })()
        .transform[2]?.scale,
      4,
    );
    assert.deepEqual(zoomedChanges.at(-1), true);
    await act(async () => resetTap()?.onEndCallback?.({ x: 300, y: 100 }, true));
    assert.equal(
      (resetImage.props.style[1] as () => { transform: Array<Record<string, number>> })()
        .transform[2]?.scale,
      1,
    );
    assert.deepEqual(zoomedChanges.at(-1), false);
    await act(async () => resetPinch()?.onStartCallback?.({ focalX: 195, focalY: 300 }));
    await act(async () =>
      resetPinch()?.onUpdateCallback?.({ focalX: 195, focalY: 300, scale: 1.5 }),
    );
    await act(async () => resetPinch()?.onFinalizeCallback?.({}, true));
    await act(async () => resetTap()?.onEndCallback?.({ x: 300, y: 100 }, true));
    assert.equal(
      (resetImage.props.style[1] as () => { transform: Array<Record<string, number>> })()
        .transform[2]?.scale,
      2,
    );
  });

  it('Android image stage keeps horizontal paging without iOS zoom', async () => {
    mockPlatform.OS = 'android';
    const indexes: number[] = [];
    await render({ currentIndex: 1, onIndexChange: (index) => indexes.push(index) });

    await act(async () =>
      byTestId('post-media-viewer-media-viewport').props.onLayout({
        nativeEvent: { layout: { width: 390, height: 600 } },
      }),
    );
    const pager = byTestId('post-media-viewer-native-pager');
    assert.equal(queryByTestId('post-media-viewer-ios-zoom'), null);
    assert.equal(pager.props.horizontal, true);
    assert.equal(pager.props.pagingEnabled, true);
    assert.deepEqual(pager.props.contentOffset, { x: 390, y: 0 });

    await act(async () =>
      pager.props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: { x: 780, y: 0 },
          layoutMeasurement: { width: 390, height: 600 },
        },
      }),
    );

    assert.deepEqual(indexes, [2]);

    await render({ currentIndex: 2 });
    assert.equal(scrollCalls.length, 0, 'momentum snap must not animate back to the same page');

    await render({ currentIndex: 3 });
    assert.deepEqual(scrollCalls.at(-1), { animated: true, x: 1170 });
    mockReducedMotion = true;
    await render({ currentIndex: 2 });
    assert.deepEqual(scrollCalls.at(-1), { animated: false, x: 780 });

    await act(async () =>
      byTestId('post-media-viewer-media-viewport').props.onLayout({
        nativeEvent: { layout: { width: 400, height: 600 } },
      }),
    );
    assert.deepEqual(scrollCalls.at(-1), { animated: false, x: 800 });

    await render({ viewState: 'error' });
    assert.equal(queryByTestId('post-media-viewer-native-pager'), null);
  });

  it('Android Surface connects image zoom and accessibility to paging and resets on selection', async () => {
    mockPlatform.OS = 'android';
    await render({ currentIndex: 0 });
    await act(async () =>
      byTestId('post-media-viewer-media-viewport').props.onLayout({
        nativeEvent: { layout: { width: 390, height: 600 } },
      }),
    );
    const gesture = () =>
      byTestId('post-media-viewer-android-zoom').find(
        (node) => String(node.type) === 'GestureDetector',
      ).props.gesture as FakeGesture;
    assert.equal(gesture().gestures?.[0]?.enabledValue, false);
    await act(async () => image().props.onLoad());
    const animated = byTestId('post-media-viewer-android-zoom').find(
      (node) => String(node.type) === 'AnimatedView',
    );
    await act(async () =>
      animated.props.onLayout({
        nativeEvent: { layout: { width: 390, height: 219.375 } },
      }),
    );
    const pagerGesture = renderer!.root.find(
      (node) => String(node.type) === 'GestureDetector' && node.props.gesture.name === 'native',
    ).props.gesture;
    assert.equal(gesture().gestures?.[0]?.externalGestures?.[0], pagerGesture);
    const tap = () => gesture().gestures!.find((item) => item.name === 'tap')!;
    for (const scale of [2, 4, 1]) {
      await act(async () => tap().onEndCallback!({ x: 195, y: 300 }, true));
      assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, scale === 1);
      assert.equal(image().parent!.props.accessibilityValue.now, scale);
    }
    await act(async () =>
      image().parent!.props.onAccessibilityAction({
        nativeEvent: { actionName: 'increment' },
      }),
    );
    assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, false);
    assert.equal(image().parent!.props.accessibilityValue.now, 2);
    const previousImage = image();
    await render({ currentIndex: 1 });
    assert.notEqual(image(), previousImage);
    assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, true);
    assert.equal(image().parent!.props.accessibilityValue, undefined);
    await act(async () => image().props.onLoad());
    assert.equal(image().parent!.props.accessibilityValue.now, 1);
    const preview = byTestId('post-media-viewer-preview-image');
    assert.equal(preview.parent!.props.accessibilityActions, undefined);
    await act(async () =>
      image().parent!.props.onAccessibilityAction({
        nativeEvent: { actionName: 'increment' },
      }),
    );
    await act(async () => image().props.onError());
    assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, true);
    assert.equal(image().parent!.props.accessibilityActions, undefined);
  });

  it('Web keeps the plain image after viewport measurement', async () => {
    await render();
    await act(async () =>
      byTestId('post-media-viewer-media-viewport').props.onLayout({
        nativeEvent: { layout: { width: 390, height: 600 } },
      }),
    );
    await act(async () => image().props.onLoad());
    assert.equal(image().props.accessible, true);
    assert.equal(image().parent!.props.accessibilityActions, undefined);
    assert.equal(queryByTestId('post-media-viewer-ios-zoom'), null);
    assert.equal(queryByTestId('post-media-viewer-android-zoom'), null);
    assert.equal(queryByTestId('post-media-viewer-native-pager'), null);
    assert.equal(
      renderer!.root.findAll((node) => String(node.type) === 'GestureDetector').length,
      0,
    );
  });

  it('Android image accessibility actions share zoom bounds and area direction', async () => {
    const NativeZoom = AndroidZoomImage;
    const PagerGesture = AndroidPagerGesture;
    assert.ok(NativeZoom);
    assert.ok(PagerGesture);
    const zoomedChanges: boolean[] = [];
    const props = {
      children: createElement('View', { style: { height: 585, width: 390 } }),
      onZoomedChange: (zoomed: boolean) => zoomedChanges.push(zoomed),
      status: 'ready' as const,
      viewportSize: { height: 600, width: 390 },
    };
    await act(async () => {
      androidRenderer = create(createElement(PagerGesture, null, createElement(NativeZoom, props)));
    });
    const nativeRenderer = androidRenderer;
    assert.ok(nativeRenderer);
    const image = nativeRenderer.root.findAll((node) => String(node.type) === 'AnimatedView')[0];
    assert.ok(image);
    const accessibleChild = () =>
      nativeRenderer.root.findAll((node) => node.props.zoomAccessibility !== undefined)[0];
    await act(async () =>
      image.props.onLayout({ nativeEvent: { layout: { height: 585, width: 390 } } }),
    );
    assert.deepEqual(accessibleChild()?.props.zoomAccessibility.accessibilityActions, [
      { label: '확대', name: 'increment' },
    ]);
    assert.deepEqual(accessibleChild()?.props.zoomAccessibility.accessibilityValue, {
      max: 4,
      min: 1,
      now: 1,
      text: '1배',
    });

    await act(async () =>
      accessibleChild()?.props.zoomAccessibility.onAccessibilityAction({
        nativeEvent: { actionName: 'increment' },
      }),
    );
    assert.equal(
      (image.props.style[1] as () => { transform: Array<Record<string, number>> })().transform[2]
        ?.scale,
      2,
    );
    assert.deepEqual(zoomedChanges, [true]);
    assert.equal(accessibleChild()?.props.zoomAccessibility.accessibilityValue.now, 2);
    await act(async () =>
      accessibleChild()?.props.zoomAccessibility.onAccessibilityAction({
        nativeEvent: { actionName: 'increment' },
      }),
    );
    assert.equal(
      (image.props.style[1] as () => { transform: Array<Record<string, number>> })().transform[2]
        ?.scale,
      4,
    );
    assert.equal(accessibleChild()?.props.zoomAccessibility.accessibilityValue.now, 4);
    await act(async () =>
      accessibleChild()?.props.zoomAccessibility.onAccessibilityAction({
        nativeEvent: { actionName: 'increment' },
      }),
    );
    assert.equal(accessibleChild()?.props.zoomAccessibility.accessibilityValue.now, 4);
    await act(async () =>
      accessibleChild()?.props.zoomAccessibility.onAccessibilityAction({
        nativeEvent: { actionName: 'decrement' },
      }),
    );
    assert.equal(
      (image.props.style[1] as () => { transform: Array<Record<string, number>> })().transform[2]
        ?.scale,
      2,
    );
    assert.equal(accessibleChild()?.props.zoomAccessibility.accessibilityValue.now, 2);
    await act(async () =>
      accessibleChild()?.props.zoomAccessibility.onAccessibilityAction({
        nativeEvent: { actionName: 'panRight' },
      }),
    );
    await act(async () =>
      accessibleChild()?.props.zoomAccessibility.onAccessibilityAction({
        nativeEvent: { actionName: 'panDown' },
      }),
    );
    assert.deepEqual(
      (image.props.style[1] as () => { transform: Array<Record<string, number>> })().transform,
      [{ translateX: -195 }, { translateY: -285 }, { scale: 2 }],
    );
    const edgeActions = accessibleChild()?.props.zoomAccessibility.accessibilityActions.map(
      (action: { name: string }) => action.name,
    );
    assert.deepEqual(edgeActions, ['increment', 'decrement', 'reset', 'panLeft', 'panUp']);
    await act(async () =>
      accessibleChild()?.props.zoomAccessibility.onAccessibilityAction({
        nativeEvent: { actionName: 'panRight' },
      }),
    );
    await act(async () =>
      accessibleChild()?.props.zoomAccessibility.onAccessibilityAction({
        nativeEvent: { actionName: 'panDown' },
      }),
    );
    assert.deepEqual(
      (image.props.style[1] as () => { transform: Array<Record<string, number>> })().transform,
      [{ translateX: -195 }, { translateY: -285 }, { scale: 2 }],
    );
    await act(async () =>
      accessibleChild()?.props.zoomAccessibility.onAccessibilityAction({
        nativeEvent: { actionName: 'panLeft' },
      }),
    );
    await act(async () =>
      accessibleChild()?.props.zoomAccessibility.onAccessibilityAction({
        nativeEvent: { actionName: 'panUp' },
      }),
    );
    assert.deepEqual(
      (image.props.style[1] as () => { transform: Array<Record<string, number>> })().transform,
      [{ translateX: 0 }, { translateY: 15 }, { scale: 2 }],
    );
    await act(async () =>
      accessibleChild()?.props.zoomAccessibility.onAccessibilityAction({
        nativeEvent: { actionName: 'decrement' },
      }),
    );
    assert.deepEqual(zoomedChanges, [true, false]);
    assert.equal(
      (image.props.style[1] as () => { transform: Array<Record<string, number>> })().transform[2]
        ?.scale,
      1,
    );

    await act(async () => {
      nativeRenderer.update(
        createElement(
          PagerGesture,
          null,
          createElement(NativeZoom, { ...props, status: 'loading' as const }),
        ),
      );
    });
    assert.equal(accessibleChild()?.props.zoomAccessibility, undefined);
    await act(async () => {
      nativeRenderer.update(
        createElement(
          PagerGesture,
          null,
          createElement(NativeZoom, { ...props, status: 'error' as const }),
        ),
      );
    });
    assert.equal(accessibleChild()?.props.zoomAccessibility, undefined);
  });

  it('iOS double-tap platform boundary forwards the native focal point', async () => {
    const NativeDoubleTap = IOSDoubleTap;
    assert.ok(NativeDoubleTap);
    const points: Array<{ x: number; y: number }> = [];
    await act(async () => {
      renderer = create(
        createElement(
          NativeDoubleTap,
          { enabled: true, onDoubleTap: (point: { x: number; y: number }) => points.push(point) },
          createElement('View'),
        ),
      );
    });
    const detector = renderer?.root.find((node) => String(node.type) === 'GestureDetector');
    assert.ok(detector);
    const tap = detector.props.gesture as FakeGesture;
    assert.equal(tap.enabledValue, true);
    assert.equal(tap.numberOfTapsValue, 2);
    await act(async () => tap.onEndCallback?.({ x: 120, y: 240 }, true));
    assert.deepEqual(points, [{ x: 120, y: 240 }]);
    await act(async () => tap.onEndCallback?.({ x: 10, y: 20 }, false));
    assert.deepEqual(points, [{ x: 120, y: 240 }]);
    assert.ok(renderer?.root.find((node) => String(node.type) === 'GestureHandlerRootView'));
  });

  it('iOS image zoom uses the native ScrollView and locks pager while zoomed', async () => {
    mockPlatform.OS = 'ios';
    await render({ currentIndex: 0 });
    await act(async () =>
      byTestId('post-media-viewer-media-viewport').props.onLayout({
        nativeEvent: { layout: { width: 390, height: 600 } },
      }),
    );
    await act(async () => image().props.onLoad());

    const pager = byTestId('post-media-viewer-native-pager');
    const zoom = byTestId('post-media-viewer-ios-zoom');
    assert.equal(zoom.props.minimumZoomScale, 1);
    assert.equal(zoom.props.maximumZoomScale, 4);
    assert.equal(zoom.props.pinchGestureEnabled, true);
    assert.equal(zoom.props.centerContent, true);
    assert.deepEqual(zoom.props.contentContainerStyle, {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 600,
      minWidth: 390,
    });
    assert.equal(iosDoubleTapProps?.enabled, true);
    assert.equal(pager.props.scrollEnabled, true);

    await act(async () => iosDoubleTapProps?.onDoubleTap({ x: 100, y: 200 }));
    assert.deepEqual(zoomToCalls.at(-1), {
      animated: true,
      height: 300,
      width: 195,
      x: 2.5,
      y: 50,
    });
    assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, false);
    await act(async () =>
      zoom.props.onScroll({ nativeEvent: { contentOffset: { x: 40, y: 20 }, zoomScale: 2 } }),
    );
    await act(async () => iosDoubleTapProps?.onDoubleTap({ x: 100, y: 200 }));
    assert.deepEqual(zoomToCalls.at(-1), {
      animated: true,
      height: 150,
      width: 97.5,
      x: 21.25,
      y: 35,
    });
    assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, false);
    await act(async () =>
      zoom.props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 0 }, zoomScale: 4 } }),
    );
    await act(async () => iosDoubleTapProps?.onDoubleTap({ x: 100, y: 200 }));
    assert.deepEqual(zoomToCalls.at(-1), {
      animated: true,
      height: 600,
      width: 390,
      x: 0,
      y: 0,
    });
    assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, false);
    await act(async () =>
      zoom.props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 0 }, zoomScale: 1 } }),
    );
    assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, true);
    await act(async () => iosDoubleTapProps?.onDoubleTap({ x: 50, y: 50 }));
    assert.deepEqual(zoomToCalls.at(-1), {
      animated: true,
      height: 300,
      width: 195,
      x: 0,
      y: 0,
    });
    await act(async () =>
      zoom.props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 0 }, zoomScale: 2 } }),
    );
    await act(async () => iosDoubleTapProps?.onDoubleTap({ x: 340, y: 550 }));
    assert.deepEqual(zoomToCalls.at(-1), {
      animated: true,
      height: 150,
      width: 97.5,
      x: 121.25,
      y: 200,
    });
    await act(async () =>
      zoom.props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 0 }, zoomScale: 4 } }),
    );
    await act(async () => iosDoubleTapProps?.onDoubleTap({ x: 200, y: 300 }));
    assert.deepEqual(zoomToCalls.at(-1), {
      animated: true,
      height: 600,
      width: 390,
      x: 0,
      y: 0,
    });
    await act(async () =>
      zoom.props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 0 }, zoomScale: 1 } }),
    );
    assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, true);
    await act(async () => iosDoubleTapProps?.onDoubleTap({ x: 340, y: 550 }));
    assert.deepEqual(zoomToCalls.at(-1), {
      animated: true,
      height: 300,
      width: 195,
      x: 195,
      y: 300,
    });

    await act(async () =>
      zoom.props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 0 }, zoomScale: 1.5 } }),
    );
    await act(async () => iosDoubleTapProps?.onDoubleTap({ x: 100, y: 200 }));
    assert.deepEqual(zoomToCalls.at(-1), {
      animated: true,
      height: 300,
      width: 195,
      x: 0,
      y: 0,
    });

    mockReducedMotion = true;
    await render({ currentIndex: 0 });
    await act(async () =>
      zoom.props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 0 }, zoomScale: 4 } }),
    );
    await act(async () => iosDoubleTapProps?.onDoubleTap({ x: 100, y: 200 }));
    assert.deepEqual(zoomToCalls.at(-1), {
      animated: false,
      height: 600,
      width: 390,
      x: 0,
      y: 0,
    });
    assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, true);
    mockReducedMotion = false;
    await render({ currentIndex: 0 });

    await act(async () =>
      zoom.props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 0 }, zoomScale: 2 } }),
    );
    assert.equal(pager.props.scrollEnabled, false);
    await act(async () =>
      zoom.props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 0 }, zoomScale: 1 } }),
    );
    assert.equal(pager.props.scrollEnabled, true);

    await act(async () => zoom.props.onScroll({ nativeEvent: { zoomScale: 2 } }));
    assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, false);
    const previousImage = image();
    await render({ contentRevisionId: 'content-b' });
    assert.notEqual(image(), previousImage);
    assert.equal(byTestId('post-media-viewer-ios-zoom').props.zoomScale, 1);
    assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, true);

    await act(async () => image().props.onError());
    assert.equal(byTestId('post-media-viewer-ios-zoom').props.pinchGestureEnabled, false);
    assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, true);
    await act(async () =>
      byTestId('post-media-viewer-ios-zoom').props.onScroll({ nativeEvent: { zoomScale: 2 } }),
    );
    assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, true);
    const retry = getToastRetry();
    assert.ok(retry);
    await act(async () => retry?.());
    assert.equal(byTestId('post-media-viewer-ios-zoom').props.pinchGestureEnabled, false);
    assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, true);
  });

  it('Native image accessibility actions expose scale, area movement, and ready-only bounds', async () => {
    mockPlatform.OS = 'ios';
    await render({ currentIndex: 0 });
    await act(async () =>
      byTestId('post-media-viewer-media-viewport').props.onLayout({
        nativeEvent: { layout: { width: 390, height: 600 } },
      }),
    );
    await act(async () => image().props.onLoad());

    const zoom = byTestId('post-media-viewer-ios-zoom');
    const zoomAccessibilityOwner = () => image().parent as ReactTestInstance;
    assert.equal(zoomAccessibilityOwner().props.accessible, true);
    assert.equal(zoomAccessibilityOwner().props.accessibilityLabel, '첫 번째 이미지');
    assert.equal(zoomAccessibilityOwner().props.accessibilityRole, 'image');
    assert.deepEqual(zoomAccessibilityOwner().props.accessibilityActions, [
      { label: '확대', name: 'increment' },
    ]);
    assert.deepEqual(zoomAccessibilityOwner().props.accessibilityValue, {
      max: 4,
      min: 1,
      now: 1,
      text: '1배',
    });
    assert.equal(image().props.accessible, false);
    assert.equal(image().props.importantForAccessibility, 'no');
    assert.equal(image().props.accessibilityElementsHidden, true);
    assert.equal(image().props.accessibilityActions, undefined);
    assert.equal(image().props.accessibilityValue, undefined);
    const previews = renderer?.root.findAllByProps({ testID: 'post-media-viewer-preview-image' });
    assert.ok(previews?.length);
    assert.equal(
      previews?.every((preview) => preview.props.accessibilityActions === undefined),
      true,
    );

    await act(async () =>
      zoomAccessibilityOwner().props.onAccessibilityAction({
        nativeEvent: { actionName: 'increment' },
      }),
    );
    assert.deepEqual(zoomToCalls.at(-1), {
      animated: true,
      height: 300,
      width: 195,
      x: 97.5,
      y: 150,
    });
    assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, false);
    await act(async () =>
      zoom.props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 0 }, zoomScale: 2 } }),
    );
    assert.equal(zoomAccessibilityOwner().props.accessibilityValue.now, 2);
    assert.deepEqual(
      zoomAccessibilityOwner().props.accessibilityActions.map(
        (action: { name: string }) => action.name,
      ),
      ['increment', 'decrement', 'reset', 'panRight', 'panDown'],
    );
    await act(async () =>
      zoomAccessibilityOwner().props.onAccessibilityAction({
        nativeEvent: { actionName: 'increment' },
      }),
    );
    assert.deepEqual(zoomToCalls.at(-1), {
      animated: true,
      height: 150,
      width: 97.5,
      x: 146.25,
      y: 225,
    });
    await act(async () =>
      zoom.props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 0 }, zoomScale: 4 } }),
    );
    assert.equal(zoomAccessibilityOwner().props.accessibilityValue.now, 4);
    await act(async () =>
      zoomAccessibilityOwner().props.onAccessibilityAction({
        nativeEvent: { actionName: 'decrement' },
      }),
    );
    assert.deepEqual(zoomToCalls.at(-1), {
      animated: true,
      height: 300,
      width: 195,
      x: 97.5,
      y: 150,
    });
    await act(async () =>
      zoom.props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 0 }, zoomScale: 2 } }),
    );
    await act(async () =>
      zoomAccessibilityOwner().props.onAccessibilityAction({
        nativeEvent: { actionName: 'panRight' },
      }),
    );
    assert.deepEqual(scrollCalls.at(-1), { animated: true, x: 195, y: 0 });
    await act(async () =>
      zoom.props.onScroll({ nativeEvent: { contentOffset: { x: 195, y: 0 }, zoomScale: 2 } }),
    );
    await act(async () =>
      zoomAccessibilityOwner().props.onAccessibilityAction({
        nativeEvent: { actionName: 'panDown' },
      }),
    );
    assert.deepEqual(scrollCalls.at(-1), { animated: true, x: 195, y: 300 });
    await act(async () =>
      zoom.props.onScroll({ nativeEvent: { contentOffset: { x: 390, y: 600 }, zoomScale: 2 } }),
    );
    assert.deepEqual(
      zoomAccessibilityOwner().props.accessibilityActions.map(
        (action: { name: string }) => action.name,
      ),
      ['increment', 'decrement', 'reset', 'panLeft', 'panUp'],
    );
    const scrollCallCountAtEdge = scrollCalls.length;
    await act(async () =>
      zoomAccessibilityOwner().props.onAccessibilityAction({
        nativeEvent: { actionName: 'panRight' },
      }),
    );
    await act(async () =>
      zoomAccessibilityOwner().props.onAccessibilityAction({
        nativeEvent: { actionName: 'panDown' },
      }),
    );
    assert.equal(scrollCalls.length, scrollCallCountAtEdge);
    await act(async () =>
      zoomAccessibilityOwner().props.onAccessibilityAction({
        nativeEvent: { actionName: 'panLeft' },
      }),
    );
    assert.deepEqual(scrollCalls.at(-1), { animated: true, x: 195, y: 600 });
    await act(async () =>
      zoom.props.onScroll({ nativeEvent: { contentOffset: { x: 195, y: 600 }, zoomScale: 2 } }),
    );
    await act(async () =>
      zoomAccessibilityOwner().props.onAccessibilityAction({
        nativeEvent: { actionName: 'panUp' },
      }),
    );
    assert.deepEqual(scrollCalls.at(-1), { animated: true, x: 195, y: 300 });

    await act(async () =>
      zoomAccessibilityOwner().props.onAccessibilityAction({
        nativeEvent: { actionName: 'decrement' },
      }),
    );
    assert.deepEqual(zoomToCalls.at(-1), {
      animated: true,
      height: 600,
      width: 390,
      x: 0,
      y: 0,
    });
    assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, false);
    await act(async () =>
      zoom.props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 0 }, zoomScale: 1 } }),
    );
    assert.equal(byTestId('post-media-viewer-native-pager').props.scrollEnabled, true);

    await act(async () => image().props.onError());
    assert.equal(zoomAccessibilityOwner().props.accessible, undefined);
    assert.equal(image().props.accessible, true);
    assert.equal(image().props.accessibilityElementsHidden, undefined);
    assert.equal(image().props.importantForAccessibility, undefined);
    assert.equal(image().props.accessibilityActions, undefined);
    assert.equal(image().props.accessibilityValue, undefined);
  });

  it('Ready 이미지 실패는 현재 이미지 retry와 stale callback을 유지하고 다시 방문하면 reload한다', async () => {
    await render({ currentIndex: 0 });
    const first = image();
    const oldFailure = first.props.onError;
    const oldLoad = first.props.onLoad;
    const oldLoadStart = first.props.onLoadStart;
    await act(async () => oldFailure());
    assert.equal(getToast()?.tone, 'danger');
    assert.equal(
      byTestId('post-media-viewer-error-toast').parent?.parent?.props.testID,
      'post-media-viewer-media-pane',
    );
    assert.ok(byTestId('post-media-viewer-compact-detail'));
    assert.ok(findByLabel('다음 이미지'));
    assert.equal(byTestId('post-media-viewer-position').children.join(''), '1 / 4');

    await act(async () => getToast()?.action.onPress());
    assert.notEqual(image(), first);
    assert.equal(getToast(), null);
    assert.equal(image().props.accessibilityState.busy, true);
    await act(async () => oldFailure());
    assert.equal(getToast(), null);
    await act(async () => image().props.onLoad());
    assert.equal(image().props.accessibilityState.busy, false);
    await act(async () => image().props.onLoadStart());
    assert.equal(image().props.accessibilityState.busy, false);

    const retriedFailure = image().props.onError;
    await act(async () => retriedFailure());
    const staleRetry = getToastRetry();
    await render({ currentIndex: 1 });
    const second = image();
    assert.equal(getToast(), null);
    await act(async () => {
      retriedFailure();
      staleRetry?.();
    });
    assert.equal(getToast(), null);
    assert.equal(image(), second);
    assert.equal(byTestId('post-media-viewer-position').children.join(''), '2 / 4');
    await act(async () => image().props.onError());
    await render({ currentIndex: 0 });
    assert.equal(getToast(), null, 'A로 돌아오면 이전 오류 이력 없이 다시 요청한다');
    assert.equal(image().props.source.uri, 'https://media.example/1.webp');
    assert.equal(image().props.accessibilityState.busy, true);
    await act(async () => {
      oldFailure();
      oldLoad();
      oldLoadStart();
    });
    assert.equal(getToast(), null, '이전 mount callback은 현재 요청을 변경하지 않는다');
    assert.equal(image().props.accessibilityState.busy, true);
    await render({ currentIndex: 1 });
    assert.equal(getToast(), null, 'B로 돌아오면 이전 오류 이력 없이 다시 요청한다');
    assert.equal(image().props.source.uri, 'https://media.example/2.webp');
    assert.equal(image().props.accessibilityState.busy, true);

    const replacementMedia = [
      { ...media(1, '첫 번째 이미지'), url: 'https://media.example/1-replacement.webp' },
      media(2, '두 번째 이미지'),
      media(3, null),
      media(4, null),
    ];
    await render({ currentIndex: 1, media: replacementMedia });
    assert.equal(getToast(), null, '다른 이미지 URL 변경은 현재 이미지 상태를 바꾸지 않는다');
    await render({ currentIndex: 0, media: replacementMedia });
    assert.equal(image().props.source.uri, 'https://media.example/1-replacement.webp');
    assert.equal(image().props.accessibilityState.busy, true);

    await render({ viewState: 'unavailable' });
    assert.equal(getToast(), null);
    assert.equal(queryByTestId('post-media-viewer-image'), null);
  });

  it('Content revision과 query fallback은 Media 오류 이력을 초기화하고 close를 유지한다', async () => {
    await render();
    const close = findByLabel('이미지 뷰어 닫기');
    const oldError = image().props.onError;
    await act(async () => oldError());
    assert.equal(image().props.source, undefined);

    await render({ contentRevisionId: null, viewState: 'unavailable' });
    await render();
    assert.equal(image().props.source.uri, 'https://media.example/2.webp');
    assert.equal(queryByTestId('post-media-viewer-error-toast'), null);

    await render({ contentRevisionId: 'content-b' });
    assert.ok(image().props.source?.uri, '같은 Media를 재사용하는 새 revision은 다시 로드한다');
    assert.equal(queryByTestId('post-media-viewer-error-toast'), null);
    assert.equal(findByLabel('이미지 뷰어 닫기'), close);
    assert.equal(byTestId('post-media-viewer-position').children.join(''), '2 / 4');
    await act(async () => oldError());
    assert.ok(image().props.source?.uri);
    await render();
    await act(async () => oldError());
    assert.ok(image().props.source?.uri, 'A로 다시 전환해도 최초 A callback은 무시한다');
  });

  it('public props는 presentation별 필수 secondary surface를 요구한다', () => {
    const commonProps = {
      contentRevisionId: 'content-a',
      currentIndex: 0,
      media: [] as const,
      onClose: () => undefined,
      onIndexChange: () => undefined,
      onNext: () => undefined,
      onPrevious: () => undefined,
      onRetry: () => undefined,
    };
    const accept = (props: PostMediaViewerSurfaceProps) => props;

    // @ts-expect-error Wide는 모든 상태에서 context rail이 필요하다.
    accept({ ...commonProps, presentation: 'wide', viewState: 'loading' });
    // @ts-expect-error Compact는 모든 상태에서 detail surface가 필요하다.
    accept({ ...commonProps, presentation: 'compact', viewState: 'ready' });
    // @ts-expect-error 필수 Wide context rail은 비어 있을 수 없다.
    accept({ ...commonProps, contextRail: null, presentation: 'wide', viewState: 'loading' });
    // @ts-expect-error 필수 Compact detail은 비어 있을 수 없다.
    accept({
      ...commonProps,
      compactDetail: undefined,
      presentation: 'compact',
      viewState: 'loading',
    });
    accept({
      ...commonProps,
      compactDetail: createElement('CompactDetail'),
      presentation: 'compact',
      // @ts-expect-error Sensitive 공개는 Gallery가 소유하며 Viewer 상태가 아니다.
      viewState: 'sensitive',
    });
  });

  it('Ready는 close, 위치 status, 다중 navigation을 제공한다', async () => {
    await render({ currentIndex: 1 });

    assert.ok(findByLabel('이미지 뷰어 닫기'));
    assert.ok(findByLabel('이전 이미지'));
    assert.ok(findByLabel('다음 이미지'));
    assert.equal(byTestId('post-media-viewer-position').children.join(''), '2 / 4');
  });

  it('단일 Media에서는 visual navigation과 counter를 숨긴다', async () => {
    await render({ currentIndex: 0, media: [media(1, '한 장의 설명')] });

    assert.equal(queryByLabel('이전 이미지'), null);
    assert.equal(queryByLabel('다음 이미지'), null);
    assert.equal(queryByTestId('post-media-viewer-counter'), null);
    assert.equal(byTestId('post-media-viewer-position').children.join(''), '1 / 1');
  });

  it('첫·중간·마지막 위치에서 비순환 경계와 disabled callback을 지킨다', async () => {
    const calls = { next: 0, previous: 0 };
    const props = baseProps({
      currentIndex: 0,
      onNext: () => calls.next++,
      onPrevious: () => calls.previous++,
    });

    await render(props);
    assert.deepEqual(findByLabel('이전 이미지').props.accessibilityState, { disabled: true });
    assert.deepEqual(findByLabel('다음 이미지').props.accessibilityState, { disabled: false });
    findByLabel('이전 이미지').props.onPress({ type: 'press' });
    findByLabel('다음 이미지').props.onPress({ type: 'press' });
    assert.deepEqual(calls, { next: 1, previous: 0 });

    await render({ ...props, currentIndex: 1 });
    assert.deepEqual(findByLabel('이전 이미지').props.accessibilityState, { disabled: false });
    assert.deepEqual(findByLabel('다음 이미지').props.accessibilityState, { disabled: false });

    await render({ ...props, currentIndex: 3 });
    assert.deepEqual(findByLabel('이전 이미지').props.accessibilityState, { disabled: false });
    assert.deepEqual(findByLabel('다음 이미지').props.accessibilityState, { disabled: true });
    findByLabel('다음 이미지').props.onPress({ type: 'press' });
    findByLabel('이전 이미지').props.onPress({ type: 'press' });
    assert.deepEqual(calls, { next: 1, previous: 1 });
  });

  it('control callback은 event 없이 한 번 호출되고 controlled index를 보존한다', async () => {
    const args: unknown[][] = [];
    await render({
      currentIndex: 1,
      onClose: (...values: unknown[]) => args.push(values),
      onNext: (...values: unknown[]) => args.push(values),
      onPrevious: (...values: unknown[]) => args.push(values),
    });

    findByLabel('이미지 뷰어 닫기').props.onPress({ type: 'press' });
    findByLabel('이전 이미지').props.onPress({ type: 'press' });
    findByLabel('다음 이미지').props.onPress({ type: 'press' });

    assert.deepEqual(args, [[], [], []]);
    assert.ok(queryByType('Image'));
    assert.equal(byTestId('post-media-viewer-position').children.join(''), '2 / 4');
  });

  it('Web media pane 빈 stage만 닫고 Native에서는 기존 backdrop semantics를 유지한다', async () => {
    const args: unknown[][] = [];
    await render({ onClose: (...values: unknown[]) => args.push(values) });

    const dismissTarget = byTestId('post-media-viewer-media-pane-dismiss');
    assert.equal(dismissTarget.props.accessible, false);
    assert.equal(dismissTarget.props.focusable, false);
    assert.equal(dismissTarget.props.tabIndex, -1);
    assert.deepEqual(flattenStyle(dismissTarget.props.style), {
      bottom: 0,
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    });
    dismissTarget.props.onPress({ type: 'press' });
    assert.deepEqual(args, [[]]);

    mockPlatform.OS = 'ios';
    await render();
    assert.equal(queryByTestId('post-media-viewer-media-pane-dismiss'), null);
  });

  it('Ready image는 contain, trimmed alt name 또는 document fallback을 사용한다', async () => {
    await render({ currentIndex: 0, media: [media(1, '  Trimmed alt  ')] });
    assert.equal(image().props.accessible, true);
    assert.equal(image().props.accessibilityLabel, 'Trimmed alt');
    assert.equal(image().props.accessibilityRole, 'image');
    assert.equal(image().props.resizeMode, 'contain');

    await render({ currentIndex: 2, media: [media(1, null), media(2, null), media(3, null)] });
    assert.equal(image().props.accessibilityLabel, '3번째 첨부 이미지');
  });

  it('intrinsic 비율로 stage를 최대한 채우고 실제 image bounds만 hit area로 둔다', async () => {
    await render({ presentation: 'wide' });

    const viewport = byTestId('post-media-viewer-media-viewport');
    assert.equal(viewport.props.pointerEvents, 'box-none');
    await act(async () =>
      viewport.props.onLayout({ nativeEvent: { layout: { height: 600, width: 1000 } } }),
    );
    await act(async () => image().props.onLoad());

    const frame = image().parent;
    assert.ok(frame);
    assert.deepEqual(pick(flattenStyle(frame.props.style), ['height', 'width']), {
      height: 562.5,
      width: 1000,
    });
    assert.deepEqual(
      flattenStyle(byTestId('post-media-viewer-image-privacy-boundary').props.style),
      {},
    );
  });

  it('상태 action은 104x40 visual을 플랫폼별 accessible target 안에 둔다', async () => {
    try {
      for (const [platform, targetHeight] of [
        ['web', 40],
        ['ios', 44],
        ['android', 48],
      ] as const) {
        mockPlatform.OS = platform;

        await render({ viewState: 'error' });
        const action = findByLabel('다시 시도');

        assert.equal(action.props.hitSlop, undefined);
        assert.deepEqual(pick(resolveStyle(action.props.style), ['height', 'width']), {
          height: targetHeight,
          width: 104,
        });
        assert.deepEqual(
          pick(flattenStyle(action.find((node) => (node.type as unknown) === 'View').props.style), [
            'height',
            'width',
          ]),
          { height: 40, width: 104 },
        );
      }
    } finally {
      mockPlatform.OS = 'web';
    }
  });

  it('Compact와 Wide에서 rail·detail을 제외한 전체 stage를 image viewport로 사용한다', async () => {
    await render({
      compactDetail: createElement('CompactDetailContent'),
      contextRail: createElement('ContextRailContent'),
      presentation: 'compact',
    });
    assert.deepEqual(flattenStyle(byTestId('post-media-viewer-media-viewport').props.style), {
      alignSelf: 'stretch',
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      minHeight: 0,
      minWidth: 0,
    });
    assert.ok(byTestId('post-media-viewer-compact-detail'));
    assert.equal(flattenStyle(findByLabel('이미지 뷰어 닫기').props.style).right, 16);
    assert.equal(queryByTestId('post-media-viewer-context-rail'), null);

    await render({
      compactDetail: createElement('CompactDetailContent'),
      contextRail: createElement('ContextRailContent'),
      presentation: 'wide',
    });
    assert.deepEqual(flattenStyle(byTestId('post-media-viewer-media-viewport').props.style), {
      alignSelf: 'stretch',
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      minHeight: 0,
      minWidth: 0,
    });
    assert.equal(flattenStyle(byTestId('post-media-viewer-context-rail').props.style).width, 346);
    assert.equal(flattenStyle(findByLabel('이미지 뷰어 닫기').props.style).left, 16);
    assert.equal(queryByTestId('post-media-viewer-compact-detail'), null);
  });

  it('Compact detail max-height는 viewport 높이의 32%를 192~240px로 제한한다', async () => {
    mockWindowHeight = 844;
    await render({ presentation: 'compact' });
    assert.equal(
      flattenStyle(byTestId('post-media-viewer-compact-detail').props.style).maxHeight,
      240,
    );

    mockWindowHeight = 390;
    await render({ presentation: 'compact' });
    assert.equal(
      flattenStyle(byTestId('post-media-viewer-compact-detail').props.style).maxHeight,
      192,
    );
  });

  it('Compact detail은 Ready·Loading·Error·Unavailable에서 같은 위치를 유지한다', async () => {
    for (const viewState of ['ready', 'loading', 'error', 'unavailable'] as const) {
      await render({
        compactDetail: createElement('CompactDetailContent', { state: viewState }),
        presentation: 'compact',
        viewState,
      });

      const detail = byTestId('post-media-viewer-compact-detail');
      assert.equal(
        detail.find((node) => (node.type as unknown) === 'CompactDetailContent').props.state,
        viewState,
      );
      assert.equal(detail.parent?.props.testID, 'post-media-viewer-surface');
    }
  });

  it('Loading·Error·Unavailable은 canonical 상태를 보이고 Wide rail을 유지한다', async () => {
    const states = {
      loading: ['미디어를 불러오는 중', '잠시만 기다려 주세요.'],
      error: ['미디어를 불러오지 못했어요', '네트워크 상태를 확인한 뒤 다시 시도해 주세요.'],
      unavailable: ['이 미디어를 볼 수 없어요', '삭제되었거나 접근할 수 없는 미디어입니다.'],
    } as const;

    for (const [viewState, copy] of Object.entries(states) as Array<
      [keyof typeof states, readonly [string, string]]
    >) {
      await render({
        compactDetail: createElement('CompactDetailContent'),
        contextRail: createElement('ContextRailContent'),
        presentation: 'wide',
        viewState,
      });

      assert.equal(textContents().includes(copy[0]), true);
      assert.equal(textContents().includes(copy[1]), true);
      assert.ok(findByLabel('이미지 뷰어 닫기'));
      assert.equal(queryByLabel('이전 이미지'), null);
      assert.equal(queryByLabel('다음 이미지'), null);
      assert.equal(queryByTestId('post-media-viewer-counter'), null);
      assert.equal(queryByTestId('post-media-viewer-compact-detail'), null);
      assert.ok(queryByTestId('post-media-viewer-context-rail'));
    }

    await render({ viewState: 'loading' });
    const indicator = byTestId('post-media-viewer-loading-indicator');
    assert.equal(indicator.props.accessible, false);
    assert.equal(indicator.props['aria-hidden'], true);
    assert.equal(indicator.props.accessibilityLabel, undefined);
    assert.equal(queryByLabel('다시 시도'), null);

    let retryCount = 0;
    await render({ onRetry: () => retryCount++, viewState: 'error' });
    findByLabel('다시 시도').props.onPress({ type: 'press' });
    assert.equal(retryCount, 1);

    await render({ viewState: 'unavailable' });
    assert.equal(queryByLabel('다시 시도'), null);
  });

  it('reduced-motion Loading은 회전 indicator 대신 숨긴 정적 표시를 사용한다', async () => {
    mockReducedMotion = true;

    for (const platform of ['web', 'ios', 'android'] as const) {
      mockPlatform.OS = platform;
      await render({ viewState: 'loading' });

      assert.equal(queryByTestId('post-media-viewer-loading-indicator'), null);
      const fallback = byTestId('post-media-viewer-loading-fallback');
      assert.equal(fallback.props.accessible, false);
      assert.equal(fallback.props['aria-hidden'], true);
      assert.equal(fallback.children.join(''), '···');
    }
  });

  it('70% overlay는 stage가 소유하고 Media frame과 상태는 투명하게 그 위에 놓인다', async () => {
    await render();

    assert.equal(
      flattenStyle(byTestId('post-media-viewer-surface').props.style).backgroundColor,
      'rgba(0, 0, 0, 0.7)',
    );
    assert.equal(
      flattenStyle(byTestId('post-media-viewer-media-pane').props.style).backgroundColor,
      undefined,
    );
    assert.equal(
      flattenStyle(byTestId('post-media-viewer-media-viewport').props.style).backgroundColor,
      undefined,
    );

    await render({ viewState: 'error' });
    const status = byRole('status');
    assert.equal(status.parent?.props.testID, 'post-media-viewer-media-pane');
    assert.equal(flattenStyle(status.props.style).backgroundColor, undefined);

    await render({ style: { backgroundColor: 'transparent' } });
    assert.equal(
      flattenStyle(byTestId('post-media-viewer-surface').props.style).backgroundColor,
      'transparent',
    );
  });

  it('viewer control은 48 target·30/2.5 fixed-white icon과 interaction state를 사용한다', async () => {
    await render({ currentIndex: 0 });

    assert.deepEqual(
      ['이미지 뷰어 닫기', '이전 이미지', '다음 이미지'].map((label) => {
        const control = findByLabel(label);
        return {
          label,
          targetSize: control.props.targetSize,
          visualSize: control.props.visualSize,
        };
      }),
      [
        { label: '이미지 뷰어 닫기', targetSize: 48, visualSize: 48 },
        { label: '이전 이미지', targetSize: 48, visualSize: 48 },
        { label: '다음 이미지', targetSize: 48, visualSize: 48 },
      ],
    );

    assert.deepEqual(
      ['XIcon', 'ChevronLeftIcon', 'ChevronRightIcon'].map((type) => {
        const node = rendered(type)[0];
        return {
          color: node?.props.color,
          size: node?.props.size,
          strokeWidth: node?.props.strokeWidth,
        };
      }),
      [
        { color: '#ffffff', size: 30, strokeWidth: 2.5 },
        { color: '#ffffff', size: 30, strokeWidth: 2.5 },
        { color: '#ffffff', size: 30, strokeWidth: 2.5 },
      ],
    );

    const closeVisual = findByLabel('이미지 뷰어 닫기').props.visualStyle;
    assert.equal(
      resolveStyle(closeVisual, { hovered: true }).backgroundColor,
      'rgba(255, 255, 255, 0.16)',
    );
    assert.equal(
      resolveStyle(closeVisual, { pressed: true }).backgroundColor,
      'rgba(255, 255, 255, 0.24)',
    );
    assert.deepEqual(
      pick(resolveStyle(closeVisual, { focused: true }), [
        'outlineColor',
        'outlineOffset',
        'outlineStyle',
        'outlineWidth',
      ]),
      { outlineColor: '#ffffff', outlineOffset: -2, outlineStyle: 'solid', outlineWidth: 2 },
    );
    const disabledNavigationVisual = findByLabel('이전 이미지').props.visualStyle;
    assert.equal(resolveStyle(disabledNavigationVisual).opacity, 0.35);
    assert.equal(
      resolveStyle(disabledNavigationVisual, { hovered: true, pressed: true }).opacity,
      0.35,
    );

    const navigationVisual = findByLabel('다음 이미지').props.visualStyle;
    assert.equal(resolveStyle(navigationVisual, { hovered: true }).backgroundColor, 'transparent');
    assert.equal(resolveStyle(navigationVisual, { pressed: true }).backgroundColor, 'transparent');
    assert.equal(resolveStyle(navigationVisual).opacity, 1);
    assert.equal(resolveStyle(navigationVisual, { hovered: true }).opacity, 0.8);
    assert.equal(resolveStyle(navigationVisual, { pressed: true }).opacity, 0.6);
    assert.equal(resolveStyle(navigationVisual).boxShadow, undefined);
    assert.equal(resolveStyle(navigationVisual).filter, undefined);
    assert.deepEqual(
      pick(resolveStyle(navigationVisual, { focused: true }), [
        'outlineColor',
        'outlineOffset',
        'outlineStyle',
        'outlineWidth',
      ]),
      { outlineColor: '#ffffff', outlineOffset: -2, outlineStyle: 'solid', outlineWidth: 2 },
    );
  });

  it('viewer control halo는 플랫폼에서 지원되는 shadow를 사용한다', async () => {
    for (const platform of ['web', 'ios', 'android'] as const) {
      mockPlatform.OS = platform;
      await render({ currentIndex: 0 });

      for (const label of ['이미지 뷰어 닫기']) {
        const visualStyle = resolveStyle(findByLabel(label).props.visualStyle);
        assert.equal(
          visualStyle.boxShadow,
          platform === 'web' ? undefined : '0 1px 2px rgba(0, 0, 0, 0.9)',
        );
        assert.equal(
          visualStyle.filter,
          platform === 'web' ? 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.9))' : undefined,
        );
      }

      for (const label of ['이전 이미지', '다음 이미지']) {
        const visualStyle = resolveStyle(findByLabel(label).props.visualStyle);
        assert.equal(visualStyle.boxShadow, undefined);
        assert.equal(visualStyle.filter, undefined);
      }
    }
  });
});

function baseProps(overrides: Partial<SurfaceProps> = {}): SurfaceProps {
  return {
    contentRevisionId: 'content-a',
    currentIndex: 1,
    media: [media(1, '첫 번째 이미지'), media(2, '두 번째 이미지'), media(3, null), media(4, null)],
    onClose: () => undefined,
    onIndexChange: () => undefined,
    onNext: () => undefined,
    onPrevious: () => undefined,
    onRetry: () => undefined,
    compactDetail: createElement('CompactDetailContent'),
    presentation: 'compact',
    viewState: 'ready',
    ...overrides,
  };
}

async function render(input: Partial<SurfaceProps> | SurfaceProps = {}): Promise<void> {
  const Surface = PostMediaViewerSurface;
  assert.ok(Surface, 'PostMediaViewerSurface component must exist');
  const props = baseProps(input);
  await act(async () => {
    if (renderer) {
      renderer.update(createElement(Surface, props));
    } else {
      renderer = create(createElement(Surface, props));
    }
  });
  assert.ok(renderer);
}

function media(index: number, altText: string | null): PostMediaItem {
  return { altText, id: `media-${index}`, url: `https://media.example/${index}.webp` };
}

function image(): ReactTestInstance {
  return byTestId('post-media-viewer-image');
}

function findByLabel(label: string): ReactTestInstance {
  const result = queryByLabel(label);
  assert.ok(result, `element with accessibilityLabel ${label} must exist`);
  return result;
}

function queryByLabel(label: string): ReactTestInstance | null {
  return renderer?.root.findAll((node) => node.props.accessibilityLabel === label)[0] ?? null;
}

function byTestId(testID: string): ReactTestInstance {
  const result = queryByTestId(testID);
  assert.ok(result, `element with testID ${testID} must exist`);
  return result;
}

function queryByTestId(testID: string): ReactTestInstance | null {
  return renderer?.root.findAllByProps({ testID })[0] ?? null;
}

function queryByType(type: string): ReactTestInstance | null {
  return renderer?.root.findAll((node) => node.type === type)[0] ?? null;
}

function byRole(role: string): ReactTestInstance {
  const result = renderer?.root.findAll((node) => node.props.role === role)[0];
  assert.ok(result, `element with role ${role} must exist`);
  return result;
}

function rendered(type: string): ReactTestInstance[] {
  return renderer?.root.findAll((node) => node.type === type) ?? [];
}

function textContents(): string[] {
  return rendered('Text').map((node) =>
    node.children.filter((child): child is string => typeof child === 'string').join(''),
  );
}

function resolveStyle(
  style: unknown,
  state: { focused?: boolean; hovered?: boolean; pressed?: boolean } = {},
): Record<string, unknown> {
  return flattenStyle(
    typeof style === 'function'
      ? (style as (value: { focused?: boolean; hovered?: boolean; pressed: boolean }) => unknown)({
          focused: false,
          hovered: false,
          pressed: false,
          ...state,
        })
      : style,
  );
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!Array.isArray(style)) {
    return style && typeof style === 'object' ? (style as Record<string, unknown>) : {};
  }
  return Object.assign({}, ...style.flat(Infinity).filter(Boolean));
}

function pick(value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
