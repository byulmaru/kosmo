import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type RouteParams = { edit?: string; profileId?: string; requestId?: string };
type RequestData = Readonly<{
  authorProfile: Readonly<{ id: string }>;
  id: string;
  requestId: string;
  status: string;
}>;
type RouteData = Readonly<{
  postRequest: RequestData | null;
}>;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

const routeParams: RouteParams = {};
const routeData: { current: RouteData } = { current: { postRequest: null } };
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
    return routeData.current;
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
  routeData.current = { postRequest: null };
  session.selectedProfileId = 'profile-b';
  queryCalls.length = 0;
  openComposer.mock.resetCalls();
});

function request(status = 'FAILED'): RequestData {
  return {
    authorProfile: { id: 'profile-a' },
    id: 'request-node-a',
    requestId: 'request-a',
    status,
  };
}

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
  it('treats legacy edit links as request details and calls the shell composer unchanged', async () => {
    routeParams.edit = '1';
    routeParams.profileId = 'profile-a';
    routeParams.requestId = 'request-a';
    routeData.current = { postRequest: request() };

    await renderScreen();

    assert.deepEqual(queryCalls, [
      {
        name: 'PostRequestListDetailPageQuery',
        options: { fetchKey: '0' },
        variables: { profileId: 'profile-a', requestId: 'request-a' },
      },
    ]);
    assert.equal(session.selectedProfileId, 'profile-b');
    assert.equal(list().props.profileId, 'profile-a');
    assert.equal(list().props.focusedRequestId, 'request-a');
    assert.equal(list().props.focusedRequest, routeData.current.postRequest);
    assert.equal(list().props.onCompose, openComposer);

    await act(async () => list().props.onCompose());
    assert.deepEqual(openComposer.mock.calls[0]?.arguments, []);
    assert.equal(session.selectedProfileId, 'profile-b');
  });

  it('focuses the requested card for ordinary detail viewing and defaults the profile from the session', async () => {
    routeParams.requestId = 'request-a';
    routeData.current = { postRequest: request('PROCESSING') };

    await renderScreen();

    assert.deepEqual(queryCalls[0], {
      name: 'PostRequestListDetailPageQuery',
      options: { fetchKey: '0' },
      variables: { profileId: 'profile-b', requestId: 'request-a' },
    });
    assert.equal(list().props.profileId, 'profile-b');
    assert.equal(list().props.focusedRequestId, 'request-a');
    assert.equal(list().props.focusedRequest.requestId, 'request-a');
  });

  it('renders the full-history list without a route-owned list query', async () => {
    routeParams.profileId = 'profile-a';
    routeData.current = { postRequest: null };

    await renderScreen();

    assert.equal(queryCalls.length, 0);
    assert.equal(list().props.profileId, 'profile-a');
    assert.equal(list().props.focusedRequestId, undefined);
  });
});
