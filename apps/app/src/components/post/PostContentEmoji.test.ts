import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MockImage = Object.assign((props: Record<string, unknown>) => createElement('Image', props), {
  getSize: (_url: string, success: (width: number, height: number) => void) => success(40, 20),
});

mock.module('react-native', {
  exports: {
    Image: MockImage,
    StyleSheet: {
      create: (styles: object) => styles,
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

let PostContentEmoji: ComponentType<{
  accessible?: boolean;
  fontSize: number;
  shortcode: string;
  url: string;
}>;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ PostContentEmoji } = await import('./PostContentEmoji'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mock.restoreAll();
});

describe('PostContentEmoji', () => {
  it('로딩 중 shortcode를 보이고 브라우저 크기 이벤트 뒤 같은 image를 accessible하게 표시한다', async () => {
    const shortcode = ':blobcat:';
    await render({ shortcode, url: 'https://emoji.example/blobcat.png' });

    const image = rendered('Image')[0];
    assert.ok(image);
    assert.equal(image.props.accessible, false);
    assert.equal(textContent(), shortcode);

    await act(async () =>
      image.props.onLoad({
        nativeEvent: { target: { naturalHeight: 20, naturalWidth: 40 } },
      }),
    );

    const loadedImage = rendered('Image')[0];
    assert.equal(loadedImage, image);
    assert.equal(loadedImage?.props.accessible, true);
    assert.equal(loadedImage?.props.accessibilityLabel, shortcode);
    assert.equal(loadedImage?.props.accessibilityRole, 'image');
    assert.equal(loadedImage?.props.style.height, 16);
    assert.equal(loadedImage?.props.style.width, 32);
    assert.equal(textContent(), '');
  });

  it('loaded image의 오류 뒤 같은 위치에 shortcode를 복원한다', async () => {
    const shortcode = ':broken:';
    await render({ shortcode, url: 'https://emoji.example/broken.png' });
    const image = rendered('Image')[0];
    assert.ok(image);

    await act(async () =>
      image.props.onLoad({ nativeEvent: { source: { height: 20, width: 40 } } }),
    );
    await act(async () => image.props.onError());

    assert.equal(rendered('Image').length, 0);
    assert.equal(textContent(), shortcode);
  });

  it('로드 오류는 image 없이 shortcode를 유지한다', async () => {
    const shortcode = ':missing:';
    await render({ shortcode, url: 'https://emoji.example/missing.png' });
    const image = rendered('Image')[0];
    assert.ok(image);

    await act(async () => image.props.onError());

    assert.equal(rendered('Image').length, 0);
    assert.equal(textContent(), shortcode);
  });

  it('source가 없는 native web 이벤트도 Image.getSize로 원본 비율을 적용한다', async () => {
    await render({ shortcode: ':fallback:', url: 'https://emoji.example/fallback.png' });
    const image = rendered('Image')[0];
    assert.ok(image);

    await act(async () => image.props.onLoad({ nativeEvent: {} }));
    assert.equal(image.props.style.height, 16);
    assert.equal(image.props.style.width, 32);
  });

  it('URL 변경 시 이전 image 상태를 새 shortcode에 재사용하지 않는다', async () => {
    await render({ shortcode: ':first:', url: 'https://emoji.example/first.png' });
    const firstImage = rendered('Image')[0];
    assert.ok(firstImage);
    await act(async () =>
      firstImage.props.onLoad({ nativeEvent: { source: { height: 20, width: 20 } } }),
    );
    assert.equal(rendered('Image')[0]?.props.accessible, true);

    await render({ shortcode: ':second:', url: 'https://emoji.example/second.png' });
    const secondImage = rendered('Image')[0];
    assert.ok(secondImage);
    assert.notEqual(secondImage, firstImage);
    assert.deepEqual(secondImage.props.source, { uri: 'https://emoji.example/second.png' });
    assert.equal(secondImage.props.accessible, false);
    assert.equal(textContent(), ':second:');
  });
});

function rendered(type: string): Array<ReactTestInstance> {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function textContent(value: unknown = renderer?.toJSON()): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(textContent).join('');
  }
  if (value && typeof value === 'object' && 'children' in value) {
    return textContent((value as { children?: unknown }).children);
  }
  return '';
}

async function render(props: {
  accessible?: boolean;
  fontSize?: number;
  shortcode: string;
  url: string;
}) {
  const element = createElement(PostContentEmoji, {
    accessible: props.accessible,
    fontSize: props.fontSize ?? 16,
    shortcode: props.shortcode,
    url: props.url,
  });
  await act(async () => {
    if (renderer) {
      renderer.update(element);
    } else {
      renderer = create(element);
    }
  });
}
