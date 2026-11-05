import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import {
  createOperationDescriptor,
  Environment,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { executeGraphQLRequest } from '../../relay/network';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const relay = require('react-relay');
const query =
  require('../../app/(tabs)/(protected)/hashtags/[hashtagId]/__generated__/HashtagRelatedProfilesPageQuery.graphql').default;
const fragment = require('./__generated__/HashtagRelatedProfileList_hashtag.graphql').default;
const artifacts = [
  query,
  fragment,
  require('./__generated__/ProfileTagMuteAction_tag.graphql').default,
  require('./__generated__/ProfileTagMuteActionCreateMutation.graphql').default,
  require('./__generated__/ProfileTagMuteActionUpdateMutation.graphql').default,
  require('./__generated__/ProfileTagMuteActionDeleteMutation.graphql').default,
  require('./__generated__/ProfileTagMuteActionDeleteUpdaterQuery.graphql').default,
];

const events: Array<[string, Record<string, unknown>]> = [];
type CapturedRequest = {
  name: string;
  variables: unknown;
  sink: {
    next(value: GraphQLResponse): void;
    complete(): void;
    error(error: Error): void;
  };
};
const requests: CapturedRequest[] = [];
let renderer: ReactTestRenderer | undefined;
let accountId: string | null = 'account-a';
let selectedProfileId: string | null = 'owner-a';
let routeId: string | string[] | undefined = 'tag-a';
let profileTagMuteEnabled = false;
let canGoBack = true;
let backCount = 0;
const replacements: string[] = [];
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
mockModule(new URL('../shell/MobileWebRouteMenu.tsx', import.meta.url), {
  MobileWebRouteMenu: () => null,
});
mockModule('expo-router', {
  usePathname: () => '/hashtags/tag-a/profiles',
  useLocalSearchParams: () => ({ hashtagId: routeId }),
  useRouter: () => ({
    canGoBack: () => canGoBack,
    back: () => backCount++,
    replace: (href: string) => replacements.push(href),
  }),
});
mockModule('react-relay', {
  ...relay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:query|mutation|fragment)\s+(\w+)/)?.[1];
    const artifact = artifacts.find(
      (item) => ('params' in item ? item.params.name : item.name) === name,
    );
    assert.ok(artifact, name);
    return artifact;
  },
});
mockModule('react-native', {
  ScrollView: 'div',
  View: 'div',
  StyleSheet: { create: <T>(styles: T) => styles },
});
const icons = { ArrowLeftIcon: 'span', RefreshCw: 'span', Volume2: 'span', VolumeOff: 'span' };
mockModule('lucide-react-native', icons);
mockModule(require.resolve('lucide-react-native'), icons);
mockModule(new URL('../../analytics/client.ts', import.meta.url), {
  trackAnalytics: (event: string, properties: Record<string, unknown>) =>
    events.push([event, properties]),
});
mockModule(new URL('../../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => ({ accountId, selectedProfileId }),
});
mockModule(new URL('../FeatureFlagsContext.tsx', import.meta.url), {
  useFeatureFlag: (key: string) => key === 'profile-tag-mute' && profileTagMuteEnabled,
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({ foregroundPrimary: '#111', foregroundSecondary: '#666', border: '#ddd' }),
});
mockModule(new URL('../ui/IconButton.tsx', import.meta.url), {
  IconButton: (props: object) => createElement('button', props),
});
mockModule(new URL('../PageHeader.tsx', import.meta.url), {
  PageHeader: ({ leading, trailing, ...props }: { leading?: ReactNode; trailing?: ReactNode }) =>
    createElement('h1', props, leading, trailing),
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('p', props),
});
mockModule('@/components/ui/ConfirmationContent', {
  ConfirmationContent: ({
    cancelLabel,
    confirmDisabled,
    confirmLabel,
    onCancel,
    onConfirm,
    pending,
  }: {
    cancelLabel: string;
    confirmDisabled?: boolean;
    confirmLabel: string;
    onCancel: () => void;
    onConfirm: () => void;
    pending?: boolean;
  }) =>
    createElement(
      'div',
      null,
      createElement(
        'button',
        { accessibilityLabel: cancelLabel, disabled: pending, onPress: onCancel },
        cancelLabel,
      ),
      createElement(
        'button',
        {
          accessibilityLabel: confirmLabel,
          disabled: pending || confirmDisabled,
          onPress: onConfirm,
        },
        confirmLabel,
      ),
    ),
});
mockModule('@/components/ui/ModalSheet', {
  ModalSheet: ({ children, visible, ...props }: { children?: ReactNode; visible: boolean }) =>
    createElement('ModalSheet', { ...props, visible }, visible ? children : null),
});
mockModule('@/components/ui/LoadingIndicator', {
  LoadingIndicator: (props: object) => createElement('span', props),
});
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({ showToast: () => undefined }),
});
mockModule(new URL('./ProfileListItem.tsx', import.meta.url), {
  ProfileListItem: (props: object) => createElement('a', props),
});
mockModule(new URL('../pagination/PaginationSurface.tsx', import.meta.url), {
  PaginationSurface: () => null,
});
mockModule(new URL('../pagination/useAutomaticPagination.ts', import.meta.url), {
  useAutomaticPagination: () => ({ endRef: { current: null }, nativeScrollProps: {} }),
});
mockModule(new URL('../../observability/UnexpectedErrorContext.ts', import.meta.url), {
  useUnexpectedErrorReporter: () => undefined,
});
let Screen: ComponentType;
let execute: typeof executeGraphQLRequest;
before(async () => {
  Screen = (await import('../../app/(tabs)/(protected)/hashtags/[hashtagId]/profiles')).default;
  execute = (await import('../../relay/network')).executeGraphQLRequest;
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  events.length = 0;
  requests.length = 0;
  mock.timers.reset();
  routeId = 'tag-a';
  accountId = 'account-a';
  selectedProfileId = 'owner-a';
  profileTagMuteEnabled = false;
  canGoBack = true;
  backCount = 0;
  replacements.length = 0;
});
const payload = (count: number, id = 'tag-a') => ({
  data: {
    node: {
      __typename: 'Hashtag',
      id,
      name: 'Topic',
      viewerMuteRule: null,
      relatedProfiles: {
        edges: Array.from({ length: count }, (_, i) => ({
          cursor: `cursor-${i}`,
          node: {
            __typename: 'Profile',
            id: `profile-${i}`,
            displayName: 'Profile',
            handle: 'profile',
            relativeHandle: '@profile',
            bio: null,
            avatar: null,
            followPolicy: 'OPEN',
            followersCount: 0,
            viewerState: { isSelf: false, follow: null, followRequest: null, profileBlock: null },
          },
        })),
        pageInfo: { endCursor: count ? 'cursor-0' : null, hasNextPage: false },
      },
    },
  },
});
for (const [cache, network] of [
  [1, 1],
  [25, 1],
  [0, 1],
  [1, 0],
  [1, 'error'],
  [null, 0],
  [null, 'error'],
] as const) {
  test(`실제 Relay store-and-network: 먼저 표시된 cache ${cache} / network ${network}`, async () => {
    // Relay temporary query retains use expiry timers even for a failed render.
    mock.timers.enable({ apis: ['setTimeout'] });
    let complete: (response: Response) => void = () => assert.fail('network did not start');
    const pending = new Promise<Response>((resolve) => {
      complete = resolve;
    });
    let requests = 0;
    const environment = new Environment({
      store: new Store(new RecordSource()),
      network: Network.create((request, variables) =>
        execute(request, variables, null, () =>
          ++requests === 1 ? pending : Promise.resolve(new Response(JSON.stringify(payload(1)))),
        ),
      ),
    });
    const operation = createOperationDescriptor(query, { id: 'tag-a' });
    if (cache !== null) {
      environment.commitPayload(operation, payload(cache).data);
      assert.equal(environment.check(operation).status, 'available');
    }
    await act(async () => {
      renderer = create(
        createElement(relay.RelayEnvironmentProvider, { environment }, createElement(Screen)),
      );
    });
    if (cache !== null) {
      assert.equal(renderer!.root.findAllByType('a').length, cache);
      if (cache === 1 && network === 1) {
        assert.equal(
          renderer!.root.findAllByProps({ accessibilityLabel: '#Topic 뮤트' }).length,
          0,
        );
      }
      assert.equal(
        events.find(([name]) => name === 'profile_hashtag_list_viewed')?.[1].result_count,
        Math.min(cache, 20),
      );
    }
    else {
      assert.ok(renderer!.root.findAllByProps({ loading: true }).length > 0);
      assert.ok(!events.some(([name]) => name === 'profile_hashtag_list_viewed'));
    }
    await act(async () => {
      complete(
        network === 'error'
          ? new Response('failed', { status: 503 })
          : new Response(JSON.stringify(payload(network))),
      );
      await new Promise((resolve) => setImmediate(resolve));
    });
    const initial = events.filter(([name]) => name === 'profile_hashtag_list_viewed');
    assert.equal(initial.length, cache !== null || network !== 'error' ? 1 : 0);
    if (initial.length) {
      assert.deepEqual(initial[0]![1], {
        hashtag_id: 'tag-a',
        result_count: Math.min((cache ?? network) as number, 20),
      });
    }
    assert.ok(!events.some(([name]) => name === 'profile_hashtag_request_completed'));
    if (cache === null && network === 'error') {
      const errorState = renderer!.root.findAllByType('p').find((node) => node.props.alert)!;
      assert.equal(errorState.props.actionLabel, '다시 시도');
      assert.equal(typeof errorState.props.onAction, 'function');
      await act(async () => {
        errorState.props.onAction();
        await new Promise((resolve) => setImmediate(resolve));
      });
      assert.equal(renderer!.root.findAllByType('a').length, 1);
      assert.equal(events.filter(([name]) => name === 'profile_hashtag_list_viewed').length, 1);
    }
    if (cache === 0 && network === 1) {
      renderer!.root.findByType('a').props.onPress();
      assert.equal(initial[0]![1].result_count, 0);
      assert.equal(events.at(-1)?.[0], 'profile_hashtag_profile_selected');
    }
  });
}

