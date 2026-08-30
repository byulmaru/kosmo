import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { PostMediaItem } from './PostMediaImage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);

mock.module('react-native', {
  exports: {
    ActivityIndicator: 'ActivityIndicator',
    Image: 'Image',
    Platform: { OS: 'web' },
    Pressable: 'Pressable',
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
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/ui/IconButton', {
  exports: {
    IconButton: (props: Record<string, unknown>) => createElement('IconButton', props),
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
  actionTray?: ReactNode;
  contextRail?: ReactNode;
  currentIndex: number;
  media: readonly PostMediaItem[];
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onRetry: () => void;
  onRevealSensitive: () => void;
  presentation: 'compact' | 'wide';
  viewState: 'ready' | 'sensitive' | 'loading' | 'error' | 'unavailable';
}>;

let PostMediaViewerSurface: ComponentType<SurfaceProps> | undefined;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  PostMediaViewerSurface = (await import('./PostMediaViewerSurface'))
    .PostMediaViewerSurface as ComponentType<SurfaceProps>;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('PostMediaViewerSurface', () => {
  it('Ready와 Sensitive는 close, 상단 위치 status, 다중 navigation을 제공한다', async () => {
    for (const viewState of ['ready', 'sensitive'] as const) {
      await render({ viewState, currentIndex: 1 });

      assert.ok(findByLabel('이미지 뷰어 닫기'));
      assert.ok(findByLabel('이전 이미지'));
      assert.ok(findByLabel('다음 이미지'));
      assert.equal(byTestId('post-media-viewer-position').children.join(''), '2 / 4');
      assert.deepEqual(flattenStyle(byTestId('post-media-viewer-counter-position').props.style), {
        alignItems: 'center',
        left: 0,
        position: 'absolute',
        right: 0,
        top: 16,
      });
      assert.deepEqual(flattenStyle(byTestId('post-media-viewer-counter').props.style), {
        backgroundColor: '#000000',
        borderRadius: 16,
        color: '#ffffff',
        fontFamily: 'SUIT',
        fontSize: 14,
        fontWeight: '600',
        height: 30,
        lineHeight: 20,
        minWidth: 54,
        paddingHorizontal: 12,
        paddingVertical: 5,
        textAlign: 'center',
      });
    }
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
      onRevealSensitive: (...values: unknown[]) => args.push(values),
      viewState: 'sensitive',
    });

    findByLabel('이미지 뷰어 닫기').props.onPress({ type: 'press' });
    findByLabel('이전 이미지').props.onPress({ type: 'press' });
    findByLabel('다음 이미지').props.onPress({ type: 'press' });
    findByLabel('민감한 이미지 표시').props.onPress({ type: 'press' });

    assert.deepEqual(args, [[], [], [], []]);
    assert.equal(queryByType('Image'), null);
    assert.equal(byTestId('post-media-viewer-position').children.join(''), '2 / 4');
  });

  it('Ready image는 contain, trimmed alt name 또는 document fallback을 사용한다', async () => {
    await render({ currentIndex: 0, media: [media(1, '  Trimmed alt  ')] });
    assert.equal(image().props.accessibilityLabel, 'Trimmed alt');
    assert.equal(image().props.accessibilityRole, 'image');
    assert.equal(image().props.resizeMode, 'contain');

    await render({ currentIndex: 2, media: [media(1, null), media(2, null), media(3, null)] });
    assert.equal(image().props.accessibilityLabel, '3번째 첨부 이미지');
  });

  it('Sensitive는 image를 숨기고 설명·보기 action과 navigation·tray를 유지한다', async () => {
    let revealCount = 0;
    await render({
      actionTray: createElement('ActionTrayContent'),
      onRevealSensitive: () => revealCount++,
      viewState: 'sensitive',
    });

    assert.equal(queryByType('Image'), null);
    assert.equal(textContents().includes('민감한 미디어'), true);
    assert.equal(textContents().includes('표시하기 전에 내용을 확인해 주세요.'), true);
    assert.ok(findByLabel('이전 이미지'));
    assert.ok(findByLabel('다음 이미지'));
    assert.ok(byTestId('post-media-viewer-action-tray'));
    findByLabel('민감한 이미지 표시').props.onPress({ type: 'press' });
    assert.equal(revealCount, 1);
  });

  it('390 Compact와 1024·1440 Wide의 canonical frame·secondary geometry를 사용한다', async () => {
    await render({
      actionTray: createElement('ActionTrayContent'),
      contextRail: createElement('ContextRailContent'),
      presentation: 'compact',
    });
    assert.deepEqual(flattenStyle(byTestId('post-media-viewer-media-viewport').props.style), {
      alignItems: 'center',
      borderRadius: 8,
      bottom: 88,
      justifyContent: 'center',
      left: 16,
      overflow: 'hidden',
      position: 'absolute',
      right: 16,
      top: 80,
    });
    assert.deepEqual(flattenStyle(byTestId('post-media-viewer-action-tray').props.style), {
      backgroundColor: '#000000',
      borderRadius: 16,
      bottom: 16,
      height: 56,
      justifyContent: 'center',
      left: 16,
      paddingHorizontal: 22,
      position: 'absolute',
      right: 16,
    });
    assert.equal(flattenStyle(findByLabel('이미지 뷰어 닫기').props.style).right, 16);
    assert.equal(queryByTestId('post-media-viewer-context-rail'), null);

    await render({
      actionTray: createElement('ActionTrayContent'),
      contextRail: createElement('ContextRailContent'),
      presentation: 'wide',
    });
    assert.deepEqual(flattenStyle(byTestId('post-media-viewer-media-viewport').props.style), {
      alignItems: 'center',
      aspectRatio: 4 / 3,
      borderRadius: 8,
      justifyContent: 'center',
      maxHeight: 420,
      maxWidth: 560,
      overflow: 'hidden',
      width: '100%',
    });
    assert.equal(flattenStyle(byTestId('post-media-viewer-context-rail').props.style).width, 346);
    assert.equal(flattenStyle(findByLabel('이미지 뷰어 닫기').props.style).left, 16);
    assert.equal(queryByTestId('post-media-viewer-action-tray'), null);
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
        actionTray: createElement('ActionTrayContent'),
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
      assert.equal(queryByTestId('post-media-viewer-action-tray'), null);
      assert.ok(queryByTestId('post-media-viewer-context-rail'));
    }

    await render({ viewState: 'loading' });
    assert.ok(byTestId('post-media-viewer-loading-indicator'));
    assert.equal(queryByLabel('다시 시도'), null);

    let retryCount = 0;
    await render({ onRetry: () => retryCount++, viewState: 'error' });
    findByLabel('다시 시도').props.onPress({ type: 'press' });
    assert.equal(retryCount, 1);

    await render({ viewState: 'unavailable' });
    assert.equal(queryByLabel('다시 시도'), null);
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
    assert.equal(resolveStyle(findByLabel('이전 이미지').props.visualStyle).opacity, 0.35);
  });
});

function baseProps(overrides: Partial<SurfaceProps> = {}): SurfaceProps {
  return {
    currentIndex: 1,
    media: [media(1, '첫 번째 이미지'), media(2, '두 번째 이미지'), media(3, null), media(4, null)],
    onClose: () => undefined,
    onNext: () => undefined,
    onPrevious: () => undefined,
    onRetry: () => undefined,
    onRevealSensitive: () => undefined,
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
