import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement, useState } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import type { ReactNode } from 'react';
import type {
  ReactTestInstance,
  ReactTestRenderer,
  ReactTestRendererJSON,
} from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { ToastProvider as ToastProviderExport } from '@/components/ui/ToastProvider';
import type { FirstProfileTagDiscoveryRoute as RouteExport } from './FirstProfileTagDiscoveryRoute';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:query|mutation|fragment)\s+(\w+)/)?.[1];
    assert.ok(name);
    const directory = name.startsWith('FirstProfileTagDiscovery') ? '.' : '../profile';
    return require(`${directory}/__generated__/${name}.graphql.ts`).default;
  },
});
mockModule('react-native', {
  ActivityIndicator: 'ActivityIndicator',
  Animated: { View: 'AnimatedView' },
  Platform: { OS: 'web' },
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
  View: 'View',
  useWindowDimensions: () => ({ height: 800, width: 390 }),
});
mockModule('expo-router', { useIsFocused: () => true });
mockModule('@/components/ui/Button', { Button: 'Button' });
mockModule('@/components/BrandLogo', { BrandLogo: 'BrandLogo' });
mockModule('@/components/ui/StateView', { StateView: 'StateView' });
mockModule('@/components/ui/useSafeAreaPadding', { useSafeAreaPadding: () => ({}) });
mockModule(new URL('../ui/Toast.tsx', import.meta.url), { Toast: 'Toast' });
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
});
mockModule('@/theme/useOverlayMotion', {
  useToastMotion: (visible: boolean) => ({
    entered: visible,
    mounted: visible,
    progress: { interpolate: () => 0 },
  }),
});
mockModule('@/components/profile/ProfileListItemContent', {
  ProfileListItemContent: (props: object) => createElement('ProfileRow', props),
});
mockModule('@/components/profile/ProfileBlockAction', { ProfileBlockAction: 'ProfileBlockAction' });
mockModule('@/analytics/client', { trackAnalytics: () => undefined });
mockModule('@/theme/ThemeProvider', {
  useReducedMotion: () => false,
  useTheme: () => ({
    background: '#fff',
    foregroundPrimary: '#111',
    foregroundSecondary: '#666',
    border: '#ddd',
  }),
});
const selectedProfileId = 'owner';
mockModule('@/session/SessionProvider', { useSession: () => ({ selectedProfileId }) });

type Request = {
  name: string;
  variables: Record<string, unknown>;
  sink: { next(value: GraphQLResponse): void; complete(): void; error(error: Error): void };
};
const requests: Request[] = [];
const pending: Request[] = [];
let renderer: ReactTestRenderer | null = null;
let Route: typeof RouteExport;
let ToastProvider: typeof ToastProviderExport;
const firstTag = { id: 'opaque:Hashtag:01', name: 'Fediverse' };
const secondTag = { id: 'opaque:Hashtag:02', name: '음악' };
const queryName = 'FirstProfileTagDiscoveryQuery';
const tagQueryName = 'FirstProfileTagDiscoveryTagQuery';
const nextPageName = 'FirstProfileTagDiscoveryNextPageQuery';

