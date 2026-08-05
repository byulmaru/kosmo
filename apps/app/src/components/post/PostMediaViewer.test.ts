import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode, RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { PostMediaItem } from './PostMediaImage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
const viewport = { height: 800, width: 767 };
let panResponderConfig: Record<string, (...args: never[]) => unknown> | null = null;
let keydownListener: ((event: KeyboardEvent) => void) | null = null;
let closeFocused = 0;
const viewerKeyTarget = { tagName: 'DIV' };
const childOverlayKeyTarget = { tagName: 'DIV' };

Object.assign(globalThis, {
  addEventListener: (type: string, listener: (event: KeyboardEvent) => void) => {
    if (type === 'keydown') {
      keydownListener = listener;
    }
  },
  removeEventListener: (type: string, listener: (event: KeyboardEvent) => void) => {
    if (type === 'keydown' && keydownListener === listener) {
      keydownListener = null;
    }
  },
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  },
});

mock.module('react-native', {
  exports: {
    Image: 'Image',
    Modal: 'Modal',
    PanResponder: {
      create: (config: Record<string, (...args: never[]) => unknown>) => {
        panResponderConfig = config;
        return { panHandlers: { testID: 'pan-handlers' } };
      },
    },
    Platform: platform,
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    StyleSheet: { create: <T>(styles: T) => styles },
    Text: 'Text',
    View: 'View',
    useWindowDimensions: () => viewport,
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('lucide-react-native', {
  exports: {
    ChevronLeftIcon: 'ChevronLeftIcon',
    ChevronRightIcon: 'ChevronRightIcon',
    XIcon: 'XIcon',
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/ui/Avatar', {
  exports: { Avatar: (props: Record<string, unknown>) => createElement('Avatar', props) },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/theme/ThemeProvider', {
  exports: {
    useTheme: () => ({
      background: '#ffffff',
      border: '#333333',
      card: '#fafafa',
      surface: '#222222',
      text: '#ffffff',
      textSecondary: '#999999',
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

type ViewerProps = {
  actionBar: ReactNode;
  bodyText: string;
  contentId: string;
  fallbackFocus?: RefObject<NativeView | null>;
  media: ReadonlyArray<PostMediaItem>;
  onClose: () => void;
  originControl: RefObject<NativeView | null>;
  profile: {
    avatarUrl: string | null;
    displayName: string;
    handle: string;
  };
  selectedIndex: number;
  wideDetail: ReactNode;
};

let PostMediaViewer: ComponentType<ViewerProps>;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ PostMediaViewer } = await import('./PostMediaViewer'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  platform.OS = 'web';
  viewport.height = 800;
  viewport.width = 767;
  panResponderConfig = null;
  keydownListener = null;
  closeFocused = 0;
});

describe('PostMediaViewer', () => {
  it('선택 index에서 시작해 non-wrapping control과 다중 위치를 제공한다', async () => {
    await render({ selectedIndex: 1 });

    assert.equal(currentImage().props.accessibilityLabel, '두 번째 이미지');
    assert.equal(textContents().includes('2 / 3'), true);
    assert.equal(byTestId('post-media-viewer-counter').props['aria-hidden'], true);
    assert.equal(byTestId('post-media-viewer-position').props.role, 'status');
    assert.deepEqual(pressable('이전 이미지').props.accessibilityState, { disabled: false });
    assert.deepEqual(pressable('다음 이미지').props.accessibilityState, { disabled: false });

    await act(async () => pressable('다음 이미지').props.onPress());
    assert.equal(currentImage().props.accessibilityLabel, '3번째 첨부 이미지');
    assert.deepEqual(pressable('다음 이미지').props.accessibilityState, { disabled: true });
    await act(async () => pressable('다음 이미지').props.onPress());
    assert.equal(currentImage().props.accessibilityLabel, '3번째 첨부 이미지');
  });

  it('단일 Media는 시각 counter 없이 Alt Text와 별도 위치 설명을 제공한다', async () => {
    await render({ media: [media(0, '한 장의 설명')], selectedIndex: 0 });

    assert.equal(currentImage().props.accessibilityLabel, '한 장의 설명');
    assert.equal(
      rendered('Text').some((node) => node.props.testID === 'post-media-viewer-counter'),
      false,
    );
    assert.equal(
      rendered('Pressable').some((node) => node.props.accessibilityLabel === '이전 이미지'),
      false,
    );
    assert.equal(byTestId('post-media-viewer-position').props.role, 'status');
    assert.equal(byTestId('post-media-viewer-position').children.join(''), '1 / 1');
  });

  it('Web keyboard와 Native swipe가 같은 인접 index를 사용한다', async () => {
    await render({ selectedIndex: 1 });
    assert.ok(keydownListener);
    await act(async () =>
      keydownListener?.({
        altKey: false,
        ctrlKey: false,
        defaultPrevented: false,
        key: 'ArrowLeft',
        metaKey: false,
        preventDefault: () => undefined,
        target: viewerKeyTarget,
      } as unknown as KeyboardEvent),
    );
    assert.equal(currentImage().props.accessibilityLabel, '첫 번째 이미지');

    await act(async () =>
      keydownListener?.({
        altKey: false,
        ctrlKey: false,
        defaultPrevented: false,
        key: 'ArrowRight',
        metaKey: false,
        preventDefault: () => undefined,
        target: childOverlayKeyTarget,
      } as unknown as KeyboardEvent),
    );
    assert.equal(currentImage().props.accessibilityLabel, '첫 번째 이미지');

    platform.OS = 'ios';
    await render({ contentId: 'content-2', selectedIndex: 1 });
    assert.ok(panResponderConfig);
    assert.equal(
      panResponderConfig.onMoveShouldSetPanResponder?.(
        null as never,
        {
          dx: -40,
          dy: 4,
        } as never,
      ),
      true,
    );
    await act(async () => {
      panResponderConfig?.onPanResponderRelease?.(null as never, { dx: -80, dy: 4 } as never);
    });
    assert.equal(currentImage().props.accessibilityLabel, '3번째 첨부 이미지');
  });

  it('767px Web과 Native는 세로, 768px Web은 좌우 layout을 사용한다', async () => {
    await render();
    assert.equal(
      flattenStyle(byTestId('post-media-viewer-layout').props.style).flexDirection,
      'column',
    );
    assert.equal(
      flattenStyle(byTestId('post-media-viewer-detail').props.style).backgroundColor,
      '#fafafa',
    );

    viewport.width = 768;
    await render();
    assert.equal(
      flattenStyle(byTestId('post-media-viewer-layout').props.style).flexDirection,
      'row',
    );
    assert.ok(byTestId('post-media-viewer-wide-detail'));
    assert.equal(renderer?.root.findAllByProps({ testID: 'post-media-viewer-detail' }).length, 0);
    assert.equal(
      flattenStyle(byTestId('post-media-viewer-wide-detail').props.style).flexBasis,
      320,
    );
    assert.equal(flattenStyle(byTestId('post-media-viewer-backdrop').props.style).padding, 24);

    viewport.width = 1200;
    await render();
    assert.equal(
      flattenStyle(byTestId('post-media-viewer-wide-detail').props.style).flexBasis,
      320,
    );

    viewport.width = 1440;
    await render();
    assert.equal(
      flattenStyle(byTestId('post-media-viewer-wide-detail').props.style).flexBasis,
      350,
    );
    assert.equal(
      flattenStyle(byTestId('post-media-viewer-dialog').props.style).maxWidth,
      undefined,
    );

    platform.OS = 'android';
    viewport.width = 1200;
    await render();
    assert.equal(
      flattenStyle(byTestId('post-media-viewer-layout').props.style).flexDirection,
      'column',
    );
    assert.equal(
      flattenStyle(byTestId('post-media-viewer-detail').props.style).flexBasis,
      undefined,
    );
    assert.equal(
      flattenStyle(byTestId('post-media-viewer-backdrop').props.style).padding,
      undefined,
    );
  });

  it('Compact detail은 내용 높이를 따르고 viewport 상한 안에서 body만 줄어든다', async () => {
    await render();
    assert.equal(flattenStyle(byTestId('post-media-viewer-detail').props.style).maxHeight, 240);
    assert.equal(flattenStyle(byTestId('post-media-viewer-detail').props.style).flex, undefined);
    assert.equal(
      flattenStyle(byTestId('post-media-viewer-body-region').props.style).flex,
      undefined,
    );
    assert.equal(flattenStyle(byTestId('post-media-viewer-body-region').props.style).flexShrink, 1);

    viewport.height = 600;
    await render();
    assert.equal(flattenStyle(byTestId('post-media-viewer-detail').props.style).maxHeight, 192);
    assert.ok(byTestId('post-media-viewer-action-bar'));

    viewport.height = 390;
    await render();
    assert.equal(flattenStyle(byTestId('post-media-viewer-detail').props.style).maxHeight, 192);
    assert.ok(byTestId('post-media-viewer-action-bar'));
  });

  it('실제 3줄 초과 원문만 펼치고 text 영역 안에서 접는다', async () => {
    viewport.height = 390;
    await render();
    assert.equal(
      rendered('Pressable').some((node) => node.props.accessibilityLabel === '원문 더 보기'),
      false,
    );

    await act(async () =>
      byTestId('post-media-viewer-body-measure').props.onLayout({
        nativeEvent: { layout: { height: 96 } },
      }),
    );
    const more = pressable('원문 더 보기');
    assert.deepEqual(more.props.accessibilityState, { expanded: false });
    const collapsedBody = flattenStyle(byTestId('post-media-viewer-collapsed-body').props.style);
    assert.equal(collapsedBody.flexShrink, 1);
    assert.equal(collapsedBody.minHeight, 0);
    assert.equal(collapsedBody.overflow, 'hidden');
    assert.equal(flattenStyle(more.props.style).flexShrink, 0);
    await act(async () => more.props.onPress());
    assert.ok(byTestId('post-media-viewer-body-scroll'));
    assert.deepEqual(pressable('원문 접기').props.accessibilityState, { expanded: true });
    assert.ok(byTestId('post-media-viewer-action-bar'));
  });

  it('Media error와 retry를 identity별로 유지한다', async () => {
    await render({ selectedIndex: 0 });
    await act(async () => currentImage().props.onError());
    assert.ok(byTestId('post-media-viewer-error-media-1'));
    assert.equal(
      textContents().some((text) => text.includes('https://')),
      false,
    );

    await act(async () => pressable('첫 번째 이미지 다시 시도').props.onPress());
    assert.ok(currentImage());
    await act(async () => currentImage().props.onError());
    await act(async () => pressable('다음 이미지').props.onPress());
    await act(async () => pressable('이전 이미지').props.onPress());
    assert.ok(byTestId('post-media-viewer-error-media-1'));
  });

  it('같은 Media의 Image load callback을 state update 뒤에도 재사용한다', async () => {
    await render({ selectedIndex: 0 });
    const onLoadStart = currentImage().props.onLoadStart;
    const onLoad = currentImage().props.onLoad;
    const onError = currentImage().props.onError;

    await act(async () => onLoadStart());
    assert.equal(currentImage().props.onLoadStart, onLoadStart);
    assert.equal(currentImage().props.onLoad, onLoad);
    assert.equal(currentImage().props.onError, onError);
  });

  it('platform dismiss·backdrop은 닫고 내부 surface는 backdrop과 분리한다', async () => {
    let closed = 0;
    let originFocused = 0;
    const originControl = {
      current: { focus: () => originFocused++ } as unknown as NativeView,
    };
    await render({ onClose: () => closed++, originControl });
    assert.equal(closeFocused, 1);
    assert.equal(
      byTestId('post-media-viewer-dialog').parent,
      byTestId('post-media-viewer-backdrop-dismiss').parent,
    );

    await act(async () => byTestId('post-media-viewer-backdrop-dismiss').props.onPress());
    assert.equal(closed, 1);
    assert.equal(originFocused, 1);

    await act(async () => rendered('Modal')[0]!.props.onRequestClose());
    assert.equal(closed, 2);
    assert.equal(originFocused, 2);
  });

  it('origin tile이 없으면 안전한 Post surface로 focus를 복귀한다', async () => {
    let fallbackFocused = 0;
    await render({
      fallbackFocus: {
        current: { focus: () => fallbackFocused++ } as unknown as NativeView,
      },
      originControl: { current: null },
    });

    await act(async () => rendered('Modal')[0]!.props.onRequestClose());
    assert.equal(fallbackFocused, 1);
  });

  it('Web child overlay가 처리한 Escape는 뒤의 Viewer까지 닫지 않는다', async () => {
    let closed = 0;
    await render({ onClose: () => closed++ });
    await act(async () =>
      keydownListener?.({
        altKey: false,
        ctrlKey: false,
        defaultPrevented: false,
        key: 'Escape',
        metaKey: false,
        preventDefault: () => undefined,
        target: childOverlayKeyTarget,
      } as unknown as KeyboardEvent),
    );

    await act(async () => rendered('Modal')[0]!.props.onRequestClose());
    assert.equal(closed, 0);
    await act(async () => rendered('Modal')[0]!.props.onRequestClose());
    assert.equal(closed, 1);
  });
});

function defaultProps(): ViewerProps {
  return {
    actionBar: createElement('ActionBar'),
    bodyText: '네 줄 이상이 될 수 있는 원문입니다.',
    contentId: 'content-1',
    media: [media(0, '첫 번째 이미지'), media(1, '두 번째 이미지'), media(2, null)],
    onClose: () => undefined,
    originControl: { current: null },
    profile: {
      avatarUrl: 'https://media.example/avatar.webp',
      displayName: '작성자',
      handle: 'author',
    },
    selectedIndex: 0,
    wideDetail: createElement('WideDetail'),
  };
}

function media(index: number, altText: string | null): PostMediaItem {
  return {
    altText,
    id: `media-${index + 1}`,
    url: `https://media.example/${index + 1}.webp`,
  };
}

async function render(overrides: Partial<ViewerProps> = {}) {
  const props = { ...defaultProps(), ...overrides };
  await act(async () => {
    if (renderer) {
      renderer.update(createElement(PostMediaViewer, props));
    } else {
      renderer = create(createElement(PostMediaViewer, props), {
        createNodeMock: (element) => {
          const elementProps = element.props as Record<string, unknown>;
          if (elementProps.testID === 'post-media-viewer-close') {
            return { focus: () => closeFocused++ };
          }
          if (elementProps.testID === 'post-media-viewer-dialog') {
            return { contains: (target: unknown) => target === viewerKeyTarget };
          }
          return {};
        },
      });
    }
  });
  assert.ok(renderer);
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function pressable(accessibilityLabel: string): ReactTestInstance {
  const result = rendered('Pressable').find(
    (node) => node.props.accessibilityLabel === accessibilityLabel,
  );
  assert.ok(result);
  return result;
}

function currentImage(): ReactTestInstance {
  return byTestId('post-media-viewer-image');
}

function byTestId(testID: string): ReactTestInstance {
  assert.ok(renderer);
  return renderer.root.findByProps({ testID });
}

function textContents(): string[] {
  return rendered('Text').map((node) =>
    node.children.filter((child): child is string => typeof child === 'string').join(''),
  );
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (result, value) => ({ ...result, ...flattenStyle(value) }),
      {},
    );
  }
  return (style ?? {}) as Record<string, unknown>;
}
