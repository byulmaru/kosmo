import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostRequestCard_request$key } from './__generated__/PostRequestCard_request.graphql';
import type { PostRequestCard as PostRequestCardComponent } from './PostRequestCard';
import type * as PostRequestPreviewContextModule from './PostRequestPreviewContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const POLL_INTERVAL_MS = 5_000;

type RefetchOptions = {
  fetchPolicy?: string;
  onComplete?: (error: Error | null) => void;
};

type CancelResponse = {
  cancelPostRequest: { request: { status: string } | null } | null;
} | null;

type MutationConfig = {
  onCompleted?: (response: CancelResponse) => void;
  onError?: (error: Error) => void;
  variables: { input: { requestId: string } };
};

type PreviewStore = PostRequestPreviewContextModule.PostRequestPreviewStore;

type RequestData = {
  authorProfile: {
    avatar: { id: string; url: string | null } | null;
    displayName: string;
    handle: string;
    id: string;
    relativeHandle: string;
  } | null;
  bodyText: string;
  contentWarning: string | null;
  media: Array<{
    altText: string | null;
    id: string;
    url: string | null;
  } | null>;
  id: string;
  post: { id: string; profile: { id: string; relativeHandle: string } } | null;
  requestId: string;
  sensitiveMedia: boolean;
  status: string;
};

let renderer: ReactTestRenderer | null = null;
let PostRequestCard: typeof PostRequestCardComponent;
let PostRequestPreviewProvider: typeof PostRequestPreviewContextModule.PostRequestPreviewProvider;
let usePostRequestPreviewStore: typeof PostRequestPreviewContextModule.usePostRequestPreviewStore;
let previewStore: PreviewStore | null = null;
let focused = false;
let cancelCommit: (config: MutationConfig) => void = () => undefined;
let refetchCount = 0;
let lastRefetch: { variables: Record<string, never>; options: RefetchOptions } | null = null;
let appStateListener: ((state: string) => void) | undefined;
type CardProps = Omit<Parameters<typeof PostRequestCardComponent>[0], 'request'>;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  Link: ({ children, href }: { children?: unknown; href: string }) =>
    createElement('Link', { href }, children as never),
  useIsFocused: () => focused,
});
mockModule('react-native', {
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      appStateListener = listener;
      return { remove: () => (appStateListener = undefined) };
    },
    currentState: 'active',
  },
  Image: 'Image',
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('react-relay', {
  graphql: () => ({}),
  useMutation: () => [cancelCommit, false],
  useRefetchableFragment: (_fragment: unknown, fragmentKey: unknown) => [
    fragmentKey,
    (variables: Record<string, never>, options: RefetchOptions) => {
      refetchCount++;
      lastRefetch = { variables, options };
      return { dispose: () => undefined };
    },
  ],
});
mockModule('@/components/media/imageUpload', { releaseImagePreview: () => undefined });
mockModule('@/relay/RelayActorProvider', { useRelayAuthLifecycleKey: () => 'auth-a' });
mockModule(new URL('../../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => ({ accountId: 'account-a', sessionId: 'session-a' }),
});
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule('@/components/ui/Button', {
  Button: ({ children, ...props }: Record<string, unknown>) =>
    createElement('Button', props, children as never),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    actionPrimaryBase: '#1455cc',
    backgroundCanvas: '#fff',
    backgroundSurface: '#eee',
    borderSubtle: '#ddd',
    feedbackDangerOnSubtle: '#900',
    foregroundPrimary: '#111',
    foregroundSecondary: '#555',
  }),
});
mockModule('@/theme/tokens', {
  borderWidths: { 1: 1 },
  radius: { 8: 8 },
  space: { 8: 8, 12: 12, 16: 16 },
  textStyles: { contentM: {}, uiCopyM: {}, uiCopyS: {}, uiLabelM: {} },
});