function environment() {
  return new Environment({
    network: Network.create((request, variables) =>
      Observable.create((sink) => {
        const entry = { name: request.name, variables, sink };
        requests.push(entry);
        pending.push(entry);
      }),
    ),
    store: new Store(new RecordSource()),
  });
}
function App({ profileId, empty }: { profileId: string; empty: ReactNode }) {
  const [continued, setContinued] = useState(false);
  return continued
    ? createElement('Home')
    : createElement(Route, {
        profileId,
        empty,
        onContinue: () => setContinued(true),
      });
}
async function mount(env = environment(), profileId = 'owner') {
  await act(async () => {
    renderer = create(
      createElement(ReactRelay.RelayEnvironmentProvider, {
        environment: env,
        children: createElement(ToastProvider, {
          children: createElement(App, { profileId, empty: createElement('NoTagsDestination') }),
        }),
      }),
    );
  });
  return env;
}
function take(name: string, matches: (request: Request) => boolean = () => true) {
  const index = pending.findIndex((request) => request.name === name && matches(request));
  assert.notEqual(
    index,
    -1,
    `missing ${name}; pending ${pending.map((request) => request.name).join(', ')}`,
  );
  return pending.splice(index, 1)[0]!;
}
async function resolve(
  name: string,
  data: object | null,
  errors?: readonly object[],
  matches?: (request: Request) => boolean,
) {
  const request = take(name, matches);
  await act(async () => {
    request.sink.next({ data, ...(errors ? { errors } : {}) } as GraphQLResponse);
    request.sink.complete();
  });
  return request;
}
async function reject(name: string, matches?: (request: Request) => boolean) {
  const request = take(name, matches);
  await act(async () => request.sink.error(new Error('request failed')));
}
function isVisible(node: ReactTestInstance): boolean {
  return !node.props.accessibilityElementsHidden && (!node.parent || isVisible(node.parent));
}
function nodes(type: string, visible = true) {
  assert.ok(renderer);
  return renderer.root.findAll(
    (node) =>
      (typeof node.type === 'function' ? node.type.name === type : String(node.type) === type) &&
      (!visible || isVisible(node)),
  );
}
function button(label: string) {
  assert.ok(renderer);
  // toJSON excludes committed hosts that Suspense has hidden during a retry.
  const collect = (node: ReactTestRendererJSON | string): ReactTestRendererJSON[] => {
    if (typeof node === 'string' || node.props.accessibilityElementsHidden) {
      return [];
    }
    return [...(node.type === 'Button' ? [node] : []), ...(node.children?.flatMap(collect) ?? [])];
  };
  const tree = renderer.toJSON();
  const buttons = (Array.isArray(tree) ? tree : tree ? [tree] : []).flatMap(collect);
  const match = buttons.find(
    (node) => node.props.accessibilityLabel === label || node.children?.includes(label),
  );
  assert.ok(match, `missing visible button ${label}`);
  return match;
}
async function press(label: string) {
  await act(async () => button(label).props.onPress());
}
function savedTags(tags = [firstTag, secondTag]) {
  return { node: { __typename: 'Profile', id: 'owner', tags } };
}
function profile(id: string, overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'Profile',
    id,
    avatar: null,
    displayName: `프로필 ${id}`,
    handle: id,
    relativeHandle: `@${id}`,
    bio: `${id} 소개`,
    followPolicy: 'APPROVAL_REQUIRED',
    followersCount: 0,
    viewerState: { isSelf: id === 'owner', follow: null, followRequest: null, profileBlock: null },
    ...overrides,
  };
}
function tagResult(
  id: string,
  profiles: object[] = [profile('target')],
  hasNext = false,
  cursor = 'cursor-1',
) {
  return {
    node: {
      __typename: 'Hashtag',
      id,
      relatedProfiles: {
        edges: profiles.map((node, index) => ({
          cursor: index === 0 ? cursor : `${cursor}-${index}`,
          node,
        })),
        pageInfo: {
          endCursor: cursor,
          startCursor: cursor,
          hasNextPage: hasNext,
          hasPreviousPage: false,
        },
      },
    },
  };
}
async function loadTags(tags = [firstTag, secondTag]) {
  await resolve(queryName, savedTags(tags));
}
async function loadFirst(profiles = [profile('target')], hasNext = false) {
  await loadTags();
  await resolveTag(firstTag.id, tagResult(firstTag.id, profiles, hasNext));
}
async function resolveTag(id: string, data: object | null) {
  return resolve(tagQueryName, data, undefined, (request) => request.variables.hashtagId === id);
}

before(async () => {
  ({ ToastProvider } = await import('@/components/ui/ToastProvider'));
  ({ FirstProfileTagDiscoveryRoute: Route } = await import('./FirstProfileTagDiscoveryRoute'));
});
beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  mock.method(console, 'error', () => undefined);
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  mock.restoreAll();
  renderer = null;
  requests.length = 0;
  pending.length = 0;
});

function followPayload(followPolicy: 'OPEN' | 'APPROVAL_REQUIRED') {
  const approvalRequired = followPolicy === 'APPROVAL_REQUIRED';
  return {
    followProfile: {
      result: {
        __typename: approvalRequired ? 'ProfileFollowRequest' : 'ProfileFollow',
        id: approvalRequired ? 'request-target' : 'follow-target',
      },
      followerProfile: { id: 'owner', followingCount: approvalRequired ? 0 : 1 },
      followeeProfile: profile('target', {
        followPolicy,
        followersCount: approvalRequired ? 0 : 1,
        viewerState: {
          isSelf: false,
          follow: approvalRequired
            ? null
            : { id: 'follow-target', follower: { id: 'owner', followingCount: 1 } },
          followRequest: approvalRequired ? { id: 'request-target' } : null,
          profileBlock: null,
        },
      }),
    },
  };
}

