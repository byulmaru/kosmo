import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { projectRemoteNoteContent } from '@kosmo/core/activitypub-note-content/server';
import { isPostContentDocumentV1 } from '@kosmo/core/post-content';
import {
  canonicalizePostContentDocument,
  postContentDocumentToText,
} from '@kosmo/core/post-content/server';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { PostBody_post$data, PostBody_post$key } from './__generated__/PostBody_post.graphql';
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
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: (_fragment: unknown, key: unknown) => key,
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
  useReducedMotion: () => true,
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
  numberOfLines?: number;
  onMediaOpen?: PostMediaOpenHandler;
  postId: string;
};

type PostBodyFixture = PostBody_post$key & {
  readonly content: NonNullable<PostBody_post$data['content']>;
  readonly id: PostBody_post$data['id'];
};

let PostContentRenderer: ComponentType<RendererProps>;
let PostBody: ComponentType<{ post: PostBody_post$key }>;
let PostContentWarningRevealProvider: ComponentType<{ children?: ReactNode }>;
let Button: ComponentType<Record<string, unknown>>;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ PostContentRenderer } = await import('./PostContentRenderer'));
  ({ PostBody } = await import('./PostBody'));
  ({ PostContentWarningRevealProvider } = await import('./PostContentWarningRevealContext'));
  ({ Button } = await import('@/components/ui/Button'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mock.restoreAll();
});