before(async () => {
  ({ PostRequestPreviewProvider, usePostRequestPreviewStore } =
    await import('./PostRequestPreviewContext'));
  ({ PostRequestCard } = await import('./PostRequestCard'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mock.timers.reset();
  previewStore = null;
  focused = false;
  cancelCommit = () => undefined;
  refetchCount = 0;
  lastRefetch = null;
  appStateListener = undefined;
  mock.restoreAll();
});

function makeRequest(status: string, overrides: Partial<RequestData> = {}) {
  const data: RequestData = {
    authorProfile: {
      avatar: null,
      displayName: '작성자',
      handle: '@writer',
      id: 'profile-writer',
      relativeHandle: '@writer',
    },
    bodyText: '요청 본문 미리보기',
    contentWarning: null,
    media: [],
    id: 'request-node-id',
    post: null,
    requestId: 'request-id',
    sensitiveMedia: false,
    status,
    ...overrides,
  };

  return {
    ...data,
    ' $fragmentSpreads': { PostRequestCard_request: true } as const,
  } as unknown as PostRequestCard_request$key;
}

function PreviewStoreCapture() {
  previewStore = usePostRequestPreviewStore();
  return null;
}

function cardTree(request: PostRequestCard_request$key, props: CardProps = {}) {
  return createElement(
    PostRequestPreviewProvider,
    null,
    createElement(PreviewStoreCapture),
    createElement(PostRequestCard, { request, ...props }),
  );
}

async function setPreview(requestId: string, mediaId: string, uri: string) {
  await act(async () => {
    if (!previewStore) {
      throw new Error('Post request preview store is not mounted.');
    }
    previewStore.set(requestId, { mediaId, uri });
  });
}

async function renderCard(request: PostRequestCard_request$key, props: CardProps = {}) {
  await act(async () => {
    renderer = create(cardTree(request, props));
  });
}

async function updateCard(request: PostRequestCard_request$key, props: CardProps = {}) {
  await act(async () => {
    renderer?.update(cardTree(request, props));
  });
}

function findAllByType(type: string) {
  return renderer?.root.findAll((node) => node.type === type) ?? [];
}

function button(label: string) {
  return findAllByType('Button').find((node) => node.props.children === label);
}

function visibleText() {
  if (!renderer) {
    return undefined;
  }
  return findAllByType('Text')
    .flatMap((node) => node.children)
    .filter((child): child is string => typeof child === 'string')
    .join('');
}

describe('PostRequestCard', () => {
  it('retains a preview until cancellation is confirmed, then clears it', async () => {
    let config: MutationConfig | undefined;
    cancelCommit = (nextConfig) => {
      config = nextConfig;
    };
    const onCompose = mock.fn();
    const props = { onCompose };
    const media = [{ altText: '대기 중인 이미지', id: 'uploading-media', url: null }];
    await renderCard(makeRequest('QUEUED', { media }), props);
    await setPreview('request-node-id', 'uploading-media', 'local-preview://request-image');
    assert.equal(findAllByType('Image')[0]?.props.source.uri, 'local-preview://request-image');

    await act(async () => button('취소')?.props.onPress());
    assert.deepEqual(config?.variables, { input: { requestId: 'request-id' } });
    assert.equal(previewStore?.get('request-node-id')?.uri, 'local-preview://request-image');
    assert.equal(visibleText()?.includes('접수됨'), true);
    assert.equal(button('취소') !== undefined, true);
    assert.equal(button('새 글 작성'), undefined);
    assert.equal(onCompose.mock.callCount(), 0);

    await act(async () => {
      config?.onCompleted?.({ cancelPostRequest: { request: { status: 'CANCELLED' } } });
    });
    assert.equal(previewStore?.get('request-node-id'), undefined);

    await updateCard(makeRequest('CANCELLED', { media }), props);
    assert.equal(button('취소'), undefined);
    assert.equal(button('새 글 작성') !== undefined, true);
    assert.equal(visibleText()?.includes('취소됨'), true);
    await act(async () => button('새 글 작성')?.props.onPress());
    assert.deepEqual(onCompose.mock.calls[0]?.arguments, []);
  });

  it('does not offer cancellation during publishing or confirmation', async () => {
    await renderCard(makeRequest('PUBLISHING'));
    assert.equal(visibleText()?.includes('게시 중'), true);
    assert.equal(button('취소'), undefined);

    await updateCard(makeRequest('CONFIRMING'));
    assert.equal(visibleText()?.includes('게시 결과 확인 중'), true);
    assert.equal(button('취소'), undefined);
  });

  it('starts a fresh composition from failed requests without passing request data', async () => {
    const onCompose = mock.fn();
    await renderCard(makeRequest('FAILED'), { onCompose });

    await act(async () => button('새 글 작성')?.props.onPress());
    assert.deepEqual(onCompose.mock.calls[0]?.arguments, []);
    assert.equal(visibleText()?.includes('게시 실패'), true);
    assert.equal(button('취소'), undefined);

    await updateCard(makeRequest('FAILED'));
    assert.equal(button('새 글 작성'), undefined);
  });

  it('shows the first media thumbnail even when the request has a warning or sensitive media', async () => {
    const media = [
      null,
      { altText: '사용하지 않는 이미지', id: 'missing-url', url: null },
      { altText: '산', id: 'first-image', url: 'https://example.test/first.jpg' },
      { altText: '두 번째 이미지', id: 'second-image', url: 'https://example.test/second.jpg' },
    ];
    await renderCard(
      makeRequest('QUEUED', {
        bodyText: '본문을 함께 보여줘요',
        contentWarning: '민감한 내용',
        media,
        sensitiveMedia: false,
      }),
    );
    assert.equal(visibleText()?.includes('본문을 함께 보여줘요'), true);
    const [imageWithWarning] = findAllByType('Image');
    assert.ok(imageWithWarning);
    assert.equal(imageWithWarning.props.source.uri, 'https://example.test/first.jpg');
    assert.equal(imageWithWarning.props.accessibilityLabel, '산');

    await updateCard(
      makeRequest('QUEUED', {
        bodyText: '민감한 이미지 외 본문',
        contentWarning: null,
        media,
        sensitiveMedia: true,
      }),
    );
    assert.equal(visibleText()?.includes('민감한 이미지 외 본문'), true);
    assert.equal(findAllByType('Image')[0]?.props.source.uri, 'https://example.test/first.jpg');

    await updateCard(
      makeRequest('QUEUED', {
        bodyText: '공개 미리보기',
        contentWarning: null,
        media,
        sensitiveMedia: false,
      }),
    );
    assert.equal(visibleText()?.includes('공개 미리보기'), true);
    const [image] = findAllByType('Image');
    assert.ok(image);
    assert.equal(image.props.source.uri, 'https://example.test/first.jpg');
    assert.equal(image.props.accessibilityLabel, '산');

    await updateCard(
      makeRequest('QUEUED', {
        bodyText: '공개 미리보기',
        contentWarning: null,
        media: media.map((item) =>
          item?.id === 'first-image' ? { ...item, altText: null } : item,
        ),
        sensitiveMedia: false,
      }),
    );
    assert.equal(findAllByType('Image')[0]?.props.accessibilityLabel, '첨부 이미지');
  });

  it('shows a local URI only when both the request and media IDs match', async () => {
    await renderCard(
      makeRequest('PROCESSING', {
        contentWarning: '민감한 내용',
        media: [{ altText: '대기 중인 이미지', id: 'uploading-media', url: null }],
        sensitiveMedia: true,
      }),
    );
    assert.equal(findAllByType('Image').length, 0);

    await setPreview('another-request', 'uploading-media', 'local-preview://wrong-request');
    await setPreview('request-node-id', 'another-media', 'local-preview://wrong-media');
    assert.equal(findAllByType('Image').length, 0);

    await setPreview('request-node-id', 'uploading-media', 'local-preview://matching-media');
    assert.equal(findAllByType('Image')[0]?.props.source.uri, 'local-preview://matching-media');
    assert.equal(findAllByType('Image')[0]?.props.accessibilityLabel, '대기 중인 이미지');
  });

  it('keeps the first preview ahead of a later ready media URL, then uses its final URL', async () => {
    await renderCard(
      makeRequest('PROCESSING', {
        media: [
          { altText: '첫 번째 이미지', id: 'uploading-media', url: null },
          {
            altText: '두 번째 이미지',
            id: 'ready-media',
            url: 'https://example.test/second.jpg',
          },
        ],
      }),
    );
    assert.equal(findAllByType('Image')[0]?.props.source.uri, 'https://example.test/second.jpg');
    await setPreview('request-node-id', 'uploading-media', 'local-preview://request-image');
    assert.equal(findAllByType('Image')[0]?.props.source.uri, 'local-preview://request-image');

    await updateCard(
      makeRequest('PROCESSING', {
        media: [
          {
            altText: '첫 번째 이미지',
            id: 'uploading-media',
            url: 'https://example.test/first.jpg',
          },
          {
            altText: '두 번째 이미지',
            id: 'ready-media',
            url: 'https://example.test/second.jpg',
          },
        ],
      }),
    );

    assert.equal(findAllByType('Image')[0]?.props.source.uri, 'https://example.test/first.jpg');
    assert.equal(previewStore?.get('request-node-id'), undefined);
  });

  for (const [label, post, expected] of [
    [
      'with a Post projection',
      { id: 'post-id', profile: { id: 'profile-writer', relativeHandle: '@writer' } },
      {
        requestNodeId: 'request-node-id',
        postId: 'post-id',
        authorProfileId: 'profile-writer',
      },
    ],
    [
      'without a Post projection',
      null,
      {
        requestNodeId: 'request-node-id',
        postId: null,
        authorProfileId: null,
      },
    ],
  ] as const) {
    it(`emits completion only after an active-to-published transition ${label}`, async () => {
      const media = [{ altText: '게시할 이미지', id: 'published-media', url: null }];
      const onPublished = mock.fn(() => {
        assert.equal(previewStore?.get('request-node-id'), undefined);
      });
      const published = makeRequest('PUBLISHED', { media, post });
      await renderCard(published, { onPublished });
      assert.equal(onPublished.mock.callCount(), 0);

      await updateCard(makeRequest('QUEUED', { media }), { onPublished });
      await setPreview('request-node-id', 'published-media', 'local-preview://published-image');
      assert.equal(findAllByType('Image')[0]?.props.source.uri, 'local-preview://published-image');
      await updateCard(published, { onPublished });

      if (post) {
        assert.equal(findAllByType('Link')[0]?.props.href, '/@writer/post-id');
      } else {
        assert.equal(findAllByType('Link').length, 0);
      }
      assert.equal(previewStore?.get('request-node-id'), undefined);
      assert.deepEqual(onPublished.mock.calls[0]?.arguments, [expected]);
    });
  }

  it('keeps the last known status visible after a cancel error and offers a manual status check', async () => {
    cancelCommit = (config) => config.onError?.(new Error('network error'));
    await renderCard(
      makeRequest('QUEUED', {
        media: [{ altText: '대기 중인 이미지', id: 'uploading-media', url: null }],
      }),
    );
    await setPreview('request-node-id', 'uploading-media', 'local-preview://request-image');

    await act(async () => button('취소')?.props.onPress());
    assert.equal(previewStore?.get('request-node-id')?.uri, 'local-preview://request-image');
    assert.deepEqual(lastRefetch?.variables, {});
    assert.equal(lastRefetch?.options.fetchPolicy, 'store-and-network');
    await act(async () => lastRefetch?.options.onComplete?.(new Error('query error')));

    assert.equal(visibleText()?.includes('접수됨'), true);
    assert.equal(visibleText()?.includes('최신 상태를 확인하지 못했어요.'), true);
    assert.equal(visibleText()?.includes('게시 실패'), false);
    assert.equal(button('다시 확인') !== undefined, true);

    await act(async () => button('다시 확인')?.props.onPress());
    assert.equal(refetchCount, 2);
    await act(async () => lastRefetch?.options.onComplete?.(null));
    assert.equal(visibleText()?.includes('최신 상태를 확인하지 못했어요.'), false);
  });

  it('polls active requests only while the route is focused and the app is foregrounded', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    focused = false;
    await renderCard(makeRequest('PROCESSING'));
    await act(async () => mock.timers.tick(POLL_INTERVAL_MS * 2));
    assert.equal(refetchCount, 0);

    focused = true;
    await updateCard(makeRequest('PROCESSING'));
    await act(async () => mock.timers.tick(POLL_INTERVAL_MS));
    assert.equal(refetchCount, 1);

    await act(async () => lastRefetch?.options.onComplete?.(null));
    await act(async () => mock.timers.tick(POLL_INTERVAL_MS));
    assert.equal(refetchCount, 2);

    await act(async () => appStateListener?.('background'));
    await act(async () => mock.timers.tick(POLL_INTERVAL_MS * 2));
    assert.equal(refetchCount, 2);

    await updateCard(
      makeRequest('PUBLISHED', {
        post: { id: 'post-id', profile: { id: 'profile-writer', relativeHandle: '@writer' } },
      }),
    );
    await act(async () => mock.timers.tick(POLL_INTERVAL_MS * 2));
    assert.equal(refetchCount, 2);
  });
});
