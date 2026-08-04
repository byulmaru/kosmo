import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostContentRenderer as PostContentRendererComponent } from './PostContentRenderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

mock.module('@kosmo/core/post-content', {
  exports: { isPostContentDocumentV1: () => true },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('react-native', {
  exports: {
    Linking: { openURL: () => Promise.resolve() },
    Pressable: 'Pressable',
    StyleSheet: { create: <T>(styles: T) => styles },
    Text: 'Text',
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('ts-pattern', {
  exports: {
    match: () => ({
      otherwise: (fallback: () => unknown) => fallback(),
      when() {
        return this;
      },
      with() {
        return this;
      },
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostMediaGallery', {
  exports: {
    PostMediaGallery: (props: Record<string, unknown>) =>
      createElement('PostMediaGallery', { ...props, testID: 'post-content-renderer-gallery' }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/theme/ThemeProvider', {
  exports: { useTheme: () => ({ text: '#111111' }) },
} as unknown as Parameters<typeof mock.module>[1]);

let PostContentRenderer: typeof PostContentRendererComponent;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ PostContentRenderer } = await import('./PostContentRenderer'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('PostContentRenderer', () => {
  it('Gallery에 viewer open과 unavailable lifecycle callback을 그대로 전달한다', async () => {
    const onMediaOpen = () => undefined;
    const onMediaUnavailable = () => undefined;
    await act(async () => {
      renderer = create(
        createElement(PostContentRenderer, {
          bodyText: '',
          document: { body: { attrs: { sensitiveMedia: false }, content: [], type: 'doc' } },
          media: [{ altText: null, id: 'media-1', url: 'https://media.example/1.webp' }],
          onMediaOpen,
          onMediaUnavailable,
        }),
      );
    });
    assert.ok(renderer);
    const gallery = renderer.root.findByProps({ testID: 'post-content-renderer-gallery' });
    assert.equal(gallery.props.onMediaOpen, onMediaOpen);
    assert.equal(gallery.props.onMediaUnavailable, onMediaUnavailable);
  });
});
