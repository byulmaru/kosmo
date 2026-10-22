import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, mock, test } from 'node:test';
import { createElement, Fragment } from 'react';
import * as Relay from 'react-relay';
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
import homeQuery from './__generated__/PostListHomeNextPageQuery.graphql';
import localQuery from './__generated__/PostListLocalNextPageQuery.graphql';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse, RequestParameters } from 'relay-runtime';
import type { ProfileBlockAction as ProfileBlockActionComponent } from '../profile/ProfileBlockAction';
import type { PostList as PostListComponent } from './PostList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const stub = (path: string | URL, exports: object) => mock.module(path, { exports } as never);
const requests: Array<{
  actor: string;
  name: string;
  variables: Record<string, unknown>;
  sink: { next(value: GraphQLResponse): void; complete(): void; error(error: Error): void };
}> = [];
const animationFrames = new Map<number, FrameRequestCallback>();
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
let nextAnimationFrameId = 0;
let documentHeight = 4_000;
const browserWindow = {
  addEventListener: () => undefined,
  cancelAnimationFrame: (id: number) => animationFrames.delete(id),
  innerHeight: 800,
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    const id = ++nextAnimationFrameId;
    animationFrames.set(id, callback);
    return id;
  },
  removeEventListener: () => undefined,
  scrollY: 0,
};
const browserDocument = {
  documentElement: {
    get scrollHeight() {
      return documentHeight;
    },
  },
};
const theme = {
  backgroundCanvas: '#fff',
  borderSubtle: '#ddd',
  foregroundSecondary: '#555',
  textSecondary: '#666',
};
let renderer: ReactTestRenderer | null = null;
let PostList: typeof PostListComponent;
let ProfileBlockAction: typeof ProfileBlockActionComponent;

function artifact(name: string) {
  for (const path of [
    `./__generated__/${name}.graphql.ts`,
    `../profile/__generated__/${name}.graphql.ts`,
  ]) {
    try {
      return require(path).default as unknown;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
        throw error;
      }
    }
  }
  assert.fail(`Missing Relay artifact: ${name}`);
}

