import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
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
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type {
  PostMediaViewerHostProvider as HostProviderComponent,
  usePostMediaViewerHost as UseHost,
} from './PostMediaViewerHost';

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

Object.assign(globalThis, {
  cancelAnimationFrame: () => undefined,
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  },
});

mock.module('react-native', {
  exports: {
    StyleSheet: { create: <T>(styles: T) => styles },
    View: 'View',
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
  exports: { useRelayActor: () => ({ revision: actorRevision }) },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostActionAuthentication', {
  exports: {
    usePostActionAuthentication: () => ({
      execution: { kind: 'disabled' },
      resolve: () => undefined,
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostActionSurface', {
  exports: {
    PostActionSurface: (props: Record<string, unknown>) =>
      createElement('PostActionSurface', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./PostMediaViewer', {
  exports: {
    PostMediaViewer: ({ children }: { children?: React.ReactNode }) =>
      createElement('ModalShell', { testID: 'post-media-viewer-dialog' }, children),
    PostMediaViewerContent: (props: Record<string, unknown>) =>
      createElement('ViewerContent', { ...props, testID: 'post-media-viewer-content' }),
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

mock.module('./PostReplyCoordinator', {
  exports: { usePostReplyBinding: () => null },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('./replySurface', {
  exports: { getReplyProcessingState: () => 'disabled' },
} as unknown as Parameters<typeof mock.module>[1]);

let HostProvider: typeof HostProviderComponent;
let useHost: typeof UseHost;

before(async () => {
  ({ PostMediaViewerHostProvider: HostProvider, usePostMediaViewerHost: useHost } =
    await import('./PostMediaViewerHost'));
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
