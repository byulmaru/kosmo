import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, useState } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import { post, profile } from '@/stories/fixtures';
import PostComposerQuery from './(tabs)/(post)/[profileHandle]/__generated__/PostDetailComposerQuery.graphql';
import PostConversationQuery from './(tabs)/(post)/[profileHandle]/__generated__/PostDetailConversationQuery.graphql';
import PostQuery from './(tabs)/(post)/[profileHandle]/__generated__/PostDetailQuery.graphql';
import type { ComponentType, PropsWithChildren } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse, RequestParameters, Variables } from 'relay-runtime';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  useLocalSearchParams: () => ({ postId: 'post-current', profileHandle: '@kosmo' }),
  usePathname: () => '/@kosmo/post-current',
  useRouter: () => ({ back: () => undefined, replace: () => undefined }),
  useSegments: () => [],
});
mockModule('lucide-react-native', { ChevronLeftIcon: 'ChevronLeftIcon' });
mockModule('react-native-svg', {
  Circle: 'Circle',
  ClipPath: 'ClipPath',
  Defs: 'Defs',
  G: 'G',
  LinearGradient: 'LinearGradient',
  Path: 'Path',
  Polygon: 'Polygon',
  Polyline: 'Polyline',
  Rect: 'Rect',
  Stop: 'Stop',
  Svg: 'Svg',
});
mockModule('react-native', {
  Platform: { OS: 'web' },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  processColor: () => 0,
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  Touchable: { Mixin: {} },
  View: 'View',
  useWindowDimensions: () => ({ height: 800, width: 1200 }),
});
mockModule('@/components/PageHeader', {
  PageHeader: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) =>
    createElement('PageHeader', props, children),
});
mockModule('@/components/post/PostDetailThread', {
  PostDetailConversationData: (props: Record<string, unknown>) =>
    createElement('Conversation', props, createElement('CurrentPost', { id: props.currentId })),
  PostDetailThreadProviders: ({
    children,
    profile: selectedProfile,
  }: PropsWithChildren<Record<string, unknown>>) => {
    const [draft, setDraft] = useState('draft-preserved');
    return createElement(
      'Providers',
      { draft, profileId: (selectedProfile as { id?: string } | null)?.id ?? null },
      createElement('DraftInput', { onChange: setDraft, value: draft }),
      children,
    );
  },
  PostDetailThreadViewport: ({ children }: PropsWithChildren) =>
    createElement('Viewport', null, children),
});
mockModule('@/components/shell/PrimaryNavigationScrollContext', {
  usePrimaryNavigationScroll: () => ({ isHistoryEntryRestoration: () => false }),
});
mockModule('@/components/shell/shellLayout', { getWebMobileShellHeader: () => false });
mockModule('@/components/ui/Button', {
  Button: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) =>
    createElement('Button', props, children),
});
mockModule('@/components/ui/IconButton', {
  IconButton: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) =>
    createElement('IconButton', props, children),
});
mockModule('@/components/ui/StateView', {
  StateView: (props: Record<string, unknown>) => createElement('StateView', props),
});
mockModule('@/theme/ThemeProvider', { useTheme: () => ({ text: '#111111' }) });
mockModule('@/theme/tokens', { spacing: { sm: 12 } });

const queryByName = (name: string) => {
  if (name === 'PostDetailQuery') {
    return PostQuery;
  }
  if (name === 'PostDetailComposerQuery') {
    return PostComposerQuery;
  }
  if (name === 'PostDetailConversationQuery') {
    return PostConversationQuery;
  }
  throw new Error(`Unexpected query ${name}`);
};

mockModule('react-relay', {
  ...ReactRelay,
  graphql: (strings: TemplateStringsArray) => {
    const source = strings.join('');
    const match = source.match(/(?:query|fragment)\s+(\w+)/);
    return queryByName(match?.[1] ?? '');
  },
});

type PendingRequest = {
  fail: (error: Error) => void;
  request: RequestParameters;
  respond: (data: Record<string, unknown>) => void;
  variables: Variables;
};

let PostDetailScreen: ComponentType;
let renderer: ReactTestRenderer | null = null;
let pending: PendingRequest[] = [];