stub('react-relay', {
  ...Relay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:fragment|query|mutation)\s+(\w+)/)?.[1];
    assert.ok(name, 'Relay graphql tag must have an operation or fragment name');
    return artifact(name);
  },
});
stub('react-native', {
  ActivityIndicator: 'ActivityIndicator',
  FlatList: 'FlatList',
  Platform: { OS: 'web' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
  View: 'View',
  findNodeHandle: () => null,
  useWindowDimensions: () => ({ height: 844, width: 390 }),
});
stub('expo-router', {
  Link: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
  usePathname: () => '/home',
  useRouter: () => ({ push: () => undefined }),
});
stub('lucide-react-native', { MessageCircle: 'MessageCircle', Pin: 'Pin' });
stub('react-native-svg', {
  Circle: 'Circle',
  Defs: 'Defs',
  LinearGradient: 'LinearGradient',
  Path: 'Path',
  Rect: 'Rect',
  Stop: 'Stop',
  Svg: 'Svg',
});
stub('@/theme/ThemeProvider', { useTheme: () => theme });
stub('@/theme/tokens', {
  fontFamilies: { ui: 'ui' },
  radii: { full: 999, md: 12, sm: 4 },
  spacing: { lg: 16, md: 12, sm: 8, xs: 4, xxxl: 48 },
  typography: { sm: {} },
});
stub('@/lib/date', { formatTimelineTimestamp: () => 'now' });
stub('@/components/profile/ProfileNameBlock', { ProfileNameBlock: () => null });
stub('@/components/ui/Avatar', { Avatar: () => null });
stub('@/components/ui/TimestampText', { TimestampText: 'TimestampText' });
stub('@/components/ui/ToastProvider', { useToast: () => ({ showToast: () => undefined }) });
stub('@/session/SessionProvider', { useSession: () => ({ selectedProfileId: 'owner-a' }) });
stub('@/components/ui/Button', {
  Button: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('Button', props, children),
});
stub('@/components/ui/ConfirmationContent', {
  ConfirmationContent: (props: object) => createElement('ConfirmationContent', props),
});
stub('@/components/ui/ModalSheet', {
  ModalSheet: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ModalSheet', props, children),
});
stub('@/components/ui/StateView', { Skeleton: 'Skeleton', StateView: 'StateView' });
stub('@/components/shell/shellLayout', { getShellLayout: () => 'mobile' });
for (const [file, name] of [
  ['PostActionAuthentication', 'PostActionAuthenticationProvider'],
  ['PostComposerCoordinator', 'PostComposerCoordinatorProvider'],
]) {
  stub(new URL(`./${file}.tsx`, import.meta.url), {
    [name!]: ({ children }: { children?: ReactNode }) => children,
  });
}
stub(new URL('./PostMediaViewerHost.tsx', import.meta.url), {
  PostMediaViewerHostProvider: ({ children }: { children?: ReactNode }) => children,
  usePostMediaViewerHost: () => () => undefined,
});
stub(new URL('./PostActionSurface.tsx', import.meta.url), { PostActionSurface: () => null });
stub(new URL('./PostBody.tsx', import.meta.url), {
  PostBody: ({ post }: { post: { content?: { bodyText?: string | null } | null; id: string } }) =>
    createElement('Text', { testID: `body-${post.id}` }, post.content?.bodyText),
});
stub(new URL('./PostReplySurface.tsx', import.meta.url), {
  usePostReplySurface: () => ({ reply: undefined, replySurface: null }),
});
stub(new URL('./PostSourcePresentationView.tsx', import.meta.url), {
  PostSourcePresentationView: ({
    post,
  }: {
    post: { content?: { bodyText?: string | null } | null; id: string };
  }) => createElement('Text', { testID: `body-${post.id}` }, post.content?.bodyText),
  PostSourcePreview: () => null,
});

before(async () => {
  ({ PostList } = await import('./PostList'));
  ({ ProfileBlockAction } = await import('../profile/ProfileBlockAction'));
});

beforeEach(() => {
  documentHeight = 4_000;
  globalThis.window = browserWindow as unknown as Window & typeof globalThis;
  globalThis.document = browserDocument as unknown as Document;
  mock.timers.enable({ apis: ['setTimeout'] });
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  renderer = null;
  requests.length = 0;
  animationFrames.clear();
  if (originalWindow) {
    globalThis.window = originalWindow;
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
  if (originalDocument) {
    globalThis.document = originalDocument;
  } else {
    Reflect.deleteProperty(globalThis, 'document');
  }
});

const targetId = 'target-a';
const blockId = 'block-a';
const queryBySurface = { home: homeQuery, local: localQuery } as const;
type Surface = keyof typeof queryBySurface;

function FeedSurface({
  ignoreBlock = false,
  queryOwner,
  surface,
}: {
  ignoreBlock?: boolean;
  queryOwner: unknown;
  surface: Surface;
}) {
  const listFragmentKey = {
    __id: 'client:root',
    __fragments: { [`PostList_${surface}`]: { count: 20, cursor: null } },
    __fragmentOwner: queryOwner,
  };
  return createElement(
    Fragment,
    null,
    createElement(PostList, {
      ignoreBlock,
      identityKey: surface,
      [surface]: listFragmentKey,
    } as never),
    createElement(ProfileBlockAction, {
      nextBlocked: true,
      profile: {
        __id: targetId,
        __fragments: { ProfileBlockAction_profile: {} },
        __fragmentOwner: queryOwner,
      } as never,
      surface: 'button',
    }),
  );
}

function FeedUnderTest({
  surface,
  environment,
  ignoreBlock,
  queryOwner,
}: {
  surface: Surface;
  environment: Environment;
  ignoreBlock?: boolean;
  queryOwner: unknown;
}) {
  return createElement(Relay.RelayEnvironmentProvider, {
    environment,
    children: createElement(FeedSurface, { ignoreBlock, queryOwner, surface }),
  });
}

function createFeedEnvironment() {
  return new Environment({
    network: Network.create((request: RequestParameters, variables) =>
      Observable.create<GraphQLResponse>((sink) => {
        requests.push({ actor: 'A', name: request.name, variables, sink });
      }),
    ),
    store: new Store(new RecordSource()),
  });
}

async function start(surface: Surface, rows = feedRows(), hasNextPage = false) {
  const environment = createFeedEnvironment();
  const operation = createOperationDescriptor(getRequest(queryBySurface[surface]), {
    count: 20,
  });
  const field = surface === 'home' ? 'homeTimeline' : 'localTimeline';
  environment.commitPayload(operation, { [field]: feedConnection(rows, hasNextPage) });
  await act(async () => {
    renderer = create(
      createElement(FeedUnderTest, {
        environment,
        queryOwner: operation.request,
        surface,
      }),
    );
  });
  await act(async () => flushAnimationFrames());
  return { environment, queryOwner: operation.request };
}

function feedRows(): ReturnType<typeof postNode>[] {
  return [
    postNode('post-target', targetId),
    postNode('post-repost', 'other-a', null, postNode('source-target', targetId)),
    postNode('post-quote', 'other-c', 'body-post-quote', postNode('source-target', targetId)),
    postNode('post-other', 'other-b'),
  ];
}

function feedConnection(rows: ReturnType<typeof postNode>[], hasNextPage: boolean) {
  return {
    edges: rows.map((node) => ({ cursor: node.id, node })),
    pageInfo: {
      endCursor: (rows.at(-1)?.id as string | undefined) ?? null,
      hasNextPage,
      hasPreviousPage: false,
      startCursor: (rows[0]?.id as string | undefined) ?? null,
    },
  };
}

function postNode(
  id: string,
  profileId: string,
  content: string | null = `body-${id}`,
  repostSource?: Record<string, unknown> | null,
) {
  return {
    __typename: 'Post',
    id,
    createdAt: '2026-10-20T00:00:00Z',
    state: 'ACTIVE',
    visibility: 'PUBLIC',
    isPinned: false,
    content:
      content === null
        ? null
        : {
            __typename: 'PostContent',
            id: `${id}:content`,
            bodyText: content,
            contentWarning: null,
            document: { version: 1, summary: null, body: { type: 'doc', content: [] } },
            media: [],
            mentionedProfiles: [],
          },
    profile: profile(profileId),
    replyParent: null,
    repostSource: repostSource ?? null,
    viewerBookmark: null,
    repostCount: 0,
    viewerRepost: null,
    viewerReactions: [],
    reactionCounts: [],
  };
}

function profile(id: string) {
  return {
    __typename: 'Profile',
    id,
    displayName: id,
    handle: id,
    relativeHandle: `@${id}`,
    avatar: null,
    instance: { kind: 'LOCAL' },
    viewerState: {
      blockedBy: false,
      isSelf: false,
      profileBlock: null,
      profileMute: null,
    },
  };
}

function visibleBodies() {
  return renderer!.root
    .findAll((node) => (node.type as unknown) === 'Text' && typeof node.props.testID === 'string')
    .map((node) => node.props.testID as string)
    .filter((testID) => testID.startsWith('body-'))
    .sort();
}

function findByType(type: string) {
  const match = renderer!.root.findAll((node) => (node.type as unknown) === type)[0];
  assert.ok(match, `Expected rendered ${type}`);
  return match;
}

function flushAnimationFrames() {
  for (const [id, callback] of animationFrames) {
    animationFrames.delete(id);
    callback(0);
  }
}

function blockResponse() {
  return {
    blockProfile: {
      success: true,
      profileBlock: {
        id: blockId,
        targetProfile: {
          displayName: 'target-a',
          followPolicy: 'OPEN',
          followersCount: 0,
          handle: 'target-a',
          id: targetId,
          relativeHandle: '@target-a',
          viewerState: {
            follow: null,
            followRequest: null,
            blockedBy: false,
            isSelf: false,
            profileBlock: {
              id: blockId,
              targetProfile: {
                displayName: 'target-a',
                id: targetId,
                relativeHandle: '@target-a',
              },
            },
          },
        },
      },
    },
  };
}

async function blockTarget() {
  await act(async () => findByType('Button').props.onPress());
  await act(async () => findByType('ConfirmationContent').props.onConfirm());
  const mutation = requests.find(
    (item) => item.actor === 'A' && item.name === 'ProfileBlockActionBlockMutation',
  );
  assert.ok(mutation);
  assert.deepEqual(mutation.variables, { id: targetId });
  await act(async () => {
    mutation.sink.next({ data: blockResponse() });
    mutation.sink.complete();
  });
}

for (const surface of ['home', 'local'] as const) {
  test(`${surface} block mutation filters blocked authors and pure reposts while retaining Quotes and unrelated rows`, async () => {
    const { environment, queryOwner } = await start(surface);
    assert.deepEqual(visibleBodies(), [
      'body-post-other',
      'body-post-quote',
      'body-post-target',
      'body-source-target',
    ]);

    await blockTarget();

    assert.deepEqual(visibleBodies(), ['body-post-other', 'body-post-quote']);
    assert.equal(
      environment.getStore().getSource().get('client:target-a:viewerState')?.profileBlock?.__ref,
      blockId,
    );

    await act(async () =>
      renderer!.update(
        createElement(FeedUnderTest, {
          environment,
          ignoreBlock: true,
          queryOwner,
          surface,
        }),
      ),
    );
    assert.deepEqual(visibleBodies(), [
      'body-post-other',
      'body-post-quote',
      'body-post-target',
      'body-source-target',
    ]);
  });
}

test('the web list loads another page when blocking filters every loaded row', async () => {
  const rows = [
    postNode('post-target', targetId),
    postNode('post-repost', 'other-a', null, postNode('source-target', targetId)),
  ];
  await start('home', rows, true);
  assert.deepEqual(visibleBodies(), ['body-post-target', 'body-source-target']);
  assert.equal(requests.length, 0);

  documentHeight = 800;
  await blockTarget();
  assert.deepEqual(visibleBodies(), []);
  findByType('StateView');

  await act(async () => flushAnimationFrames());
  const nextPage = requests.find((item) => item.name === 'PostListHomeNextPageQuery');
  assert.ok(nextPage, 'an empty filtered list should request another page');
  assert.equal(nextPage.variables.cursor, 'post-repost');
  assert.equal(nextPage.variables.count, 20);

  await act(async () => {
    nextPage.sink.next({
      data: {
        homeTimeline: {
          edges: [
            {
              cursor: 'post-next',
              node: postNode('post-next', 'other-next'),
            },
          ],
          pageInfo: {
            endCursor: 'post-next',
            hasNextPage: false,
            hasPreviousPage: false,
            startCursor: 'post-next',
          },
        },
      },
    });
    nextPage.sink.complete();
  });
  await act(async () => mock.timers.tick(0));
  await act(async () => flushAnimationFrames());
  assert.deepEqual(visibleBodies(), ['body-post-next']);
});
