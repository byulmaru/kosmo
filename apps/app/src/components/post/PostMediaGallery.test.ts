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
    Pressable: 'Pressable',
    StyleSheet: { create: <T>(styles: T) => styles },
    Text: 'Text',
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostMediaImage', {
  exports: {
    PostMediaImage: (props: Record<string, unknown>) => createElement('PostMediaImage', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);

let PostMediaGallery: ComponentType<{
  interactive?: boolean;
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
  it('개수별 surface와 tile geometry를 document 순서대로 구성한다', async () => {
    for (const count of [1, 2, 3, 4]) {
      await render({
        media: Array.from({ length: count }, (_, index) => media(index + 1, null)),
        sensitive: false,
      });

      const gallery = byTestId('post-media-gallery');
      const galleryStyle = flattenStyle(gallery.props.style);
      const tileRows = rendered('View').filter(
        (node) =>
          typeof node.props.testID === 'string' &&
          node.props.testID.startsWith(`post-media-row-${count}-`),
      );
      const tiles = rendered('PostMediaImage');
      const tileWrappers = rendered('View').filter((node) =>
        node.props.testID?.startsWith(`post-media-tile-${count}-`),
      );

      assert.equal(tiles.length, count);
      assert.deepEqual(
        tiles.map(({ props }) => props.item.id),
        Array.from({ length: count }, (_, index) => `media-${index + 1}`),
      );
      assert.equal(
        tiles.every(({ props }) => Boolean(props.fill) === count > 1),
        true,
      );

      if (count === 1) {
        assert.equal(galleryStyle.aspectRatio, undefined);
        assert.equal(tileRows.length, 0);
        assert.equal(tileWrappers.length, 0);
      } else {
        assert.equal(galleryStyle.borderWidth, 1);
        assert.equal(galleryStyle.gap, 8);
        assert.equal(galleryStyle.aspectRatio, count === 2 ? undefined : count === 3 ? 4 / 3 : 1);
        assert.equal(tileRows.length, count === 2 ? 1 : count === 3 ? 2 : 2);
        assert.equal(tileWrappers.length, count);
        assert.equal(
          tileWrappers.every((node) => flattenStyle(node.props.style).flex === 1),
          true,
        );
        assert.equal(
          tileWrappers.every(
            (node) => flattenStyle(node.props.style).aspectRatio === (count === 2 ? 1 : undefined),
          ),
          true,
        );
      }
    }
  });

  it('다중 tile은 3장 1+2, 4장 2x2 구조의 row 순서를 유지한다', async () => {
    await render({ media: [media(1, null), media(2, null), media(3, null)], sensitive: false });
    const threeRows = rendered('View').filter((node) =>
      node.props.testID?.startsWith('post-media-row-3-'),
    );
    assert.equal(threeRows.length, 2);
    assert.deepEqual(mediaIds(threeRows[0]!.children[0]), ['media-1']);
    assert.deepEqual(mediaIds(threeRows[0]!.children[1]), ['media-2', 'media-3']);
    assert.equal(
      flattenStyle((threeRows[0]!.children[0] as ReactTestInstance).props.style).flex,
      1,
    );
    assert.equal(
      flattenStyle((threeRows[0]!.children[1] as ReactTestInstance).props.style).flex,
      1,
    );

    await render({
      media: [media(1, null), media(2, null), media(3, null), media(4, null)],
      sensitive: false,
    });
    const fourRows = rendered('View').filter((node) =>
      node.props.testID?.startsWith('post-media-row-4-'),
    );
    assert.equal(fourRows.length, 2);
    assert.deepEqual(mediaIds(fourRows[0]!.children[0]), ['media-1']);
    assert.deepEqual(mediaIds(fourRows[0]!.children[1]), ['media-2']);
    assert.deepEqual(mediaIds(fourRows[1]!.children[0]), ['media-3']);
    assert.deepEqual(mediaIds(fourRows[1]!.children[1]), ['media-4']);
  });

  it('Sensitive 다중 surface는 공개 전후 동일 geometry를 예약하고 비대화형이면 control을 숨긴다', async () => {
    for (const count of [2, 3, 4]) {
      if (renderer) {
        await act(async () => renderer?.unmount());
        renderer = null;
      }
      const mediaItems = Array.from({ length: count }, (_, index) => media(index + 1, null));
      await render({ media: mediaItems, sensitive: true });
      const hiddenStyle = flattenStyle(byTestId('post-media-sensitive').props.style);
      const hiddenGeometry = hiddenStyle.aspectRatio;
      const hiddenTiles = rendered('View').filter((node) =>
        node.props.testID?.startsWith('post-media-sensitive-tile-'),
      );

      assert.equal(rendered('PostMediaImage').length, 0);
      assert.equal(hiddenTiles.length, count);
      assert.equal(
        hiddenTiles.every(
          (node) => flattenStyle(node.props.style).aspectRatio === (count === 2 ? 1 : undefined),
        ),
        true,
      );
      assert.ok(pressable('민감한 이미지 표시'));
      await act(async () => pressable('민감한 이미지 표시').props.onPress());
      assert.equal(
        flattenStyle(byTestId('post-media-gallery').props.style).aspectRatio,
        hiddenGeometry,
      );

      await render({ interactive: false, media: mediaItems, sensitive: true });
      assert.equal(rendered('Pressable').length, 0);
      assert.equal(rendered('PostMediaImage').length, 0);
    }
  });

  it('document 순서대로 이미지를 최대 네 개 표시한다', async () => {
    await render({
      media: Array.from({ length: 5 }, (_, index) =>
        media(index + 1, index === 1 ? null : `설명 ${index + 1}`),
      ),
      sensitive: false,
    });

    assert.deepEqual(
      rendered('PostMediaImage').map(({ props }) => props.item.id),
      ['media-1', 'media-2', 'media-3', 'media-4'],
    );
  });

  it('Sensitive Media를 image mount 없이 시작하고 전체 표시와 다시 가리기를 제공한다', async () => {
    await render({ media: [media(1, null), media(2, '두 번째 이미지')], sensitive: true });

    assert.equal(rendered('PostMediaImage').length, 0);
    const reveal = pressable('민감한 이미지 표시');
    assert.deepEqual(reveal.props.accessibilityState, { expanded: false });

    await act(async () => reveal.props.onPress());
    assert.equal(rendered('PostMediaImage').length, 2);
    const hide = pressable('민감한 이미지 다시 가리기');
    assert.equal(hide, reveal);
    assert.deepEqual(hide.props.accessibilityState, { expanded: true });

    await act(async () => hide.props.onPress());
    assert.equal(rendered('PostMediaImage').length, 0);
    assert.equal(pressable('민감한 이미지 표시'), reveal);
  });

  it('표시 정보 unavailable을 Post 전체 오류 없이 표시한다', async () => {
    await render({ media: null, sensitive: false });
    assert.equal(byTestId('post-media-unavailable').props.accessibilityRole, 'alert');
  });

  it('비대화형 Sensitive Media에서는 image와 공개 control을 mount하지 않는다', async () => {
    await render({ interactive: false, media: [media(1, null)], sensitive: true });

    assert.equal(rendered('PostMediaImage').length, 0);
    assert.equal(rendered('Pressable').length, 0);
  });
});

function media(index: number, altText: string | null): PostMediaItem {
  return { altText, id: `media-${index}`, url: `https://media.example/${index}.webp` };
}

async function render(props: {
  interactive?: boolean;
  media: ReadonlyArray<PostMediaItem> | null;
  sensitive: boolean;
}) {
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

function byTestId(testID: string): ReactTestInstance {
  assert.ok(renderer);
  return renderer.root.findByProps({ testID });
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

function mediaIds(value: unknown): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }
  const node = value as ReactTestInstance;
  if (node.props?.item?.id) {
    return [node.props.item.id];
  }
  const children = Array.isArray(node.props?.children)
    ? node.props.children
    : [node.props?.children];
  return children.flatMap(mediaIds);
}
