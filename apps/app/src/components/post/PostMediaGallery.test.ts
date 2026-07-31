import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { PostMediaItem } from './PostMediaGallery';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

mock.module('react-native', {
  exports: {
    Image: 'Image',
    Pressable: 'Pressable',
    StyleSheet: { create: <T>(styles: T) => styles },
    Text: 'Text',
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);

let PostMediaGallery: ComponentType<{
  media: ReadonlyArray<PostMediaItem> | null;
  sensitive: boolean;
}>;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ PostMediaGallery } = await import('./PostMediaGallery'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('PostMediaGallery', () => {
  it('document 순서의 최대 네 이미지와 nullable Alt Text fallback을 표시한다', async () => {
    await render({
      media: Array.from({ length: 5 }, (_, index) =>
        media(index + 1, index === 1 ? null : `설명 ${index + 1}`),
      ),
      sensitive: false,
    });

    assert.deepEqual(
      rendered('Image').map((image) => image.props.accessibilityLabel),
      ['설명 1', '2번째 첨부 이미지', '설명 3', '설명 4'],
    );

    const firstOnLoad = image('media-1').props.onLoad;
    await act(async () => firstOnLoad());
    assert.equal(image('media-1').props.onLoad, firstOnLoad);
  });

  it('Sensitive Media를 image mount 없이 시작하고 전체 표시와 다시 가리기를 제공한다', async () => {
    await render({ media: [media(1, null), media(2, '두 번째 이미지')], sensitive: true });

    assert.equal(rendered('Image').length, 0);
    const reveal = pressable('민감한 이미지 표시');
    assert.deepEqual(reveal.props.accessibilityState, { expanded: false });

    await act(async () => reveal.props.onPress());
    assert.equal(rendered('Image').length, 2);
    const hide = pressable('민감한 이미지 다시 가리기');
    assert.deepEqual(hide.props.accessibilityState, { expanded: true });

    await act(async () => hide.props.onPress());
    assert.equal(rendered('Image').length, 0);
  });

  it('한 이미지 오류를 격리하고 같은 URL로 해당 Image만 다시 mount한다', async () => {
    await render({
      media: [media(1, '첫 번째 이미지'), media(2, '두 번째 이미지')],
      sensitive: false,
    });
    const firstUrl = image('media-1').props.source;

    await act(async () => image('media-1').props.onError());
    assert.equal(rendered('Image').length, 1);
    assert.equal(rendered('Image')[0]?.props.accessibilityLabel, '두 번째 이미지');

    await act(async () => pressable('첫 번째 이미지 다시 시도').props.onPress());
    assert.equal(rendered('Image').length, 2);
    assert.deepEqual(image('media-1').props.source, firstUrl);

    await act(async () => image('media-1').props.onError());
    assert.equal(pressable('첫 번째 이미지 다시 시도').props.accessibilityRole, 'button');
  });

  it('표시 정보 unavailable과 URL 없는 Media를 Post 전체 오류 없이 구분한다', async () => {
    await render({ media: null, sensitive: false });
    assert.equal(byTestId('post-media-unavailable').props.accessibilityRole, 'alert');

    await render({ media: [{ ...media(1, null), url: null }], sensitive: false });
    assert.ok(byTestId('post-media-error-media-1'));
    assert.equal(rendered('Pressable').length, 0);
  });
});

function media(index: number, altText: string | null): PostMediaItem {
  return { altText, id: `media-${index}`, url: `https://media.example/${index}.webp` };
}

async function render(props: { media: ReadonlyArray<PostMediaItem> | null; sensitive: boolean }) {
  await act(async () => {
    if (renderer) {
      renderer.update(createElement(PostMediaGallery, props));
    } else {
      renderer = create(createElement(PostMediaGallery, props));
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

function byTestId(testID: string): ReactTestInstance {
  assert.ok(renderer);
  return renderer.root.findByProps({ testID });
}
