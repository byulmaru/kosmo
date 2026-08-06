import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { PostMediaItem } from './PostMediaGallery';
import type { PostMediaOpenHandler } from './PostMediaImage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Linking: { openURL: async () => undefined },
  Platform: { OS: 'android' },
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule(new URL('../../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => ({ selectedProfileId: null, sessionId: null }),
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({
    border: '#ddd',
    primary: '#ff0',
    primaryHover: '#ee0',
    surface: '#fafafa',
    text: '#111',
    textSecondary: '#777',
  }),
});
mockModule(new URL('./PostMediaGallery.tsx', import.meta.url), {
  PostMediaGallery: (props: Record<string, unknown>) => createElement('PostMediaGallery', props),
});

type RendererProps = {
  bodyText: string;
  contentWarningPresentation?: 'default' | 'revealed';
  contentWarning: string | null | undefined;
  document: unknown;
  media: ReadonlyArray<PostMediaItem> | null;
  mediaPresentation?: 'default' | 'hidden';
  onMediaOpen?: PostMediaOpenHandler;
  onMediaUnavailable?: () => void;
  postId: string;
};

let PostContentRenderer: ComponentType<RendererProps>;
let PostContentWarningRevealProvider: ComponentType<{ children?: ReactNode }>;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ PostContentRenderer } = await import('./PostContentRenderer'));
  ({ PostContentWarningRevealProvider } = await import('./PostContentWarningRevealContext'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mock.restoreAll();
});

describe('PostContentRenderer', () => {
  it('Gallery에 viewer open과 unavailable lifecycle callback을 그대로 전달한다', async () => {
    const onMediaOpen = () => undefined;
    const onMediaUnavailable = () => undefined;
    await render({
      bodyText: '',
      contentWarning: null,
      document: null,
      media: [{ altText: null, id: 'media-1', url: 'https://media.example/1.webp' }],
      onMediaOpen,
      onMediaUnavailable,
      postId: 'post-viewer-callbacks',
    });

    const gallery = rendered('PostMediaGallery')[0];
    assert.ok(gallery);
    assert.equal(gallery.props.onMediaOpen, onMediaOpen);
    assert.equal(gallery.props.onMediaUnavailable, onMediaUnavailable);
  });

  it('Media를 숨기는 상세 표현에서는 unavailable Gallery도 렌더하지 않는다', async () => {
    await render({
      bodyText: '',
      contentWarning: null,
      document: null,
      media: null,
      mediaPresentation: 'hidden',
      postId: 'post-viewer-hidden',
    });

    assert.equal(rendered('PostMediaGallery').length, 0);
  });

  it('does not mount media while a Content Warning is hidden, then passes media after reveal', async () => {
    const media: PostMediaItem[] = [
      { altText: '설명', id: 'media-1', url: 'https://media.example/1.webp' },
    ];
    await render({
      bodyText: '원문 본문',
      contentWarning: '민감한 내용',
      document: null,
      media,
      postId: 'post-1',
    });

    const contentRoot = byTestId('post-content-renderer');
    assert.deepEqual(contentRoot.props.dataSet, { openpanelReplayBlock: '' });
    assert.equal(rendered('PostMediaGallery').length, 0);
    const toggle = rendered('Pressable').find(
      (node) => node.props.testID === 'post-content-warning-toggle',
    );
    assert.ok(toggle);
    assert.equal(
      rendered('Text').some((node) => node.props.children === '원문 본문'),
      false,
    );

    await act(async () =>
      toggle.props.onPress({
        stopPropagation: () => undefined,
      }),
    );

    const galleries = rendered('PostMediaGallery');
    assert.equal(galleries.length, 1);
    assert.deepEqual(galleries[0].props.media, media);
    assert.equal(
      contentRoot.findAll((node) => (node.type as unknown) === 'PostMediaGallery').length,
      1,
    );
    assert.equal(
      rendered('Text').some((node) => node.props.children === '원문 본문'),
      true,
    );
  });

  it('Viewer 공개 표현은 warning control 없이 원문을 표시하고 Media는 숨긴다', async () => {
    await render({
      bodyText: '원문 본문',
      contentWarning: '민감한 내용',
      contentWarningPresentation: 'revealed',
      document: null,
      media: [],
      mediaPresentation: 'hidden',
      postId: 'post-viewer-warning',
    });

    assert.equal(
      rendered('Pressable').some((node) => node.props.testID === 'post-content-warning-toggle'),
      false,
    );
    assert.equal(
      rendered('Text').some((node) => node.props.children === '원문 본문'),
      true,
    );
    assert.equal(rendered('PostMediaGallery').length, 0);
  });

  it('keeps the canonical content root around warning and revealed body content', async () => {
    await render({
      bodyText: '원문 본문',
      contentWarning: '민감한 내용',
      document: null,
      media: [],
      postId: 'post-2',
    });

    const contentRoot = byTestId('post-content-renderer');
    assert.deepEqual(contentRoot.props.dataSet, { openpanelReplayBlock: '' });
    assert.equal(
      contentRoot.findAll((node) => node.props.testID === 'post-content-warning').length,
      1,
    );

    const toggle = rendered('Pressable').find(
      (node) => node.props.testID === 'post-content-warning-toggle',
    );
    assert.ok(toggle);
    await act(async () =>
      toggle.props.onPress({
        stopPropagation: () => undefined,
      }),
    );

    const body = rendered('Text').find((node) => node.props.children === '원문 본문');
    assert.ok(body);
    const galleries = rendered('PostMediaGallery');
    assert.equal(galleries.length, 1);
    assert.equal(
      contentRoot.findAll((node) => (node.type as unknown) === 'PostMediaGallery').length,
      1,
    );
  });
});

async function render(props: RendererProps) {
  await act(async () => {
    if (renderer) {
      renderer.update(
        createElement(
          PostContentWarningRevealProvider,
          null,
          createElement(PostContentRenderer, props),
        ),
      );
    } else {
      renderer = create(
        createElement(
          PostContentWarningRevealProvider,
          null,
          createElement(PostContentRenderer, props),
        ),
      );
    }
  });
  assert.ok(renderer);
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function byTestId(testID: string): ReactTestInstance {
  assert.ok(renderer);
  return renderer.root.findByProps({ testID });
}
