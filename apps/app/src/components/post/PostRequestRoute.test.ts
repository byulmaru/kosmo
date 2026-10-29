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
  me: Readonly<{ id: string; postRequest?: RequestData | null }> | null;
}>;
type NavigationEvent = Readonly<{ method: 'push' | 'setParams'; value: unknown }>;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

const routeParams: RouteParams = {};
const routeData: { current: RouteData } = { current: { me: { id: 'account-a' } } };
const session = { accountId: 'account-a', selectedProfileId: 'profile-b' as string | null };
const queryCalls: Array<{ name: string; options: object; variables: object }> = [];
const navigationEvents: NavigationEvent[] = [];
const router = {
  push: (value: unknown) => navigationEvents.push({ method: 'push', value }),
  setParams: (value: unknown) => navigationEvents.push({ method: 'setParams', value }),
};
let renderer: ReactTestRenderer | null = null;
let PostRequestsScreen: ComponentType;

mockModule('expo-router', {
  useLocalSearchParams: () => routeParams,
  useRouter: () => router,
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
mockModule('@/components/post/PostRequestComposer', {
  PostRequestComposer: ({ onBack, request }: { onBack: () => void; request: RequestData }) =>
    createElement('PostRequestComposer', { onBack, requestId: request.requestId }),
});
mockModule('@/components/post/PostRequestList', {
  PostRequestList: ({ header, ...props }: { header?: ReactNode; [key: string]: unknown }) =>
    createElement('PostRequestList', props, header),
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
  routeData.current = { me: { id: 'account-a' } };
  session.selectedProfileId = 'profile-b';
  queryCalls.length = 0;
  navigationEvents.length = 0;
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

function list() {
  assert.ok(renderer);
  return renderer.root.findByType('PostRequestList');
}

describe('post request route', () => {
  it('uses an explicit profile deep link without changing the selected actor and opens rewrite inline', async () => {
    routeParams.edit = '1';
    routeParams.profileId = 'profile-a';
    routeParams.requestId = 'request-a';
    routeData.current = { me: { id: 'account-a', postRequest: request() } };

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
    assert.equal(list().props.focusedRequest, null);
    assert.equal(renderer?.root.findByType('PostRequestComposer').props.requestId, 'request-a');

    await act(async () => list().props.onRewrite('request-b'));
    await act(async () => renderer?.root.findByType('PostRequestComposer').props.onBack());
    assert.deepEqual(navigationEvents, [
      {
        method: 'setParams',
        value: { edit: '1', profileId: 'profile-a', requestId: 'request-b' },
      },
      { method: 'setParams', value: { edit: undefined, requestId: undefined } },
    ]);
  });

  it('focuses the requested card for ordinary detail viewing and defaults the profile from the session', async () => {
    routeParams.requestId = 'request-a';
    routeData.current = { me: { id: 'account-a', postRequest: request('PROCESSING') } };

    await renderScreen();

    assert.deepEqual(queryCalls[0], {
      name: 'PostRequestListDetailPageQuery',
      options: { fetchKey: '0' },
      variables: { profileId: 'profile-b', requestId: 'request-a' },
    });
    assert.equal(list().props.profileId, 'profile-b');
    assert.equal(list().props.focusedRequestId, 'request-a');
    assert.equal(list().props.focusedRequest.requestId, 'request-a');
    assert.equal(renderer?.root.findAllByType('PostRequestComposer').length, 0);
  });

  it('loads the full history when no request is focused', async () => {
    routeParams.profileId = 'profile-a';
    routeData.current = { me: { id: 'account-a' } };

    await renderScreen();

    assert.deepEqual(queryCalls[0], {
      name: 'PostRequestListPageQuery',
      options: { fetchKey: '0' },
      variables: { profileId: 'profile-a' },
    });
    assert.equal(list().props.profileId, 'profile-a');
    assert.equal(list().props.focusedRequestId, undefined);
  });
});
