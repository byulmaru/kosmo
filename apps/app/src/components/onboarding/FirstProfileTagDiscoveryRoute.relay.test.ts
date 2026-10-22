import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement, useState } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import type { ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { FirstProfileTagDiscoveryRoute as RouteExport } from './FirstProfileTagDiscoveryRoute';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const mockModule = (specifier: string, exports: object) =>
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
  Platform: { OS: 'web' },
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('@/components/ui/Button', { Button: 'Button' });
mockModule('@/components/ui/StateView', { StateView: 'StateView' });
mockModule('@/components/ui/useSafeAreaPadding', { useSafeAreaPadding: () => ({}) });
mockModule('@/components/pagination/PaginationSurface', { PaginationSurface: 'PaginationSurface' });
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
const toasts: string[] = [];
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({ showToast: (message: string) => toasts.push(message) }),
});

type Request = {
  name: string;
  variables: Record<string, unknown>;
  sink: { next(value: GraphQLResponse): void; complete(): void; error(error: Error): void };
};
const requests: Request[] = [];
const pending: Request[] = [];
let renderer: ReactTestRenderer | null = null;
let Route: typeof RouteExport;
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
    : createElement(Route, { profileId, empty, onContinue: () => setContinued(true) });
}
async function mount(env = environment(), profileId = 'owner') {
  await act(async () => {
    renderer = create(
      createElement(ReactRelay.RelayEnvironmentProvider, {
        environment: env,
        children: createElement(App, { profileId, empty: createElement('NoTagsDestination') }),
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
    (node) => String(node.type) === type && (!visible || isVisible(node)),
  );
}
function button(label: string) {
  const match = nodes('Button').find(
    (node) => node.props.accessibilityLabel === label || node.props.children === label,
  );
  assert.ok(match, `missing button ${label}`);
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
  toasts.length = 0;
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
    await resolve(tagQueryName, tagResult(firstTag.id, [profile('target'), profile('owner')]));
    assert.deepEqual(
      nodes('ProfileRow').map((row) => row.props.relativeHandle),
      ['@target', '@owner'],
    );
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
    assert.equal(button('#음악').props.accessibilityState.selected, true);
    assert.equal(nodes('ProfileRow').length, 0);
    assert.equal(nodes('ProfileRow', false)[0], firstRow);
    await press('#Fediverse');
    assert.equal(nodes('ProfileRow')[0], firstRow);
    assert.equal(requests.length, 3);
    await press('#음악');
    await act(async () => nodes('StateView')[0]!.props.onAction());
    assert.deepEqual(requests.at(-1)?.variables, { hashtagId: secondTag.id });
    await resolve(tagQueryName, tagResult(secondTag.id, [profile('second-target')]));
    assert.deepEqual(
      nodes('ProfileRow').map((row) => row.props.relativeHandle),
      ['@second-target'],
    );
    assert.equal(requests.filter((request) => request.name === queryName).length, 1);
    await press('#Fediverse');
    assert.equal(nodes('ProfileRow')[0], firstRow);
    assert.equal(requests.length, 4);
  });

  it('추가 페이지 실패는 기존 목록을 유지하고 같은 cursor로 재시도해 누적한다', async () => {
    await mount();
    await loadFirst([profile('target')], true);
    await act(async () => nodes('PaginationSurface')[0]!.props.onRetry());
    assert.deepEqual(requests.at(-1)?.variables, {
      count: 20,
      cursor: 'cursor-1',
      id: firstTag.id,
    });
    await reject(nextPageName);
    assert.equal(nodes('PaginationSurface')[0]?.props.error, true);
    assert.deepEqual(
      nodes('ProfileRow').map((row) => row.props.relativeHandle),
      ['@target'],
    );
    await press('#음악');
    await resolve(tagQueryName, tagResult(secondTag.id, []));
    await press('#Fediverse');
    assert.equal(nodes('PaginationSurface')[0]?.props.error, true);
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
  });

  it('중복 대상의 pending을 태그 전환에도 공유하고 실패 후 재시도는 요청됨으로 수렴한다', async () => {
    const env = await mount();
    await loadFirst();
    await press('#음악');
    await resolve(tagQueryName, tagResult(secondTag.id));
    await press('#Fediverse');
    await press('팔로우');
    assert.equal(button('요청됨').props.accessibilityState.busy, true);
    assert.equal(button('요청됨').props.disabled, true);
    await press('#음악');
    assert.equal(button('요청됨').props.accessibilityState.busy, true);
    assert.equal(button('요청됨').props.disabled, true);
    assert.equal(requests.filter((request) => request.name.includes('Mutation')).length, 1);
    await reject('FollowButtonFollowProfileMutation');
    assert.equal(button('팔로우').props.accessibilityState.busy, false);
    assert.equal(button('팔로우').props.disabled, false);
    assert.equal(toasts.length, 1);
    const target = env.getStore().getSource().get('target');
    assert.ok(target);
    const viewer = env
      .getStore()
      .getSource()
      .get((target.viewerState as { __ref: string }).__ref);
    assert.equal(viewer?.followRequest, null);
    await press('팔로우');
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
});