test('malformed 단일 route ID는 요청 없이 notFound를 표시하고 history 없으면 홈으로 돌아간다', async () => {
  routeId = ['tag-a', 'tag-b'];
  canGoBack = false;
  let requests = 0;
  const environment = new Environment({
    store: new Store(new RecordSource()),
    network: Network.create(() => {
      requests++;
      return Promise.resolve(payload(0));
    }),
  });
  await act(async () => {
    renderer = create(
      createElement(relay.RelayEnvironmentProvider, { environment }, createElement(Screen)),
    );
  });
  assert.equal(requests, 0);
  assert.ok(
    renderer!.root
      .findAllByType('p')
      .some((node) => node.props.title === '해시태그를 찾을 수 없어요'),
  );
  const back = renderer!.root.findByType('button');
  assert.equal(back.props.accessibilityLabel, '뒤로 가기');
  back.props.onPress();
  assert.deepEqual(replacements, ['/home']);
  assert.equal(events.filter(([name]) => name === 'profile_hashtag_list_viewed').length, 0);
});

test('같은 결과의 Account loading은 중복하지 않고 Account·Hashtag 변경은 새 결과를 기록한다', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const environment = new Environment({
    store: new Store(new RecordSource()),
    network: Network.create(() => new Promise(() => {})),
  });
  for (const id of ['tag-a', 'tag-b']) {
    environment.commitPayload(createOperationDescriptor(query, { id }), payload(2, id).data);
  }
  const element = () =>
    createElement(relay.RelayEnvironmentProvider, { environment }, createElement(Screen));
  await act(async () => {
    renderer = create(element());
  });
  assert.equal(events.length, 1);
  accountId = null;
  await act(async () => renderer!.update(element()));
  accountId = 'account-a';
  await act(async () => renderer!.update(element()));
  assert.equal(events.length, 1);
  accountId = 'account-b';
  await act(async () => renderer!.update(element()));
  assert.equal(events.length, 2);
  routeId = 'tag-b';
  await act(async () => renderer!.update(element()));
  assert.deepEqual(
    events.map(([, properties]) => properties.hashtag_id),
    ['tag-a', 'tag-a', 'tag-b'],
  );
  assert.ok(events.every(([, properties]) => properties.result_count === 2));
});