function unfollowPayload() {
  return {
    unfollowProfile: {
      followerProfile: { id: 'owner', followingCount: 0 },
      followeeProfile: profile('target', {
        followPolicy: 'OPEN',
        followersCount: 0,
        viewerState: {
          isSelf: false,
          follow: null,
          followRequest: null,
          profileBlock: null,
        },
      }),
    },
  };
}

describe('첫 Profile 저장 태그 사람 찾기 Relay 흐름', () => {
  it('선택한 태그 목록만 렌더하고 완료된 목록은 Relay 캐시에서 다시 읽는다', async () => {
    await mount();
    await loadTags();

    assert.deepEqual(
      requests.map((request) => request.name),
      [queryName, tagQueryName],
    );
    assert.deepEqual(requests[1]?.variables, { hashtagId: firstTag.id });
    assert.equal(button('#Fediverse').props.accessibilityState.selected, true);
    assert.notEqual(button('#음악').props.disabled, true);

    // The initial selected-tag query is still suspended; another tag remains selectable.
    await press('#음악');
    assert.equal(button('#음악').props.accessibilityState.selected, true);
    assert.notEqual(button('#Fediverse').props.disabled, true);
    assert.deepEqual(requests.at(-1)?.variables, { hashtagId: secondTag.id });
    assert.equal(nodes('ProfileRow').length, 0);
    assert.equal(nodes('ProfileRow', false).length, 0, 'the previous tag subtree is unmounted');
    assert.notEqual(button('계속하기').props.disabled, true);

    await resolveTag(secondTag.id, tagResult(secondTag.id, [profile('second-target')]));
    assert.deepEqual(
      nodes('ProfileRow').map((row) => row.props.relativeHandle),
      ['@second-target'],
    );

    await resolveTag(firstTag.id, tagResult(firstTag.id, [profile('first-target')]));
    assert.deepEqual(
      nodes('ProfileRow').map((row) => row.props.relativeHandle),
      ['@second-target'],
      'a late result updates only the store while its tag is unselected',
    );

    await press('#Fediverse');
    assert.equal(requests.length, 3, 'the completed first list is read from Relay cache');
    assert.deepEqual(
      nodes('ProfileRow').map((row) => row.props.relativeHandle),
      ['@first-target'],
    );
    await press('계속하기');
    assert.equal(nodes('Home').length, 1);
  });

  it('저장 태그가 로딩 중이어도 계속할 수 있다', async () => {
    await mount();
    await press('계속하기');

    assert.equal(nodes('Home').length, 1);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.name, queryName);
  });

  it('완료된 저장 태그 null 응답은 인라인 재시도로 실제 네트워크 요청을 시작한다', async () => {
    await mount();
    await resolve(queryName, { node: null });
    assert.equal(nodes('StateView')[0]?.props.title, '저장한 태그를 확인할 수 없어요');

    await act(async () => nodes('StateView')[0]!.props.onAction());
    assert.equal(requests.length, 2, 'retry bypasses the cached null result');
    assert.deepEqual(requests.at(-1)?.variables, { profileId: 'owner' });

    await resolve(queryName, savedTags());
    assert.equal(requests.at(-1)?.name, tagQueryName);
  });

  it('완료된 관련 프로필 null 응답은 인라인 재시도로 실제 네트워크 요청을 시작한다', async () => {
    await mount();
    await loadTags();
    await resolveTag(firstTag.id, { node: null });
    assert.equal(nodes('StateView')[0]?.props.title, '이 태그의 관련 프로필을 확인할 수 없어요');
    assert.equal(requests.length, 2);

    await act(async () => nodes('StateView')[0]!.props.onAction());
    assert.equal(requests.length, 3, 'retry bypasses the cached null result');
    assert.deepEqual(requests.at(-1)?.variables, { hashtagId: firstTag.id });

    await resolveTag(firstTag.id, tagResult(firstTag.id, [profile('target')]));
    assert.deepEqual(
      nodes('ProfileRow').map((row) => row.props.relativeHandle),
      ['@target'],
    );
  });

  it('다음 페이지 오류 뒤 기존 행을 유지하고 같은 cursor로 재시도한다', async () => {
    await mount();
    await loadFirst([profile('target', { followPolicy: 'OPEN' })], true);
    assert.deepEqual(
      nodes('ProfileRow').map((row) => row.props.relativeHandle),
      ['@target'],
    );

    await act(async () => nodes('PaginationSurface')[0]!.props.onRetry());
    assert.equal(requests.at(-1)?.name, nextPageName);
    assert.notEqual(button('팔로우').props.disabled, true);
    assert.notEqual(button('계속하기').props.disabled, true);

    await reject(nextPageName);
    assert.equal(nodes('PaginationSurface')[0]?.props.error, true);
    assert.deepEqual(
      nodes('ProfileRow').map((row) => row.props.relativeHandle),
      ['@target'],
    );

    await act(async () => nodes('PaginationSurface')[0]!.props.onRetry());
    assert.deepEqual(requests.at(-1)?.variables, {
      count: 20,
      cursor: 'cursor-1',
      id: firstTag.id,
    });
    await resolve(
      nextPageName,
      tagResult(firstTag.id, [profile('next-target')], false, 'cursor-2'),
    );

    assert.deepEqual(
      nodes('ProfileRow').map((row) => row.props.relativeHandle),
      ['@target', '@next-target'],
    );
    assert.equal(nodes('PaginationSurface')[0]?.props.hasNext, false);
  });

  for (const followPolicy of ['OPEN', 'APPROVAL_REQUIRED'] as const) {
    const relationshipLabel = followPolicy === 'OPEN' ? '팔로잉' : '요청됨';
    const removeMutationName =
      followPolicy === 'OPEN'
        ? 'FollowButtonUnfollowProfileMutation'
        : 'FollowButtonCancelProfileFollowRequestMutation';

    it(
      relationshipLabel + ' 관계를 다른 태그에서도 공유하고 오류 뒤 낙관적 상태를 되돌린다',
      async () => {
        await mount();
        await loadFirst([profile('target', { followPolicy })]);

        await press('팔로우');
        assert.equal(button(relationshipLabel).props.accessibilityState.busy, true);
        assert.equal(button(relationshipLabel).props.disabled, true);
        await act(async () => button(relationshipLabel).props.onPress());
        assert.equal(
          requests.filter((request) => request.name === 'FollowButtonFollowProfileMutation').length,
          1,
        );

        await press('#음악');
        assert.equal(requests.at(-1)?.name, tagQueryName);
        await resolveTag(
          secondTag.id,
          tagResult(secondTag.id, [profile('target', { followPolicy })]),
        );
        assert.equal(button(relationshipLabel).props.accessibilityState.selected, true);

        await reject('FollowButtonFollowProfileMutation');
        assert.equal(button('팔로우').props.accessibilityState.selected, false);
        assert.equal(nodes('Toast')[0]?.props.message, '팔로우 상태를 변경하지 못했습니다.');

        await press('팔로우');
        await resolve('FollowButtonFollowProfileMutation', followPayload(followPolicy));
        assert.equal(button(relationshipLabel).props.accessibilityState.selected, true);

        const completedRequests = requests.length;
        await press('#Fediverse');
        assert.equal(
          requests.length,
          completedRequests,
          'the first tag uses its completed cache entry',
        );
        assert.equal(button(relationshipLabel).props.accessibilityState.selected, true);

        await press(relationshipLabel);
        assert.equal(requests.at(-1)?.name, removeMutationName);
        assert.equal(button('팔로우').props.disabled, true);
        if (followPolicy === 'OPEN') {
          await resolve(removeMutationName, unfollowPayload());
        } else {
          assert.deepEqual(requests.at(-1)?.variables, { id: 'request-target' });
          await resolve(removeMutationName, {
            cancelProfileFollowRequest: { profileFollowRequestId: 'request-target' },
          });
        }
        assert.equal(button('팔로우').props.accessibilityState.selected, false);

        const settledRequests = requests.length;
        await press('#음악');
        assert.equal(
          requests.length,
          settledRequests,
          'the second tag sees normalized relationship state',
        );
        assert.equal(button('팔로우').props.accessibilityState.selected, false);
      },
    );
  }

  it('태그가 없어도 완료 화면으로 이동하지 않고 기존 후속 화면을 렌더한다', async () => {
    await mount();
    await loadTags([]);

    assert.equal(nodes('NoTagsDestination').length, 1);
    assert.equal(nodes('Home').length, 0);
    assert.deepEqual(
      requests.map((request) => request.name),
      [queryName],
    );
  });
});
