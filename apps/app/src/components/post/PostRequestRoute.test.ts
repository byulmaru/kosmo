import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type RouteParams = { edit?: string; profileId?: string; requestId?: string };

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

const routeParams: RouteParams = {};
const session = { accountId: 'account-a', selectedProfileId: 'profile-b' as string | null };
const queryCalls: Array<{ name: string; options: object; variables: object }> = [];
const openComposer = mock.fn();
let renderer: ReactTestRenderer | null = null;
let PostRequestsScreen: ComponentType;

mockModule('expo-router', {
  useLocalSearchParams: () => routeParams,
});
mockModule('react-native', {
  StyleSheet: { create: <T>(styles: T) => styles },
  View: 'View',
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => ({
    name: parts.join('').match(/query\s+(\w+)/)?.[1] ?? 'unknown',
  }),
  useLazyLoadQuery: (query: { name: string }, variables: object, options: object) => {
    queryCalls.push({ name: query.name, options, variables });
    throw new Error(`Unexpected route query: ${query.name}`);
  },
});
mockModule('@/components/PageHeader', {
  PageHeader: (props: object) => createElement('PageHeader', props),
});
mockModule('@/components/RouteBoundary', {
  RouteBoundary: ({ children }: { children?: ReactNode }) => children,
  useRouteBoundary: () => ({ fetchKey: '0' }),
});
mockModule('@/components/post/PostRequestList', {
  PostRequestList: ({ header, ...props }: { header?: ReactNode; [key: string]: unknown }) =>
    createElement('PostRequestList', props, header),
});
mockModule('@/components/shell/ShellChromeContext', {
  useShellChrome: () => ({ openComposer }),
});
mockModule('@/components/ui/StateView', {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule('@/session/SessionProvider', { useSession: () => session });

before(async () => {
  ({ default: PostRequestsScreen } = await import('../../app/(tabs)/(protected)/post-requests'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  routeParams.edit = undefined;
  routeParams.profileId = undefined;
  routeParams.requestId = undefined;
  session.selectedProfileId = 'profile-b';
  queryCalls.length = 0;
  openComposer.mock.resetCalls();
});

async function renderScreen() {
  await act(async () => {
    renderer = create(createElement(PostRequestsScreen));
  });
  assert.ok(renderer);
}

function findByType(type: string) {
  assert.ok(renderer);
  const matches = renderer.root.findAll((node) => node.type === type);
  assert.equal(matches.length, 1, `Expected one ${type}`);
  const match = matches[0];
  assert.ok(match);
  return match;
}

function list() {
  return findByType('PostRequestList');
}

describe('post request route', () => {
  it('preserves legacy edit links as focused list routes and the shell composer action', async () => {
    routeParams.edit = '1';
    routeParams.profileId = 'profile-a';
    routeParams.requestId = 'request-a';

    await renderScreen();

    assert.deepEqual(queryCalls, []);
    assert.equal(session.selectedProfileId, 'profile-b');
    assert.equal(list().props.profileId, 'profile-a');
    assert.equal(list().props.focusedRequestId, 'request-a');
    assert.equal(Object.hasOwn(list().props, 'focusedRequest'), false);
    assert.equal(list().props.onCompose, openComposer);

    await act(async () => list().props.onCompose());
    assert.deepEqual(openComposer.mock.calls[0]?.arguments, []);
    assert.equal(session.selectedProfileId, 'profile-b');
  });

  it('passes the focused request id to the profile list without a detail query', async () => {
    routeParams.requestId = 'request-a';

    await renderScreen();

    assert.deepEqual(queryCalls, []);
    assert.equal(list().props.profileId, 'profile-b');
    assert.equal(list().props.focusedRequestId, 'request-a');
  });

  it('renders the ordinary profile list without a route-owned query', async () => {
    routeParams.profileId = 'profile-a';

    await renderScreen();

    assert.equal(queryCalls.length, 0);
    assert.equal(list().props.profileId, 'profile-a');
    assert.equal(list().props.focusedRequestId, undefined);
  });
});
