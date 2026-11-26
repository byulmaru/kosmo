import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createContext, createElement } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import {
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import PostMediaViewerHostQueryNode from './__generated__/PostMediaViewerHostQuery.graphql';
import type { ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { usePostMediaViewerHost as UseHost } from './PostMediaViewerContext';
import type { PostMediaViewerHostProvider as HostProviderComponent } from './PostMediaViewerHost';

const PostComposerCoordinatorContext = createContext(undefined);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PendingRequest = {
  settled: boolean;
  sink: {
    complete(): void;
    error(error: Error): void;
    next(payload: GraphQLResponse): void;
  };
};

let actorRevision = 0;
let activeRequests: PendingRequest[] = [];
let renderer: ReactTestRenderer | null = null;
let viewportWidth = 1280;
let replyExecutionKind: 'disabled' | 'enabled' | 'resolution-required' = 'disabled';
let replyResolutionReasons: Array<'guest' | 'profile'> = [];
let replyPressOwners: Array<'detail' | 'list' | undefined> = [];
let replyBinding: {
  expanded: boolean;
  onPostCreated?: () => void;
  onPress: (owner?: 'detail' | 'list') => void;
  onRequestClose: () => void;
  owner: 'detail' | 'list';
  profile: object | null;
} | null = null;
const platform = { OS: 'web' as 'ios' | 'web' };

Object.assign(globalThis, {
  cancelAnimationFrame: () => undefined,
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  },
});

mock.module('react-native', {
  exports: {
    Platform: platform,
    StyleSheet: { create: <T>(styles: T) => styles },
    useWindowDimensions: () => ({ width: viewportWidth }),
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('expo-router', {
  exports: {
    unstable_navigationEvents: { addListener: () => () => undefined },
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('react-relay', {
  exports: {
    ...ReactRelay,
    graphql: () => PostMediaViewerHostQueryNode,
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/ui/StateView', {
  exports: {
    StateView: (props: Record<string, unknown>) => createElement('StateView', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/observability/UnexpectedErrorContext', {
  exports: { useUnexpectedErrorReporter: () => null },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/relay/RelayActorProvider', {
  exports: { useRelayActorLifecycleKey: () => String(actorRevision) },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostActionAuthentication', {
  exports: {
    usePostActionAuthentication: () => ({
      execution:
        replyExecutionKind === 'resolution-required'
          ? { kind: replyExecutionKind, reason: 'profile' }
          : { kind: replyExecutionKind },
      resolve: (reason: 'guest' | 'profile') => {
        replyResolutionReasons.push(reason);
      },
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostActionSurface', {
  exports: {
    PostActionSurface: ({ reply }: { reply?: { onPress: () => void } }) =>
      reply
        ? createElement(
            'Pressable',
            {
              accessibilityLabel: '답글',
              accessibilityRole: 'button',
              onPress: reply.onPress,
              testID: 'post-media-viewer-reply-action',
            },
            '답글',
          )
        : null,
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostMediaViewer', {
  exports: {
    PostMediaViewer: ({ children }: { children?: React.ReactNode }) =>
      createElement('ModalShell', { testID: 'post-media-viewer-dialog' }, children),
    PostMediaViewerContent: ({ actionBar, ...props }: Record<string, unknown>) =>
      createElement(
        'ViewerContent',
        { ...props, testID: 'post-media-viewer-content' },
        actionBar as ReactNode,
      ),
    PostMediaViewerQueryState: ({
      loading = false,
      onRetry,
      unavailable = false,
    }: {
      loading?: boolean;
      onRetry?: () => void;
      unavailable?: boolean;
    }) =>
      createElement('QueryState', {
        onRetry,
        testID: unavailable
          ? 'post-media-viewer-unavailable'
          : loading
            ? 'post-media-viewer-query-loading'
            : 'post-media-viewer-query-error',
      }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./postMediaViewerSession', {
  exports: { focusPostMediaViewerTarget: () => undefined },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostMediaViewerThread', {
  exports: {
    PostMediaViewerThread: (props: Record<string, unknown>) =>
      createElement('PostMediaViewerThread', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostComposerCoordinator', {
  exports: {
    PostComposerCoordinatorContext,
    usePostComposerBinding: () => replyBinding,
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./replySurface', {
  exports: { getReplyProcessingState: () => 'disabled' },
} as unknown as Parameters<typeof mock.module>[1]);

let HostProvider: typeof HostProviderComponent;
let useHost: typeof UseHost;

before(async () => {
  ({ usePostMediaViewerHost: useHost } = await import('./PostMediaViewerContext'));
  ({ PostMediaViewerHostProvider: HostProvider } = await import('./PostMediaViewerHost'));
});

afterEach(async () => {
  await act(async () => {
    for (const request of activeRequests) {
      if (!request.settled) {
        request.settled = true;
        request.sink.complete();
      }
    }
  });
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  actorRevision = 0;
  activeRequests = [];
  viewportWidth = 1280;
  replyExecutionKind = 'disabled';
  replyResolutionReasons = [];
  replyPressOwners = [];
  replyBinding = null;
  platform.OS = 'web';
});

describe('PostMediaViewerHost Relay lifecycle', () => {
  it('cache hit을 즉시 표시하면서 store-and-network 갱신을 시작한다', async () => {
    const relay = createEnvironment(hostPayload());
    await renderHost(relay.environment);
    await openViewer();

    assert.ok(byTestId('post-media-viewer-content'));
    assert.equal(optionalByTestId('post-media-viewer-query-loading'), null);
    assert.equal(relay.requests.length, 1);
  });

  it('프로필 선택이 필요한 Viewer Reply는 Reply 버튼으로 profile-switcher 경로를 연다', async () => {
    replyExecutionKind = 'resolution-required';
    replyBinding = {
      expanded: false,
      onPress: () => {
        throw new Error('프로필을 선택하기 전에는 답글 Composer를 열지 않는다.');
      },
      onRequestClose: () => undefined,
      owner: 'detail',
      profile: {},
    };
    const relay = createEnvironment(hostPayload());
    await renderHost(relay.environment);
    await openViewer();

    await act(async () => byTestId('post-media-viewer-reply-action').props.onPress());

    assert.deepEqual(replyResolutionReasons, ['profile']);
    assert.equal(optionalByTestId('post-media-viewer-dialog'), null);
  });

  it('Native Viewer Reply는 넓은 viewport에서도 originating list composer로 연결된다', async () => {
    platform.OS = 'ios';
    viewportWidth = 1600;
    replyExecutionKind = 'enabled';
    replyBinding = {
      expanded: false,
      onPress: (owner) => replyPressOwners.push(owner),
      onRequestClose: () => undefined,
      owner: 'detail',
      profile: {},
    };
    const relay = createEnvironment(hostPayload());
    await renderHost(relay.environment);
    await openViewer();

    await act(async () => byTestId('post-media-viewer-reply-action').props.onPress());

    assert.equal(optionalByTestId('post-media-viewer-dialog'), null);
    assert.deepEqual(replyPressOwners, ['list']);
  });

  it('pending query가 완료되어도 같은 modal shell을 유지한다', async () => {
    const relay = createEnvironment();
    await renderHost(relay.environment);
    await openViewer();
    const dialog = byTestId('post-media-viewer-dialog');
    assert.ok(byTestId('post-media-viewer-query-loading'));

    await respond(relay.requests[0], hostPayload());

    assert.strictEqual(byTestId('post-media-viewer-dialog'), dialog);
    assert.ok(byTestId('post-media-viewer-content'));
  });

  it('query error를 실제 ErrorBoundary에서 retry해 같은 modal shell에 복구한다', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      const relay = createEnvironment();
      await renderHost(relay.environment);
      await openViewer();
      const dialog = byTestId('post-media-viewer-dialog');

      await fail(relay.requests[0]);
      await act(async () => byTestId('post-media-viewer-query-error').props.onRetry());
      await respond(relay.requests[1], hostPayload());

      assert.strictEqual(byTestId('post-media-viewer-dialog'), dialog);
      assert.ok(byTestId('post-media-viewer-content'));
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('null Post를 shell 안의 unavailable로 표시한다', async () => {
    const relay = createEnvironment();
    await renderHost(relay.environment);
    await openViewer();

    await respond(relay.requests[0], { surface: null });

    assert.ok(byTestId('post-media-viewer-dialog'));
    assert.ok(byTestId('post-media-viewer-unavailable'));
  });

  it('actor environment가 바뀌면 Viewer를 닫고 이전 query 결과를 격리한다', async () => {
    const previous = createEnvironment(hostPayload());
    await renderHost(previous.environment);
    await openViewer();
    assert.ok(byTestId('post-media-viewer-content'));

    actorRevision += 1;
    const next = createEnvironment();
    await act(async () => renderer?.update(hostTree(next.environment)));

    assert.equal(optionalByTestId('post-media-viewer-dialog'), null);
    await respond(previous.requests[0], hostPayload());
    if (next.requests[0]) {
      await respond(next.requests[0], { surface: null });
    }
    assert.equal(next.environment.getStore().getSource().get('post-1'), undefined);
    assert.equal(optionalByTestId('post-media-viewer-dialog'), null);
  });
});

function Launcher() {
  const openViewer = useHost();
  return createElement('Pressable', {
    onPress: () =>
      openViewer({
        mediaOwnerPostId: 'post-1',
        originControl: { current: { focus: () => undefined } } as never,
        selectedIndex: 0,
        surfacePostId: 'post-1',
      }),
    testID: 'launcher',
  });
}

function createEnvironment(seed?: ReturnType<typeof hostPayload>) {
  const requests: PendingRequest[] = [];
  const relayEnvironment = new Environment({
    isServer: true,
    network: Network.create(() =>
      Observable.create((sink) => {
        const request: PendingRequest = { settled: false, sink };
        requests.push(request);
        activeRequests.push(request);
      }),
    ),
    store: new Store(new RecordSource()),
  });
  if (seed) {
    relayEnvironment.commitPayload(
      createOperationDescriptor(getRequest(PostMediaViewerHostQueryNode), {
        surfacePostId: 'post-1',
      }),
      seed,
    );
  }
  return { environment: relayEnvironment, requests };
}

function hostTree(relayEnvironment: Environment) {
  return createElement(ReactRelay.RelayEnvironmentProvider, {
    children: createElement(HostProvider, null, createElement(Launcher)),
    environment: relayEnvironment,
  });
}

async function renderHost(relayEnvironment: Environment) {
  await act(async () => {
    renderer = create(hostTree(relayEnvironment));
  });
}

async function openViewer() {
  await act(async () => byTestId('launcher').props.onPress());
}

async function respond(request: PendingRequest | undefined, data: object) {
  assert.ok(request);
  await act(async () => {
    request.settled = true;
    request.sink.next({ data });
    request.sink.complete();
  });
}

async function fail(request: PendingRequest | undefined) {
  assert.ok(request);
  await act(async () => {
    request.settled = true;
    request.sink.error(new Error('host query failed'));
  });
}

function byTestId(testID: string): ReactTestInstance {
  assert.ok(renderer);
  return renderer.root.findByProps({ testID });
}

function optionalByTestId(testID: string): ReactTestInstance | null {
  assert.ok(renderer);
  return renderer.root.findAllByProps({ testID })[0] ?? null;
}

function hostPayload() {
  return {
    surface: {
      __typename: 'Post',
      content: {
        bodyText: '본문',
        id: 'content-1',
        media: [
          {
            __typename: 'Media',
            altText: '첫 이미지',
            id: 'media-1',
            url: 'https://media.example/1.webp',
          },
        ],
      },
      id: 'post-1',
      profile: {
        __typename: 'Profile',
        avatar: null,
        displayName: '작성자',
        id: 'profile-1',
        relativeHandle: '@author',
      },
      reactionCounts: [],
      replyCount: 2,
      repostCount: 0,
      repostSource: null,
      state: 'ACTIVE',
      viewerBookmark: null,
      viewerReactions: [],
      viewerRepost: null,
      visibility: 'PUBLIC',
    },
  };
}
