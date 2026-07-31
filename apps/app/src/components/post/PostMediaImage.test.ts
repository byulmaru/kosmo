import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { PostMediaItem } from './PostMediaImage';

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

let PostMediaImage: ComponentType<{ index: number; interactive?: boolean; item: PostMediaItem }>;
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

  it('초기 크기 조회가 실패해도 성공한 Image load 뒤 원본 비율을 다시 조회한다', async () => {
    await render(0, media('transient-size-error', '가로 이미지'));
    assert.equal(frameAspectRatio('transient-size-error'), 1);

    await act(async () => image('transient-size-error').props.onLoad());

    assert.equal(frameAspectRatio('transient-size-error'), 1600 / 900);
    assert.equal(getSizeAttempts.get(media('transient-size-error', null).url!), 2);
  });

  it('오류 뒤 같은 URL로 Image를 다시 mount한다', async () => {
    await render(0, media('landscape', '가로 이미지'));
    const source = image('landscape').props.source;

    await act(async () => image('landscape').props.onError());
    assert.equal(rendered('Image').length, 0);

    await act(async () => pressable('가로 이미지 다시 시도').props.onPress());
    assert.deepEqual(image('landscape').props.source, source);

    await act(async () => image('landscape').props.onError());
    assert.equal(pressable('가로 이미지 다시 시도').props.accessibilityRole, 'button');
  });

  it('URL이 없으면 재시도 없이 fallback을 표시한다', async () => {
    await render(0, { ...media('missing', null), url: null });

    assert.ok(byTestId('post-media-error-missing'));
    assert.equal(rendered('Pressable').length, 0);
  });

  it('비대화형 이미지 오류에서는 재시도 control을 표시하지 않는다', async () => {
    await render(0, media('landscape', '가로 이미지'), false);

    await act(async () => image('landscape').props.onError());
    assert.ok(byTestId('post-media-error-landscape'));
    assert.equal(rendered('Pressable').length, 0);
  });
});

function media(id: string, altText: string | null): PostMediaItem {
  return { altText, id, url: `https://media.example/${id}.webp` };
}

async function render(index: number, item: PostMediaItem, interactive = true) {
  await act(async () => {
    if (renderer) {
      renderer.update(createElement(PostMediaImage, { index, interactive, item }));
    } else {
      renderer = create(createElement(PostMediaImage, { index, interactive, item }));
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