before(async () => {
  ({ default: PostDetailScreen } = await import('./(tabs)/(post)/[profileHandle]/[postId]'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  pending = [];
});

function createEnvironment() {
  return new Environment({
    network: Network.create((request, variables) =>
      Observable.create<GraphQLResponse>((sink) => {
        const current = {
          fail: (error: Error) => sink.error(error),
          request,
          respond: (data: Record<string, unknown>) => {
            sink.next({ data });
            sink.complete();
          },
          variables,
        };
        pending.push(current);
        return () => undefined;
      }),
    ),
    store: new Store(new RecordSource()),
  });
}

function tree(environment: Environment) {
  return createElement(ReactRelay.RelayEnvironmentProvider, {
    environment,
    children: createElement(PostDetailScreen),
  });
}

function node(type: string) {
  assert.ok(renderer);
  return renderer.root.find((item) => String(item.type) === type);
}

function request(name: string) {
  const result = pending.findLast((item) => item.request.name === name);
  assert.ok(result, `missing pending ${name} request`);
  return result;
}

const author = profile({ id: 'profile-kosmo', relativeHandle: '@kosmo' });
const currentPost = post({ id: 'post-current', profile: author, bodyText: '현재 게시글' });
const composerProfile = profile({ id: 'profile-composer', relativeHandle: '@writer' });
const conversationPayload = {
  node: {
    ...currentPost,
    replyAncestors: [],
    replyDescendants: { edges: [], pageInfo: { endCursor: null, hasNextPage: false } },
  },
};

describe('Post detail independent Relay operations', () => {
  it('renders current Post before conversation/composer responses and preserves the tree on retry', async () => {
    const environment = createEnvironment();
    await act(async () => {
      renderer = create(tree(environment));
    });
    assert.deepEqual(pending.map((item) => item.request.name).sort(), [
      'PostDetailComposerQuery',
      'PostDetailConversationQuery',
      'PostDetailQuery',
    ]);

    await act(async () => request('PostDetailQuery').respond({ node: currentPost }));
    assert.deepEqual(
      pending.map((item) => item.request.name),
      ['PostDetailQuery', 'PostDetailComposerQuery', 'PostDetailConversationQuery'],
    );
    const currentBefore = node('CurrentPost');
    const providerBefore = node('Providers');
    assert.equal(currentBefore.props.id, 'post-current');
    assert.equal(providerBefore.props.draft, 'draft-preserved');
    assert.equal(providerBefore.props.profileId, null);
    await act(async () => node('DraftInput').props.onChange('typed draft'));
    assert.equal(node('Providers').props.draft, 'typed draft');

    await act(async () =>
      request('PostDetailComposerQuery').respond({
        currentSession: {
          __typename: 'Session',
          id: 'session',
          selectedProfile: { ...composerProfile, __typename: 'Profile' },
        },
      }),
    );
    assert.equal(node('CurrentPost'), currentBefore);

    await act(async () => request('PostDetailConversationQuery').respond(conversationPayload));
    const conversation = node('Conversation');
    assert.equal(node('CurrentPost'), currentBefore);
    assert.equal(node('Providers').props.draft, 'typed draft');
    assert.ok(conversation.props.conversationKey);
    const conversationKeyBeforeRetry = conversation.props.conversationKey;

    await act(async () => conversation.props.onConversationRetry());
    const retryRequest = pending.at(-1);
    assert.equal(retryRequest?.request.name, 'PostDetailConversationQuery');
    assert.equal(node('Conversation').props.conversationKey, conversationKeyBeforeRetry);
    await act(async () => retryRequest?.fail(new Error('conversation failed')));
    assert.equal(node('CurrentPost'), currentBefore);
    assert.equal(node('Providers').props.draft, 'typed draft');
    assert.equal(node('Conversation').props.conversationKey, conversationKeyBeforeRetry);

    await act(async () => node('Conversation').props.onConversationRetry());
    const recoveredRequest = pending.at(-1);
    assert.equal(recoveredRequest?.request.name, 'PostDetailConversationQuery');
    await act(async () => recoveredRequest?.respond(conversationPayload));
    assert.equal(node('CurrentPost'), currentBefore);

    await act(async () => node('Conversation').props.onConversationRetry());
    const missingConversationRequest = pending.at(-1);
    assert.equal(missingConversationRequest?.request.name, 'PostDetailConversationQuery');
    await act(async () => missingConversationRequest?.respond({ node: null }));
    assert.equal(node('StateView').props.title, '게시글을 찾을 수 없어요');
  });
});
