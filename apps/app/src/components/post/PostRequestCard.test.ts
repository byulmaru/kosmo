import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostRequestCard_request$key } from './__generated__/PostRequestCard_request.graphql';
import type { PostRequestCard as PostRequestCardComponent } from './PostRequestCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const POLL_INTERVAL_MS = 5_000;

type RefetchOptions = {
  fetchPolicy?: string;
  onComplete?: (error: Error | null) => void;
};

type MutationConfig = {
  onCompleted?: (response: unknown) => void;
  onError?: (error: Error) => void;
  variables: { connections: string[]; input: { requestId: string } };
};

type RequestData = {
  authorProfile: {
    avatar: { id: string; url: string | null } | null;
    displayName: string;
    handle: string;
    id: string;
    relativeHandle: string;
  } | null;
  draft: {
    bodyText: string;
    contentWarning: string | null;
    media: Array<{
      altText: string | null;
      media: { id: string; url: string | null } | null;
    }>;
    sensitiveMedia: boolean;
  };
  id: string;
  post: { id: string; profile: { id: string; relativeHandle: string } } | null;
  requestId: string;
  status: string;
};

let renderer: ReactTestRenderer | null = null;
let PostRequestCard: typeof PostRequestCardComponent;
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
  ({ PostRequestCard } = await import('./PostRequestCard'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mock.timers.reset();
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
    draft: {
      bodyText: '요청 본문 미리보기',
      contentWarning: null,
      media: [],
      sensitiveMedia: false,
    },
    id: 'request-node-id',
    post: null,
    requestId: 'request-id',
    status,
    ...overrides,
  };

  return {
    ...data,
    ' $fragmentSpreads': { PostRequestCard_request: true } as const,
  } as unknown as PostRequestCard_request$key;
}

async function renderCard(request: PostRequestCard_request$key, props: CardProps = {}) {
  await act(async () => {
    renderer = create(createElement(PostRequestCard, { request, ...props }));
  });
}

async function updateCard(request: PostRequestCard_request$key, props: CardProps = {}) {
  await act(async () => {
    renderer?.update(createElement(PostRequestCard, { request, ...props }));
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
  it('only offers cancellation while queued or processing, then waits for server status before showing rewrite', async () => {
    let config: MutationConfig | undefined;
    cancelCommit = (nextConfig) => {
      config = nextConfig;
    };
    const props = { onRewrite: () => undefined };
    await renderCard(makeRequest('QUEUED'), props);

    await act(async () => button('취소')?.props.onPress());
    assert.deepEqual(config?.variables, { connections: [], input: { requestId: 'request-id' } });
    assert.equal(visibleText()?.includes('접수됨'), true);
    assert.equal(button('취소') !== undefined, true);
    assert.equal(button('다시 작성'), undefined);

    await updateCard(makeRequest('CANCELLED'), props);
    assert.equal(button('취소'), undefined);
    assert.equal(button('다시 작성') !== undefined, true);
    assert.equal(visibleText()?.includes('취소됨'), true);
  });

  it('removes a cancelled row from the supplied active connection only', async () => {
    let config: MutationConfig | undefined;
    cancelCommit = (nextConfig) => {
      config = nextConfig;
    };
    await renderCard(makeRequest('PROCESSING'), { activeConnectionId: 'active-requests' });

    await act(async () => button('취소')?.props.onPress());
    assert.deepEqual(config?.variables, {
      connections: ['active-requests'],
      input: { requestId: 'request-id' },
    });
  });

  it('only reports cancellation to the active list after the Node reflects CANCELLED', async () => {
    cancelCommit = (config) => config.onError?.(new Error('response lost'));
    const onCancelled = mock.fn();
    const props = { activeConnectionId: 'active-requests', onCancelled };
    await renderCard(makeRequest('PROCESSING'), props);

    await act(async () => button('취소')?.props.onPress());
    assert.equal(onCancelled.mock.callCount(), 0);
    await act(async () => lastRefetch?.options.onComplete?.(null));
    assert.equal(onCancelled.mock.callCount(), 0);

    await updateCard(makeRequest('CANCELLED'), props);
    assert.deepEqual(onCancelled.mock.calls[0]?.arguments, [{ requestNodeId: 'request-node-id' }]);
  });

  it('does not offer cancellation during publishing or confirmation', async () => {
    await renderCard(makeRequest('PUBLISHING'));
    assert.equal(visibleText()?.includes('게시 중'), true);
    assert.equal(button('취소'), undefined);

    await updateCard(makeRequest('CONFIRMING'));
    assert.equal(visibleText()?.includes('게시 결과 확인 중'), true);
    assert.equal(button('취소'), undefined);
  });

  it('shows failed requests as rewriteable without a cancel action', async () => {
    const onRewrite = mock.fn();
    await renderCard(makeRequest('FAILED'), { onRewrite });

    await act(async () => button('다시 작성')?.props.onPress());
    assert.deepEqual(onRewrite.mock.calls[0]?.arguments, ['request-id']);
    assert.equal(visibleText()?.includes('게시 실패'), true);
    assert.equal(button('취소'), undefined);
  });

  it('shows the content warning instead of the body and keeps sensitive media images concealed', async () => {
    const media = [
      { altText: '산', media: { id: 'media-id', url: 'https://example.test/image.jpg' } },
    ];
    await renderCard(
      makeRequest('QUEUED', {
        draft: {
          bodyText: '비공개 미리보기',
          contentWarning: '민감한 내용',
          media,
          sensitiveMedia: false,
        },
      }),
    );
    assert.equal(visibleText()?.includes('비공개 미리보기'), false);
    assert.equal(visibleText()?.includes('민감한 내용'), true);
    assert.equal(findAllByType('Image').length, 0);

    await updateCard(
      makeRequest('QUEUED', {
        draft: {
          bodyText: '민감한 미리보기',
          contentWarning: null,
          media,
          sensitiveMedia: true,
        },
      }),
    );
    assert.equal(visibleText()?.includes('민감한 미리보기'), true);
    assert.equal(findAllByType('Image').length, 0);

    await updateCard(
      makeRequest('QUEUED', {
        draft: {
          bodyText: '공개 미리보기',
          contentWarning: null,
          media,
          sensitiveMedia: false,
        },
      }),
    );
    assert.equal(visibleText()?.includes('공개 미리보기'), true);
    assert.equal(findAllByType('Image').length, 1);
  });

  it('links to the published post and emits completion only after observing an active-to-published transition', async () => {
    const onPublished = mock.fn();
    const published = makeRequest('PUBLISHED', {
      post: { id: 'post-id', profile: { id: 'profile-writer', relativeHandle: '@writer' } },
    });
    await renderCard(published, { onPublished });

    assert.equal(findAllByType('Link')[0]?.props.href, '/@writer/post-id');
    assert.equal(onPublished.mock.callCount(), 0);

    await updateCard(makeRequest('QUEUED'), { onPublished });
    await updateCard(published, { onPublished });
    assert.deepEqual(onPublished.mock.calls[0]?.arguments, [
      {
        requestNodeId: 'request-node-id',
        postId: 'post-id',
        authorProfileId: 'profile-writer',
      },
    ]);
  });

  it('keeps the last known status visible after a cancel error and offers a manual status check', async () => {
    cancelCommit = (config) => config.onError?.(new Error('network error'));
    await renderCard(makeRequest('QUEUED'));

    await act(async () => button('취소')?.props.onPress());
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
