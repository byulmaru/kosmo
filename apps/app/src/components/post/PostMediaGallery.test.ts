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

function byTestId(testID: string): ReactTestInstance {
  assert.ok(renderer);
  return renderer.root.findByProps({ testID });
}
