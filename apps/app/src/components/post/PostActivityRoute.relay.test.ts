import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import * as Relay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
const query =
  require('../../app/(tabs)/(post)/[profileHandle]/[postId]/__generated__/PostActivityRouteQuery.graphql').default;

const stub = (path: string | URL, exports: object) =>
  mock.module(path, { exports } as unknown as Parameters<typeof mock.module>[1]);

let params: { postId?: string | string[]; profileHandle?: string | string[] } = {
  postId: 'post-activity',
  profileHandle: '@writer',
};
let canGoBack = true;
let backCount = 0;
const replacements: string[] = [];
let renderer: ReactTestRenderer | null = null;
let Route: ComponentType;

stub('expo-router', {
  Redirect: ({ href }: { href: string }) => createElement('Redirect', { href }),
  useLocalSearchParams: () => params,
  useRouter: () => ({
    back: () => backCount++,
    canGoBack: () => canGoBack,
    replace: (href: string) => replacements.push(href),
  }),
});
stub('react-relay', {
  ...Relay,
  graphql: (parts: TemplateStringsArray) =>
    parts.join('').includes('query PostActivityRouteQuery') ? query : {},
});
stub('react-native', {
  AccessibilityInfo: { sendAccessibilityEvent: () => undefined },
  Platform: { OS: 'web' },
  StyleSheet: { create: <T>(styles: T) => styles },
  Touchable: { Mixin: {} },
  View: 'View',
});
stub('lucide-react-native', { ChevronLeftIcon: 'ChevronLeftIcon' });
stub(require.resolve('lucide-react-native'), { ChevronLeftIcon: 'ChevronLeftIcon' });
stub('@/components/PageHeader', {
  PageHeader: ({ leading, ...props }: { leading?: ReactNode; [key: string]: unknown }) =>
    createElement('PageHeader', props, leading),
});
stub('@/components/pagination/PaginationScrollView', {
  PaginationScrollView: ({ children }: { children?: ReactNode }) =>
    createElement('PaginationScrollView', null, children),
});
stub('@/components/post/PostRepostProfileList', {
  PostRepostProfileList: (props: object) => createElement('PostRepostProfileList', props),
});
stub('@/components/ui/IconButton', {
  IconButton: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement('button', props, children),
});
stub('@/components/ui/StateView', {
  StateView: (props: object) => createElement('StateView', props),
});
stub('@/components/RouteBoundary', {
  RouteBoundary: ({ children }: { children?: ReactNode }) => children,
  useRouteBoundary: () => ({ fetchKey: 'route-key', fetchPolicy: 'store-or-network' }),
});
stub('@/theme/ThemeProvider', { useTheme: () => ({ foregroundPrimary: '#111' }) });
stub('@/theme/tokens', { spacing: { sm: 8 } });

before(async () => {
  Route = (await import('../../app/(tabs)/(post)/[profileHandle]/[postId]/activity')).default;
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  params = { postId: 'post-activity', profileHandle: '@writer' };
  canGoBack = true;
  backCount = 0;
  replacements.length = 0;
});

function payload(profileHandle = '@writer') {
  return {
    node: {
      __typename: 'Post',
      content: { id: 'content-activity' },
      id: 'post-activity',
      profile: { id: 'profile-writer', relativeHandle: profileHandle },
      repostProfiles: {
        edges: [],
        pageInfo: {
          endCursor: null,
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
        },
      },
      state: 'ACTIVE',
    },
  };
}

function renderWithNetwork(response = payload()) {
  let requests = 0;
  const environment = new Environment({
    network: Network.create(() => {
      requests += 1;
      return Observable.from(Promise.resolve({ data: response }));
    }),
    store: new Store(new RecordSource()),
  });

  return {
    environment,
    get requests() {
      return requests;
    },
  };
}

test('missing or repeated route params render unavailable state without a GraphQL request', async () => {
  params = { postId: ['post-activity', 'unexpected'], profileHandle: '@writer' };
  const network = renderWithNetwork();
  await act(async () => {
    renderer = create(
      createElement(Relay.RelayEnvironmentProvider, {
        environment: network.environment,
        children: createElement(Route),
      }),
    );
  });

  assert.equal(network.requests, 0);
  assert.equal(
    renderer!.root.findAll((node) => String(node.type) === 'StateView')[0]?.props.title,
    '재게시한 사람을 볼 수 없어요',
  );
});

test('history-less Back falls back to the authoritative post detail URL', async () => {
  canGoBack = false;
  const network = renderWithNetwork();
  await act(async () => {
    renderer = create(
      createElement(Relay.RelayEnvironmentProvider, {
        environment: network.environment,
        children: createElement(Route),
      }),
    );
    await new Promise((resolve) => setImmediate(resolve));
  });

  const back = renderer!.root.findByType('button');
  await act(async () => back.props.onPress());
  assert.deepEqual(replacements, ['/@writer/post-activity']);
  assert.equal(backCount, 0);
});

test('canonical handle mismatch redirects while keeping the post ID lookup', async () => {
  const network = renderWithNetwork(payload('@canonical'));
  await act(async () => {
    renderer = create(
      createElement(Relay.RelayEnvironmentProvider, {
        environment: network.environment,
        children: createElement(Route),
      }),
    );
    await new Promise((resolve) => setImmediate(resolve));
  });

  assert.equal(
    renderer!.root.findAll((node) => String(node.type) === 'Redirect')[0]?.props.href,
    '/@canonical/post-activity/activity',
  );
  assert.deepEqual(replacements, []);
  assert.equal(
    renderer!.root.findAll((node) => String(node.type) === 'PostRepostProfileList').length,
    0,
  );
});
