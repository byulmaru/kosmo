import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { PostMediaItem, PostMediaOpenHandler } from './PostMediaImage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ImageMock = Object.assign((props: Record<string, unknown>) => createElement('Image', props), {
  getSize: (
    uri: string,
    success: (width: number, height: number) => void,
    failure?: () => void,
  ) => {
    const attempts = getSizeAttempts.get(uri) ?? 0;
    getSizeAttempts.set(uri, attempts + 1);
    if (uri.endsWith('/transient-size-error.webp') && attempts === 0) {
      failure?.();
      return;
    }
    success(
      uri.endsWith('/portrait.webp') ? 900 : 1600,
      uri.endsWith('/portrait.webp') ? 1600 : 900,
    );
  },
});
const getSizeAttempts = new Map<string, number>();

mock.module('react-native', {
  exports: {
    Image: ImageMock,
    Pressable: 'Pressable',
    StyleSheet: { create: <T>(styles: T) => styles },
    Text: 'Text',
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);

let PostMediaImage: ComponentType<{
  fill?: boolean;
  index: number;
  interactive?: boolean;
  item: PostMediaItem;
  onOpen?: PostMediaOpenHandler;
}>;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ PostMediaImage } = await import('./PostMediaImage'));
});

afterEach(async () => {
  getSizeAttempts.clear();
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('PostMediaImage', () => {
  it('nullable Alt Text fallback과 원본 비율을 적용하되 세로 이미지는 정사각형으로 제한한다', async () => {
    await render(1, media('landscape', null));

    assert.equal(image('landscape').props.accessibilityLabel, '2번째 첨부 이미지');
    assert.equal(frameAspectRatio('landscape'), 1600 / 900);

    await render(0, media('portrait', '세로 이미지'));
    assert.equal(frameAspectRatio('portrait'), 1);
  });

  it('Image 이벤트 callback을 재사용한다', async () => {
    await render(0, media('landscape', '가로 이미지'));
    const firstOnLoad = image('landscape').props.onLoad;

    await act(async () => firstOnLoad());

    assert.equal(image('landscape').props.onLoad, firstOnLoad);
  });

  it('interactive 정상 image tile은 viewer 목적을 알리고 선택 index만 연다', async () => {
    let openedIndex: number | null = null;
    let originControl: unknown;
    let stopped = false;
    await render(2, media('landscape', '가로 이미지'), true, true, (index, origin) => {
      openedIndex = index;
      originControl = origin;
    });

    const open = pressable('가로 이미지 크게 보기');
    assert.equal(open.props.accessibilityRole, 'button');
    await act(async () =>
      open.props.onPress({
        stopPropagation: () => {
          stopped = true;
        },
      }),
    );

    assert.equal(openedIndex, 2);
    assert.equal(stopped, true);
    assert.equal(typeof originControl, 'object');

    await render(2, media('landscape', '가로 이미지'), false, true, () => undefined);
    assert.equal(rendered('Pressable').length, 0);
  });

  it('초기 크기 조회가 실패해도 성공한 Image load 뒤 원본 비율을 다시 조회한다', async () => {
    await render(0, media('transient-size-error', '가로 이미지'));
    assert.equal(frameAspectRatio('transient-size-error'), 1);

    await act(async () => image('transient-size-error').props.onLoad());

    assert.equal(frameAspectRatio('transient-size-error'), 1600 / 900);
    assert.equal(getSizeAttempts.get(media('transient-size-error', null).url!), 2);
  });

  it('단일 이미지 오류에서 action만 표시하고 같은 URL로 Image를 다시 mount한다', async () => {
    await render(0, media('landscape', '가로 이미지'));
    const source = image('landscape').props.source;

    await act(async () => image('landscape').props.onError());
    assert.equal(rendered('Image').length, 0);
    assert.deepEqual(textContents(), ['다시 시도']);

    await act(async () => pressable('가로 이미지 다시 시도').props.onPress());
    assert.deepEqual(image('landscape').props.source, source);

    await act(async () => image('landscape').props.onError());
    assert.equal(pressable('가로 이미지 다시 시도').props.accessibilityRole, 'button');
  });

  it('URL이 없으면 재시도 없이 fallback을 표시한다', async () => {
    await render(0, { ...media('missing', null), url: null }, true, true);

    assert.ok(byTestId('post-media-error-missing'));
    assert.equal(rendered('Pressable').length, 0);
    assert.equal(textContents().includes('1번째 첨부 이미지을 불러오지 못했습니다.'), true);
  });

  it('비대화형 이미지 오류에서는 재시도 control을 표시하지 않는다', async () => {
    await render(0, media('landscape', '가로 이미지'), false, true);

    await act(async () => image('landscape').props.onError());
    assert.ok(byTestId('post-media-error-landscape'));
    assert.equal(rendered('Pressable').length, 0);
    assert.equal(textContents().includes('가로 이미지을 불러오지 못했습니다.'), true);
  });

  it('tile 경계에서는 measured aspect ratio 대신 frame을 채우고 fallback도 같은 경계를 채운다', async () => {
    await render(0, media('landscape', '가로 이미지'), true, true);

    const frameStyle = flattenStyle(byTestId('post-media-frame-landscape').props.style);
    assert.equal(frameStyle.height, '100%');
    assert.equal(frameStyle.aspectRatio, undefined);
    assert.equal(flattenStyle(image('landscape').props.style).height, '100%');

    await act(async () => image('landscape').props.onError());
    const fallbackStyle = flattenStyle(byTestId('post-media-error-landscape').props.style);
    assert.equal(fallbackStyle.height, '100%');
    assert.equal(fallbackStyle.minHeight, 0);
    assert.deepEqual(textContents(), ['다시 시도']);
    const retryStyle = flattenPressableStyle(pressable('가로 이미지 다시 시도').props.style);
    assert.equal(retryStyle.minHeight, 48);
    assert.equal(retryStyle.minWidth, 0);
    assert.equal(retryStyle.width, '100%');
  });
});

function media(id: string, altText: string | null): PostMediaItem {
  return { altText, id, url: `https://media.example/${id}.webp` };
}

async function render(
  index: number,
  item: PostMediaItem,
  interactive = true,
  fill = false,
  onOpen?: PostMediaOpenHandler,
) {
  await act(async () => {
    if (renderer) {
      renderer.update(createElement(PostMediaImage, { fill, index, interactive, item, onOpen }));
    } else {
      renderer = create(createElement(PostMediaImage, { fill, index, interactive, item, onOpen }));
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

function image(id: string): ReactTestInstance {
  return byTestId(`post-media-image-${id}`);
}

function frameAspectRatio(id: string): number | undefined {
  const style = byTestId(`post-media-frame-${id}`).props.style as ReadonlyArray<{
    aspectRatio?: number;
  }>;
  return style.find(({ aspectRatio }) => aspectRatio !== undefined)?.aspectRatio;
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

function flattenPressableStyle(style: unknown): Record<string, unknown> {
  return flattenStyle(typeof style === 'function' ? style({ pressed: false }) : style);
}