describe('PostContentRenderer', () => {
  it('content warning reveal uses Button and forwards expanded state', async () => {
    await render({
      bodyText: '원문 본문',
      contentWarning: '민감한 내용',
      document: null,
      media: [],
      postId: 'post-warning-button',
    });

    assert.deepEqual(
      renderer?.root.findAllByType(Button).map(({ props }) => ({
        accessibilityLabel: props.accessibilityLabel,
        accessibilityState: props.accessibilityState,
        ariaExpanded: props['aria-expanded'],
      })),
      [
        {
          accessibilityLabel: '내용 보기',
          accessibilityState: { expanded: false },
          ariaExpanded: false,
        },
      ],
    );
  });

  it('Gallery에는 viewer open callback만 전달한다', async () => {
    const onMediaOpen = () => undefined;
    await render({
      bodyText: '',
      contentWarning: null,
      document: null,
      media: [{ altText: null, id: 'media-1', url: 'https://media.example/1.webp' }],
      onMediaOpen,
      postId: 'post-viewer-callbacks',
    });

    const gallery = rendered('PostMediaGallery')[0];
    assert.ok(gallery);
    assert.equal(gallery.props.onMediaOpen, onMediaOpen);
    assert.equal('onMediaUnavailable' in gallery.props, false);
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

  it('지원하지 않는 inline node가 있는 문서는 bodyText fallback으로 본문과 Media를 보존한다', async () => {
    const bodyText = '앞쪽 @mentioned 뒤쪽';
    const media = [
      { altText: '이미지 설명', id: 'media-mention', url: 'https://media.example/1.webp' },
    ];
    const document = {
      body: {
        attrs: { sensitiveMedia: true },
        content: [
          {
            content: [
              { text: '앞쪽 ', type: 'text' },
              {
                attrs: {
                  href: 'https://remote.example/users/mentioned',
                  label: '@mentioned',
                  target: 'https://remote.example/users/mentioned',
                },
                type: 'mention',
              },
              { text: ' 뒤쪽', type: 'text' },
            ],
            type: 'paragraph',
          },
          { attrs: { mediaId: 'media-mention' }, type: 'media' },
        ],
        type: 'doc',
      },
      summary: '통합 검증 경고',
      version: 1,
    };
    assert.equal(isPostContentDocumentV1(document), true);
    await render({
      bodyText,
      contentWarning: '통합 검증 경고',
      document,
      media,
      postId: 'post-mention-fallback',
    });

    assert.equal(rendered('PostMediaGallery').length, 0);
    const toggle = rendered('Pressable').find(
      (node) => node.props.testID === 'post-content-warning-toggle',
    );
    assert.ok(toggle);

    await act(async () =>
      toggle.props.onPress({
        stopPropagation: () => undefined,
      }),
    );

    assert.equal(
      rendered('Text').some((node) => node.props.children === bodyText),
      true,
    );
    const gallery = rendered('PostMediaGallery');
    assert.equal(gallery.length, 1);
    assert.deepEqual(gallery[0].props.media, media);
    assert.equal(gallery[0].props.sensitive, true);
  });

  it('GraphQL PostBody fragment payload를 legacy renderer에 연결해 bodyText·Media·Content Warning을 보존한다', async () => {
    const post = createMentionGraphqlPayload();
    assert.equal(isPostContentDocumentV1(post.content.document), true);
    assert.equal(post.content.bodyText, '앞쪽 @mentioned 뒤쪽');

    await renderPostBody(post);

    assert.equal(rendered('PostMediaGallery').length, 0);
    const toggle = rendered('Pressable').find(
      (node) => node.props.testID === 'post-content-warning-toggle',
    );
    assert.ok(toggle);

    await act(async () =>
      toggle.props.onPress({
        stopPropagation: () => undefined,
      }),
    );

    assert.equal(
      rendered('Text').some((node) => node.props.children === post.content.bodyText),
      true,
    );
    const gallery = rendered('PostMediaGallery');
    assert.equal(gallery.length, 1);
    assert.deepEqual(gallery[0].props.media, post.content.media);
    assert.equal(gallery[0].props.sensitive, true);
  });

  it('요청한 원문 줄 수를 plain text와 document root에 적용한다', async () => {
    await render({
      bodyText: '세 줄까지만 표시할 원문',
      contentWarning: null,
      document: null,
      media: [],
      numberOfLines: 3,
      postId: 'post-line-limit',
    });

    assert.equal(
      rendered('Text').find((node) => node.props.children === '세 줄까지만 표시할 원문')?.props
        .numberOfLines,
      3,
    );

    await render({
      bodyText: '문서 원문',
      contentWarning: null,
      document: {
        body: {
          attrs: { sensitiveMedia: false },
          content: [{ content: [{ text: '문서 원문', type: 'text' }], type: 'paragraph' }],
          type: 'doc',
        },
        version: 1,
      },
      media: [],
      numberOfLines: 3,
      postId: 'post-document-line-limit',
    });

    assert.equal(
      rendered('Text').find((node) => node.props.numberOfLines === 3)?.props.numberOfLines,
      3,
    );
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

async function renderPostBody(post: PostBody_post$key) {
  await act(async () => {
    renderer = create(
      createElement(PostContentWarningRevealProvider, null, createElement(PostBody, { post })),
    );
  });
  assert.ok(renderer);
}

function createMentionGraphqlPayload(): PostBodyFixture {
  const projectedDocument = projectRemoteNoteContent({
    content: '<p>앞쪽 <a href="https://remote.example/users/mentioned">@mentioned</a> 뒤쪽</p>',
    mentions: [
      {
        label: '@mentioned',
        targetHref: 'https://remote.example/users/mentioned',
      },
    ],
    mediaType: 'text/html',
    summary: '통합 검증 경고',
  });
  const document = canonicalizePostContentDocument({
    ...projectedDocument,
    body: {
      ...projectedDocument.body,
      attrs: { sensitiveMedia: true },
      content: [
        ...projectedDocument.body.content,
        { attrs: { mediaId: 'media-mention' }, type: 'media' },
      ],
    },
  });

  return {
    ' $fragmentSpreads': { PostBody_post: true },
    content: {
      bodyText: postContentDocumentToText(document),
      contentWarning: document.summary,
      document,
      id: 'content-mention',
      media: [
        {
          altText: '이미지 설명',
          id: 'media-mention',
          url: 'https://media.example/1.webp',
        },
      ],
    },
    id: 'post-mention-fragment',
  };
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function byTestId(testID: string): ReactTestInstance {
  assert.ok(renderer);
  return renderer.root.findByProps({ testID });
}
