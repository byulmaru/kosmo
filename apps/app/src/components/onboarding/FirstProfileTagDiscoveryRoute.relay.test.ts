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
function take(name: string) {
  const index = pending.findIndex((request) => request.name === name);
  assert.notEqual(
    index,
    -1,
    `missing ${name}; pending ${pending.map((request) => request.name).join(', ')}`,
  );
  return pending.splice(index, 1)[0]!;
}
async function resolve(name: string, data: object | null, errors?: readonly object[]) {
  const request = take(name);
  await act(async () => {
    request.sink.next({ data, ...(errors ? { errors } : {}) } as GraphQLResponse);
    request.sink.complete();
  });
  return request;
}
async function reject(name: string) {
  const request = take(name);
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
  await resolve(tagQueryName, tagResult(firstTag.id, profiles, hasNext));
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

describe('첫 Profile 저장 태그 사람 찾기 Relay 흐름', () => {
  it('저장된 canonical identity만 조회하고 방문하지 않은 태그를 미리 요청하지 않는다', async () => {
    await mount();
    assert.deepEqual(
      requests.map((request) => request.variables),
      [{ profileId: 'owner' }],
    );
    await loadTags();
    assert.deepEqual(
      requests.map((request) => request.name),
      [queryName, tagQueryName],
    );
    assert.deepEqual(requests[1]?.variables, { hashtagId: firstTag.id });
    assert.equal(button('#Fediverse').props.accessibilityState.selected, true);
    assert.equal(button('#음악').props.accessibilityState.selected, false);
    assert.equal(button('#Fediverse').props.disabled, true);
    assert.equal(button('#음악').props.disabled, true);
    assert.notEqual(button('계속하기').props.disabled, true);
    await press('#음악');
    assert.equal(requests.length, 2, 'initial loading prevents a second tag query');
    assert.equal(button('#Fediverse').props.accessibilityState.selected, true);
    await resolve(tagQueryName, tagResult(firstTag.id, [profile('target'), profile('owner')]));
    assert.deepEqual(
      nodes('ProfileRow').map((row) => row.props.relativeHandle),
      ['@target', '@owner'],
    );
    assert.equal(button('#음악').props.disabled, false);
    assert.equal(nodes('ProfileRow')[0]?.props.href, '/@target');
    assert.equal(nodes('ProfileRow')[0]?.props.bio, 'target 소개');
    assert.equal(nodes('Button').filter((node) => node.props.children === '팔로우').length, 1);
    await press('#음악');
    assert.deepEqual(requests.at(-1)?.variables, { hashtagId: secondTag.id });
    assert.equal(
      nodes('ProfileRow').length,
      0,
      'the old list is hidden while the selected tag loads',
    );
    assert.equal(nodes('ProfileRow', false).length, 2, 'visited lists remain mounted');
    await press('#Fediverse');
    assert.equal(button('#음악').props.accessibilityState.selected, true);
    assert.equal(requests.length, 3, 'loading prevents returning to the previous list');
    await resolve(tagQueryName, tagResult(secondTag.id, []));
    assert.equal(button('#음악').props.accessibilityState.selected, true);
    await press('계속하기');
    assert.equal(nodes('Home').length, 1);
    assert.equal(
      requests.some((request) => request.name.includes('Mutation')),
      false,
    );
  });

  it('성공한 빈 태그는 선언적인 후속 화면을 렌더하고 관련 목록을 조회하지 않는다', async () => {
    await mount();
    await loadTags([]);
    assert.equal(nodes('NoTagsDestination').length, 1);
    assert.equal(nodes('Home').length, 0);
    assert.deepEqual(
      requests.map((request) => request.name),
      [queryName],
    );
  });

  it('태그 조회 실패는 빈 목록으로 바꾸지 않고 재시도 뒤에도 진행할 수 있다', async () => {
    await mount();
    await reject(queryName);
    assert.equal(nodes('NoTagsDestination').length, 0);
    assert.equal(nodes('StateView')[0]?.props.alert, true);
    await act(async () => nodes('StateView')[0]!.props.onAction());
    assert.equal(requests.length, 2);
    await resolve(queryName, { node: null });
    assert.equal(nodes('NoTagsDestination').length, 0);
    await act(async () => nodes('StateView')[0]!.props.onAction());
    assert.equal(requests.length, 3, 'a retry also refreshes an unavailable cached node');
    await reject(queryName);
    await press('계속하기');
    assert.equal(nodes('Home').length, 1);
    assert.equal(
      requests.some((request) => request.name.includes('Mutation')),
      false,
    );
  });

  it('저장 태그가 로딩 중이어도 팔로우 없이 계속할 수 있다', async () => {
    await mount();
    await press('계속하기');
    assert.equal(nodes('Home').length, 1);
    assert.equal(requests.length, 1);
  });

  it('다른 태그 초기 실패와 재시도 중 선택과 이미 본 목록을 유지한다', async () => {
    await mount();
    await loadFirst();
    const firstRow = nodes('ProfileRow')[0];
    await press('#음악');
    await reject(tagQueryName);
    assert.equal(button('#음악').props.disabled, false);
    assert.equal(button('#Fediverse').props.disabled, false);
    assert.equal(button('#음악').props.accessibilityState.selected, true);
    assert.equal(nodes('ProfileRow').length, 0);
    assert.equal(nodes('ProfileRow', false)[0], firstRow);
    await press('#Fediverse');
    assert.equal(nodes('ProfileRow')[0], firstRow);
    assert.equal(requests.length, 3);
    await press('#음악');
    await act(async () => nodes('StateView')[0]!.props.onAction());
    assert.deepEqual(requests.at(-1)?.variables, { hashtagId: secondTag.id });
    assert.equal(button('#Fediverse').props.disabled, true);
    await press('#Fediverse');
    assert.equal(button('#음악').props.accessibilityState.selected, true);
    assert.equal(requests.length, 4);
    await resolve(tagQueryName, { node: null });
    assert.equal(button('#Fediverse').props.disabled, false);
    assert.equal(nodes('ProfileRow', false)[0], firstRow);
    await act(async () => nodes('StateView')[0]!.props.onAction());
    assert.equal(button('#Fediverse').props.disabled, true);
    assert.equal(button('#음악').props.disabled, true);
    await press('#Fediverse');
    assert.equal(button('#음악').props.accessibilityState.selected, true);
    assert.equal(requests.length, 5, 'an unavailable-node retry still prevents tag switching');
    await resolve(tagQueryName, tagResult(secondTag.id, [profile('second-target')]));
    assert.deepEqual(
      nodes('ProfileRow').map((row) => row.props.relativeHandle),
      ['@second-target'],
    );
    assert.equal(requests.filter((request) => request.name === queryName).length, 1);
    await press('#Fediverse');
    assert.equal(nodes('ProfileRow')[0], firstRow);
    assert.equal(requests.length, 5);
  });

  it('추가 페이지 조회는 태그 전환과 팔로우를 막고 실패 뒤 같은 cursor로 재시도한다', async () => {
    await mount();
    await loadFirst([profile('target')], true);
    const firstRow = nodes('ProfileRow')[0];
    await act(async () => nodes('PaginationSurface')[0]!.props.onRetry());
    assert.equal(nodes('ProfileRow')[0], firstRow);
    assert.equal(button('#음악').props.disabled, true);
    assert.equal(button('팔로우').props.disabled, true);
    assert.equal(button('팔로우').props.accessibilityState.busy, false);
    assert.notEqual(button('계속하기').props.disabled, true);
    await press('#음악');
    await press('팔로우');
    await act(async () => nodes('PaginationSurface')[0]!.props.onRetry());
    assert.equal(requests.length, 3, 'pagination excludes another query or relationship action');
    assert.equal(button('#Fediverse').props.accessibilityState.selected, true);
    assert.deepEqual(requests.at(-1)?.variables, {
      count: 20,
      cursor: 'cursor-1',
      id: firstTag.id,
    });
    await reject(nextPageName);
    assert.equal(button('#음악').props.disabled, false);
    assert.equal(button('팔로우').props.disabled, false);
    assert.equal(nodes('PaginationSurface')[0]?.props.error, true);
    assert.deepEqual(
      nodes('ProfileRow').map((row) => row.props.relativeHandle),
      ['@target'],
    );
    assert.equal(nodes('Toast')[0]?.props.action.label, '다시 시도');
    await press('#음악');
    assert.equal(nodes('Toast').length, 0, 'the hidden panel does not retain an active retry');
    await resolve(tagQueryName, tagResult(secondTag.id, []));
    await press('#Fediverse');
    assert.equal(nodes('PaginationSurface')[0]?.props.error, true);
    assert.equal(nodes('Toast')[0]?.props.action.label, '다시 시도');
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
    assert.equal(nodes('PaginationSurface')[0]?.props.error, false);
    assert.equal(nodes('PaginationSurface')[0]?.props.hasNext, false);
    assert.equal(button('#음악').props.disabled, false);
    assert.equal(button('팔로우').props.disabled, false);
  });

  it('팔로우 중 태그 전환과 조회를 막고 실패 뒤 재시도한 관계를 다른 태그에도 공유한다', async () => {
    const env = await mount();
    await loadFirst([profile('target')], true);
    await press('#음악');
    await resolve(tagQueryName, tagResult(secondTag.id, [profile('target')], true));
    await press('#Fediverse');
    const retryFirstPage = nodes('PaginationSurface')[0]!.props.onRetry;
    await press('팔로우');
    assert.equal(button('요청됨').props.accessibilityState.busy, true);
    assert.equal(button('요청됨').props.disabled, true);
    assert.equal(button('#음악').props.disabled, true);
    assert.notEqual(button('계속하기').props.disabled, true);
    await press('#음악');
    await act(async () => {
      nodes('ScrollView')
        .find((node) => typeof node.props.onScroll === 'function')!
        .props.onScroll({
          nativeEvent: {
            contentOffset: { y: 500 },
            contentSize: { height: 1_000 },
            layoutMeasurement: { height: 500 },
          },
        });
      retryFirstPage();
    });
    assert.equal(nodes('PaginationSurface')[0]!.props.onRetry, undefined);
    assert.equal(button('#Fediverse').props.accessibilityState.selected, true);
    assert.equal(requests.length, 4, 'a follow excludes pagination and changing the selected tag');
    assert.equal(button('요청됨').props.accessibilityState.busy, true);
    assert.equal(button('요청됨').props.disabled, true);
    assert.equal(requests.filter((request) => request.name.includes('Mutation')).length, 1);
    await reject('FollowButtonFollowProfileMutation');
    assert.equal(button('팔로우').props.accessibilityState.busy, false);
    assert.equal(button('팔로우').props.disabled, false);
    assert.equal(button('#음악').props.disabled, false);
    assert.equal(nodes('Toast')[0]?.props.message, '팔로우 상태를 변경하지 못했습니다.');
    const target = env.getStore().getSource().get('target');
    assert.ok(target);
    const viewer = env
      .getStore()
      .getSource()
      .get((target.viewerState as { __ref: string }).__ref);
    assert.equal(viewer?.followRequest, null);
    await press('#음악');
    assert.equal(button('#음악').props.accessibilityState.selected, true);
    const retrySecondPage = nodes('PaginationSurface')[0]!.props.onRetry;
    await press('팔로우');
    await act(async () => retrySecondPage());
    assert.equal(requests.length, 5, 'retrying a follow keeps pagination serialized');
    await resolve('FollowButtonFollowProfileMutation', {
      followProfile: {
        result: { __typename: 'ProfileFollowRequest', id: 'request-target' },
        followerProfile: { id: 'owner', followingCount: 0 },
        followeeProfile: profile('target', {
          viewerState: {
            isSelf: false,
            follow: null,
            followRequest: { id: 'request-target' },
            profileBlock: null,
          },
        }),
      },
    });
    assert.equal(button('요청됨').props.accessibilityState.busy, false);
    assert.equal(button('요청됨').props.disabled, false);
    assert.equal(button('#Fediverse').props.disabled, false);
    await press('#Fediverse');
    assert.equal(button('요청됨').props.accessibilityState.busy, false);
    assert.equal(button('요청됨').props.disabled, false);
    const updatedViewer = env
      .getStore()
      .getSource()
      .get((target.viewerState as { __ref: string }).__ref);
    assert.deepEqual(updatedViewer?.followRequest, { __ref: 'request-target' });
    assert.equal(updatedViewer?.follow, null, 'pending approval does not establish a Follow');
  });

  for (const followPolicy of ['OPEN', 'APPROVAL_REQUIRED'] as const) {
    const relationshipLabel = followPolicy === 'OPEN' ? '팔로잉' : '요청됨';
    const mutationName =
      followPolicy === 'OPEN'
        ? 'FollowButtonUnfollowProfileMutation'
        : 'FollowButtonCancelProfileFollowRequestMutation';
    it(`${relationshipLabel} 해제 중 태그 전환과 페이지 재시도를 막고 성공·실패 뒤 다시 허용한다`, async () => {
      await mount();
      await loadFirst(
        [
          profile('target', {
            followPolicy,
            viewerState: {
              isSelf: false,
              follow:
                followPolicy === 'OPEN'
                  ? { id: 'follow-target', follower: { id: 'owner', followingCount: 1 } }
                  : null,
              followRequest: followPolicy === 'APPROVAL_REQUIRED' ? { id: 'request-target' } : null,
              profileBlock: null,
            },
          }),
        ],
        true,
      );
      await act(async () => nodes('PaginationSurface')[0]!.props.onRetry());
      await reject(nextPageName);
      assert.equal(nodes('PaginationSurface')[0]?.props.error, true);
      const retryToastAction = nodes('Toast')[0]!.props.action.onPress;
      assert.equal(nodes('Toast')[0]?.props.action.label, '다시 시도');
      await press(relationshipLabel);
      assert.equal(nodes('Toast').length, 0, 'a pending mutation removes the page retry toast');
      assert.equal(nodes('PaginationSurface')[0]?.props.onRetry, undefined);
      assert.equal(button('#음악').props.disabled, true);
      assert.equal(button('팔로우').props.accessibilityState.busy, true);
      await press('#음악');
      await act(async () => retryToastAction());
      assert.equal(
        requests.length,
        4,
        'retrying a failed page cannot overlap relationship removal',
      );
      assert.equal(button('#Fediverse').props.accessibilityState.selected, true);
      assert.equal(nodes('PaginationSurface')[0]?.props.error, true);
      await reject(mutationName);
      assert.equal(button(relationshipLabel).props.disabled, false);
      assert.equal(button('#음악').props.disabled, false);
      assert.equal(nodes('Toast')[0]?.props.message, '팔로우 상태를 변경하지 못했습니다.');
      await act(async () => mock.timers.tick(2999));
      assert.equal(nodes('Toast')[0]?.props.message, '팔로우 상태를 변경하지 못했습니다.');
      await act(async () => mock.timers.tick(1));
      assert.equal(
        nodes('Toast')[0]?.props.action.label,
        '다시 시도',
        'the page retry returns after the mutation failure has been shown',
      );
      await press(relationshipLabel);
      assert.equal(nodes('Toast').length, 0);
      await resolve(
        mutationName,
        followPolicy === 'OPEN'
          ? {
              unfollowProfile: {
                followerProfile: { id: 'owner', followingCount: 0 },
                followeeProfile: profile('target', { followPolicy }),
              },
            }
          : { cancelProfileFollowRequest: { profileFollowRequestId: 'request-target' } },
      );
      assert.equal(button('팔로우').props.disabled, false);
      assert.equal(button('#음악').props.disabled, false);
      assert.equal(nodes('Toast')[0]?.props.action.label, '다시 시도');
      await act(async () => nodes('Toast')[0]!.props.action.onPress());
      assert.equal(nodes('Toast').length, 0, 'the real toast action dismisses before retrying');
      assert.equal(
        requests.length,
        6,
        'the failed page is available again after mutation settlement',
      );
      assert.deepEqual(requests.at(-1)?.variables, {
        count: 20,
        cursor: 'cursor-1',
        id: firstTag.id,
      });
      await resolve(nextPageName, tagResult(firstTag.id, [profile('next')], false, 'cursor-2'));
      assert.deepEqual(
        nodes('ProfileRow').map((row) => row.props.relativeHandle),
        ['@target', '@next'],
      );
      await press('#음악');
      assert.deepEqual(requests.at(-1)?.variables, { hashtagId: secondTag.id });
    });
  }

  it('관련 목록 초기 로딩 중에도 계속할 수 있다', async () => {
    await mount();
    await loadTags();
    assert.equal(button('#음악').props.disabled, true);
    await press('계속하기');
    assert.equal(nodes('Home').length, 1);
    assert.equal(requests.length, 2);
  });

  it('페이지 조회 중에도 계속할 수 있다', async () => {
    await mount();
    await loadFirst([profile('target')], true);
    await act(async () => nodes('PaginationSurface')[0]!.props.onRetry());
    assert.equal(button('팔로우').props.disabled, true);
    await press('계속하기');
    assert.equal(nodes('Home').length, 1);
    assert.equal(requests.length, 3);
  });

  it('팔로우 응답을 기다리는 중에도 계속할 수 있다', async () => {
    const env = await mount();
    await loadFirst();
    await press('팔로우');
    assert.equal(button('#음악').props.disabled, true);
    await press('계속하기');
    assert.equal(nodes('Home').length, 1);
    await reject('FollowButtonFollowProfileMutation');
    assert.equal(nodes('Home').length, 1);
    const target = env.getStore().getSource().get('target');
    const viewer = env
      .getStore()
      .getSource()
      .get((target?.viewerState as { __ref: string }).__ref);
    assert.equal(viewer?.followRequest, null);
  });
});