test('실제 route의 태그 mute action은 create 결과를 Relay 정규화해 접근성 action을 갱신한다', async () => {
  profileTagMuteEnabled = true;
  const environment = new Environment({
    store: new Store(new RecordSource()),
    network: Network.create((request, variables) =>
      Observable.create<GraphQLResponse>((sink) => {
        requests.push({ name: request.name, variables, sink });
      }),
    ),
  });
  const operation = createOperationDescriptor(query, { id: 'tag-a' });
  environment.commitPayload(operation, payload(1).data);
  assert.equal(environment.check(operation).status, 'available');

  await act(async () => {
    renderer = create(
      createElement(relay.RelayEnvironmentProvider, { environment }, createElement(Screen)),
    );
  });
  assert.equal(renderer!.root.findAllByType('a').length, 1);
  const queryRequest = latestRequest('HashtagRelatedProfilesPageQuery');
  await respond(queryRequest, { data: payload(1).data });

  const muteButton = () => renderer!.root.findByProps({ accessibilityLabel: '#Topic 뮤트' });
  await act(async () => muteButton().props.onPress());
  const confirmButton = renderer!.root.findByProps({ accessibilityLabel: '뮤트' });
  await act(async () => confirmButton.props.onPress());

  const createRequest = latestRequest('ProfileTagMuteActionCreateMutation');
  assert.deepEqual(createRequest.variables, {
    input: {
      hashtagId: 'tag-a',
      scopes: ['NOTIFICATION'],
      decision: 'EXCLUDE',
      expiresAt: null,
    },
  });
  await respond(createRequest, {
    data: {
      createHashtagMuteRule: {
        hashtagMuteRule: {
          __typename: 'HashtagMuteRule',
          id: 'rule-a',
          targetHashtag: {
            __typename: 'Hashtag',
            id: 'tag-a',
            name: 'Topic',
            viewerMuteRule: {
              __typename: 'HashtagMuteRule',
              id: 'rule-a',
              scopes: ['NOTIFICATION'],
              expiresAt: null,
              isActive: true,
              appliesTo: true,
            },
          },
        },
      },
    },
  });

  assert.equal(
    renderer!.root.findByProps({ accessibilityLabel: '#Topic 뮤트 해제' }).props.disabled,
    false,
  );
  assert.equal(renderer!.root.findAllByProps({ accessibilityLabel: '#Topic 뮤트' }).length, 0);
});

function latestRequest(name: string) {
  const request = requests.filter((captured) => captured.name === name).at(-1);
  assert.ok(request, name);
  return request;
}

async function respond(request: CapturedRequest, response: GraphQLResponse) {
  await act(async () => {
    request.sink.next(response);
    request.sink.complete();
  });
}
