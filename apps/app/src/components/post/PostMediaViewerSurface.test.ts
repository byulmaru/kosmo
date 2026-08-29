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
    Image: 'Image',
    StyleSheet: { create: <T>(styles: T) => styles },
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
    EyeIcon: icon('EyeIcon'),
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
  it('ready와 sensitive는 close, 위치 status, 다중 navigation을 제공한다', async () => {
    for (const viewState of ['ready', 'sensitive'] as const) {
      await render({ viewState, currentIndex: 1 });

      assert.ok(findByLabel('이미지 뷰어 닫기'));
      assert.ok(findByLabel('이전 이미지'));
      assert.ok(findByLabel('다음 이미지'));
      assert.equal(byTestId('post-media-viewer-position').children.join(''), '2 / 4');
      const counterStyle = flattenStyle(byTestId('post-media-viewer-counter').props.style);
      assert.equal(counterStyle.position, 'absolute');
      assert.equal(counterStyle.bottom, 8);
      assert.equal(counterStyle.left, 0);
      assert.equal(counterStyle.right, 0);
      assert.equal(counterStyle.textAlign, 'center');
    }
  });

  it('단일 media에서는 visual navigation과 counter를 숨긴다', async () => {
    await render({ currentIndex: 0, media: [media(1, '한 장의 설명')] });

    assert.equal(queryByLabel('이전 이미지'), null);
    assert.equal(queryByLabel('다음 이미지'), null);
    assert.equal(queryByTestId('post-media-viewer-counter'), null);
    assert.equal(byTestId('post-media-viewer-position').children.join(''), '1 / 1');
  });

  it('첫·중간·마지막 위치의 경계를 accessibility state와 disabled callback으로 지킨다', async () => {
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

  it('모든 callback은 event 없이 한 번 호출되고 surface는 controlled index를 보존한다', async () => {
    const args: unknown[][] = [];
    const props = baseProps({
      currentIndex: 1,
      onClose: (...values: unknown[]) => args.push(values),
      onNext: (...values: unknown[]) => args.push(values),
      onPrevious: (...values: unknown[]) => args.push(values),
      onRevealSensitive: (...values: unknown[]) => args.push(values),
      viewState: 'sensitive',
    });

    await render(props);
    findByLabel('이미지 뷰어 닫기').props.onPress({ type: 'press' });
    findByLabel('이전 이미지').props.onPress({ type: 'press' });
    findByLabel('다음 이미지').props.onPress({ type: 'press' });
    findByLabel('민감한 이미지 표시').props.onPress({ type: 'press' });

    assert.deepEqual(args, [[], [], [], []]);
    assert.equal(queryByType('Image'), null);
    assert.equal(byTestId('post-media-viewer-position').children.join(''), '2 / 4');
  });

  it('ready image는 contain, trimmed alt name 또는 document fallback을 사용한다', async () => {
    await render({ currentIndex: 0, media: [media(1, '  Trimmed alt  ')] });
    assert.equal(image().props.accessibilityLabel, 'Trimmed alt');
    assert.equal(image().props.resizeMode, 'contain');

    await render({ currentIndex: 2, media: [media(1, null), media(2, null), media(3, null)] });
    assert.equal(image().props.accessibilityLabel, '3번째 첨부 이미지');
  });

  it('sensitive는 image를 숨기고 canonical reveal IconButton을 표시한다', async () => {
    await render({ viewState: 'sensitive' });

    assert.equal(queryByType('Image'), null);
    const reveal = findByLabel('민감한 이미지 표시');
    assert.deepEqual(reveal.props.accessibilityState, { disabled: false });
    assert.equal(reveal.props.targetSize, 48);
    assert.equal(reveal.props.visualSize, 48);
  });

  it('compact는 56px fixed-black action tray만, wide는 full-height context rail만 표시한다', async () => {
    await render({
      actionTray: createElement('ActionTrayContent'),
      contextRail: createElement('ContextRailContent'),
      presentation: 'compact',
    });
    const tray = byTestId('post-media-viewer-action-tray');
    assert.deepEqual(flattenStyle(tray.props.style), { backgroundColor: '#000000', height: 56 });
    assert.ok(queryByType('ActionTrayContent'));
    assert.equal(queryByTestId('post-media-viewer-context-rail'), null);
    assert.equal(queryByType('ContextRailContent'), null);

    await render({
      actionTray: createElement('ActionTrayContent'),
      contextRail: createElement('ContextRailContent'),
      presentation: 'wide',
    });
    const rail = byTestId('post-media-viewer-context-rail');
    assert.equal(flattenStyle(rail.props.style).alignSelf, 'stretch');
    assert.equal(flattenStyle(rail.props.style).flex, undefined);
    assert.ok(queryByType('ContextRailContent'));
    assert.equal(queryByTestId('post-media-viewer-action-tray'), null);
    assert.equal(queryByType('ActionTrayContent'), null);
  });

  it('root overlay와 media pane은 fixed viewer black surface를 소유한다', async () => {
    await render();

    assert.equal(
      flattenStyle(byTestId('post-media-viewer-surface').props.style).backgroundColor,
      'rgba(0, 0, 0, 0.7)',
    );
    assert.equal(
      flattenStyle(byTestId('post-media-viewer-media-pane').props.style).backgroundColor,
      '#000000',
    );
  });

  it('loading, error, unavailable은 안전한 status와 close만 제공한다', async () => {
    const statuses = {
      loading: '이미지를 불러오는 중입니다.',
      error: '이미지를 불러오지 못했습니다.',
      unavailable: '이미지를 더 이상 표시할 수 없습니다.',
    } as const;

    for (const [viewState, status] of Object.entries(statuses) as Array<
      [keyof typeof statuses, string]
    >) {
      await render({
        actionTray: createElement('ActionTrayContent'),
        contextRail: createElement('ContextRailContent'),
        viewState,
      });

      assert.equal(textContents().includes(status), true);
      assert.ok(findByLabel('이미지 뷰어 닫기'));
      assert.equal(queryByLabel('이전 이미지'), null);
      assert.equal(queryByLabel('다음 이미지'), null);
      assert.equal(queryByLabel('민감한 이미지 표시'), null);
      assert.equal(queryByTestId('post-media-viewer-action-tray'), null);
      assert.equal(queryByTestId('post-media-viewer-context-rail'), null);
    }
  });

  it('close, navigation, reveal control은 48 target·48 visual과 지정된 Lucide geometry를 사용한다', async () => {
    await render({ viewState: 'sensitive', currentIndex: 1 });

    assert.deepEqual(
      ['이미지 뷰어 닫기', '이전 이미지', '다음 이미지', '민감한 이미지 표시'].map((label) => {
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
        { label: '민감한 이미지 표시', targetSize: 48, visualSize: 48 },
      ],
    );

    assert.deepEqual(
      ['XIcon', 'ChevronLeftIcon', 'ChevronRightIcon', 'EyeIcon'].map((type) => {
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
        { color: '#ffffff', size: 30, strokeWidth: 2.5 },
      ],
    );
  });
});

function baseProps(overrides: Partial<SurfaceProps> = {}): SurfaceProps {
  return {
    currentIndex: 1,
    media: [media(1, '첫 번째 이미지'), media(2, '두 번째 이미지'), media(3, null), media(4, null)],
    onClose: () => undefined,
    onNext: () => undefined,
    onPrevious: () => undefined,
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

function rendered(type: string): ReactTestInstance[] {
  return renderer?.root.findAll((node) => node.type === type) ?? [];
}

function textContents(): string[] {
  return rendered('Text').map((node) =>
    node.children.filter((child): child is string => typeof child === 'string').join(''),
  );
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!Array.isArray(style)) {
    return style && typeof style === 'object' ? (style as Record<string, unknown>) : {};
  }
  return Object.assign({}, ...style.flat(Infinity).filter(Boolean));
}
