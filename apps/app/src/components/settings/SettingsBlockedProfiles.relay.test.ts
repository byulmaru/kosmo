import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import { textStyles } from '../../theme/tokens';
import type { ReactNode, Ref } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { SettingsBlockedProfiles as SettingsBlockedProfilesExport } from './SettingsBlockedProfiles';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Request = {
  name: string;
  variables: Record<string, unknown>;
  sink: {
    next(response: GraphQLResponse): void;
    error(error: Error): void;
    complete(): void;
  };
};

const require = createRequire(import.meta.url);
const generation = { current: 0 };
const triggerFocus = mock.fn();
const toastCalls: Array<{
  message: string;
  tone: string;
  persistent?: boolean;
  action?: { label: string; onPress: () => void };
}> = [];
const showToast = (
  message: string,
  options: { tone: string; persistent?: boolean; action?: { label: string; onPress: () => void } },
) => {
  toastCalls.push({
    message,
    tone: options.tone,
    persistent: options.persistent,
    action: options.action,
  });
  return () => undefined;
};
let scrollProps: { onScroll: (event: object) => void } | null = null;
let selectedProfileId = 'owner-a';
let requests: Request[] = [];
let renderer: ReactTestRenderer | null = null;
let SettingsBlockedProfiles: typeof SettingsBlockedProfilesExport;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

// Only replace the compile-time tag; queries, fragments, pagination and mutations use real Relay.
mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:query|fragment|mutation) (\w+)/)?.[1];
    assert.ok(name);
    const directory = name.startsWith('SettingsBlockedProfile') ? '.' : '../profile';
    return require(`${directory}/__generated__/${name}.graphql.ts`).default;
  },
});
mockModule('react-native', {
  ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'ios' },
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T>(styles: T) => styles },
});
mockModule(new URL('../pagination/PaginationScrollView.tsx', import.meta.url), {
  usePaginationScrollRegistration: (props: typeof scrollProps) => {
    scrollProps = props;
  },
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({ foregroundPrimary: 'primary', foregroundSecondary: 'secondary' }),
});
mockModule(new URL('../profile/ProfileListItemContent.tsx', import.meta.url), {
  ProfileListItemContent: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ProfileRow', props, children),
});
mockModule(new URL('../ui/Button.tsx', import.meta.url), {
  Button: ({
    children,
    controlRef,
    ...props
  }: {
    children?: ReactNode;
    controlRef?: Ref<unknown>;
  }) => {
    if (typeof controlRef === 'function') {
      controlRef({ focus: triggerFocus });
    } else if (controlRef && typeof controlRef === 'object' && 'current' in controlRef) {
      controlRef.current = { focus: triggerFocus };
    }
    return createElement('Button', props, children);
  },
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule(new URL('../ui/ModalSheet.tsx', import.meta.url), {
  ModalSheet: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ModalSheet', props, children),
});
mockModule(new URL('../ui/ConfirmationContent.tsx', import.meta.url), {
  ConfirmationContent: (props: object) => createElement('ConfirmationContent', props),
});
mockModule(new URL('../ui/ToastProvider.tsx', import.meta.url), {
  useToast: () => ({ showToast }),
});
mockModule(new URL('../shell/ShellChromeContext.tsx', import.meta.url), {
  useShellChrome: () => null,
});
mockModule(new URL('../../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => ({ selectedProfileId }),
});
mockModule(new URL('../../relay/RelayEnvironmentBoundary.tsx', import.meta.url), {
  useRelayEnvironmentGeneration: () => generation,
});
mockModule(new URL('../../observability/UnexpectedErrorContext.ts', import.meta.url), {
  useUnexpectedErrorReporter: () => undefined,
});

before(async () => {
  ({ SettingsBlockedProfiles } = await import('./SettingsBlockedProfiles'));
});

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));

afterEach(async () => {
  await act(async () => renderer?.unmount());
  // Drain Relay's temporary Suspense retention after the tree has released its queries.
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  renderer = null;
  requests = [];
  selectedProfileId = 'owner-a';
  generation.current = 0;
  triggerFocus.mock.resetCalls();
  toastCalls.length = 0;
  scrollProps = null;
});

function createEnvironment() {
  return new Environment({
    network: Network.create((operation, variables) =>
      Observable.create<GraphQLResponse>((sink) => {
        requests.push({ name: operation.name, variables, sink });
      }),
    ),
    store: new Store(new RecordSource()),
  });
}

async function render(environment: Environment) {
  await act(async () => {
    const tree = createElement(ReactRelay.RelayEnvironmentProvider, {
      key: selectedProfileId,
      environment,
      children: createElement(SettingsBlockedProfiles),
    });
    if (renderer) {
      renderer.update(tree);
    } else {
      renderer = create(tree);
    }
  });
}

function all(type: string, root: ReactTestInstance | undefined = renderer?.root) {
  assert.ok(root);
  return root.findAll((node) => node.type === type);
}

function one(type: string, root?: ReactTestInstance) {
  const matches = all(type, root);
  assert.equal(matches.length, 1, `Expected one ${type}`);
  return matches[0]!;
}

function button(label: string) {
  const found = all('Button').find((node) => node.props.children === label);
  assert.ok(found, `Missing ${label} button`);
  return found;
}

function latestRequest(name: string) {
  const request = requests.findLast((request) => request.name === name);
  assert.ok(request, `Missing ${name} request`);
  return request;
}

function connection(ids: string[], hasNextPage = false) {
  return {
    edges: ids.map((id) => ({
      cursor: `cursor-${id}`,
      node: {
        __typename: 'ProfileBlock',
        id: `block-${id}`,
        targetProfile: {
          __typename: 'Profile',
          id: `profile-${id}`,
          displayName: '별마루',
          relativeHandle: `@${id}`,
          avatar: { id: `avatar-${id}`, url: `https://media.example/${id}.png` },
          viewerState: {
            profileBlock: {
              __typename: 'ProfileBlock',
              id: `block-${id}`,
              targetProfile: {
                __typename: 'Profile',
                id: `profile-${id}`,
                displayName: '별마루',
                relativeHandle: `@${id}`,
              },
            },
          },
        },
      },
    })),
    pageInfo: {
      endCursor: ids.length ? `cursor-${ids.at(-1)}` : null,
      hasNextPage,
      hasPreviousPage: false,
      startCursor: ids.length ? `cursor-${ids[0]}` : null,
    },
  };
}

function firstPage(ids: string[], hasNext = false, ownerId = selectedProfileId) {
  return {
    currentSession: {
      id: `session-${ownerId}`,
      selectedProfile: {
        id: ownerId,
        profileBlocks: connection(ids, hasNext),
      },
    },
  };
}

function unblockedTargetProfile(id: string) {
  return {
    __typename: 'Profile',
    id: `profile-${id}`,
    displayName: '별마루',
    handle: id,
    relativeHandle: `@${id}`,
    followPolicy: 'PUBLIC',
    followersCount: 0,
    viewerState: {
      isSelf: false,
      follow: null,
      followRequest: null,
      profileBlock: null,
    },
  };
}

async function respond(request: Request, data: Record<string, unknown>) {
  await act(async () => {
    request.sink.next({ data });
    request.sink.complete();
  });
}

const avatars = () => all('ProfileRow').map((row) => row.props.avatarUri);

async function reachEnd() {
  assert.ok(scrollProps);
  await act(async () =>
    scrollProps?.onScroll({
      nativeEvent: {
        contentOffset: { y: 200 },
        contentSize: { height: 1000 },
        layoutMeasurement: { height: 800 },
      },
    }),
  );
}

describe('Settings Block consumer with real Relay', () => {
  it('최초 query 실패를 같은 route에서 재시도하고 빈 목록으로 수렴한다', async (t) => {
    t.mock.method(console, 'error', () => undefined);
    await render(createEnvironment());
    await act(async () =>
      latestRequest('SettingsBlockedProfilesQuery').sink.error(new Error('offline')),
    );
    assert.equal(toastCalls.at(-1)?.tone, 'danger');
    await act(async () => button('다시 시도').props.onPress());
    assert.equal(requests.length, 2);
    assert.equal(one('StateView').props.loading, true);
    await respond(latestRequest('SettingsBlockedProfilesQuery'), firstPage([]));
    assert.equal(one('StateView').props.title, '차단한 프로필이 없어요');
    assert.deepEqual(avatars(), []);
  });

  it('실제 connection pagination은 pending 중 중복을 막고 실패한 cursor를 재시도한다', async () => {
    await render(createEnvironment());
    assert.equal(one('StateView').props.loading, true);
    await respond(latestRequest('SettingsBlockedProfilesQuery'), firstPage(['one'], true));
    assert.deepEqual(avatars(), ['https://media.example/one.png']);
    const row = all('ProfileRow')[0]!;
    assert.equal(row.props.avatarUri, 'https://media.example/one.png');
    assert.equal(row.props.relativeHandle, undefined);
    assert.equal(row.props.identity.type, 'Text');
    assert.equal(row.props.identity.props.children, '별마루');
    assert.deepEqual(row.props.identity.props.style[0], textStyles.uiLabelL);
    await reachEnd();
    const next = latestRequest('SettingsBlockedProfilesNextPageQuery');
    assert.deepEqual(next.variables, { count: 20, cursor: 'cursor-one', id: 'owner-a' });
    assert.equal(all('ActivityIndicator').length, 1);
    await reachEnd();
    assert.equal(requests.filter((request) => request.name === next.name).length, 1);
    assert.equal(all('Button').filter((node) => node.props.children === '더 불러오기').length, 0);
    await act(async () => next.sink.error(new Error('offline')));
    assert.deepEqual(avatars(), ['https://media.example/one.png']);
    assert.equal(toastCalls.at(-1)?.persistent, true);
    await reachEnd();
    assert.equal(requests.filter((request) => request.name === next.name).length, 1);
    await act(async () => toastCalls.at(-1)?.action?.onPress());
    const retry = latestRequest('SettingsBlockedProfilesNextPageQuery');
    assert.deepEqual(retry.variables, next.variables);
    await respond(retry, {
      node: {
        __typename: 'Profile',
        id: 'owner-a',
        profileBlocks: connection(['two']),
      },
    });
    assert.deepEqual(avatars(), ['https://media.example/one.png', 'https://media.example/two.png']);
    assert.equal(all('Button').filter((node) => node.props.children === '더 불러오기').length, 0);
  });

  it('실제 해제 action은 취소·pending·실패 후 재시도를 거쳐 같은 행을 차단 action으로 전환한다', async () => {
    await render(createEnvironment());
    await respond(latestRequest('SettingsBlockedProfilesQuery'), firstPage(['one', 'two']));
    const row = all('ProfileRow')[0]!;
    await act(async () => one('Button', row).props.onPress());
    assert.equal(one('ModalSheet', row).props.title, '이 프로필의 차단을 해제할까요?');
    assert.equal(
      one('ConfirmationContent', row).props.message,
      '차단을 해제해도 이전 팔로우 관계는 복구되지 않아요.',
    );
    await act(async () => one('ConfirmationContent', row).props.onCancel());
    await act(async () => one('ModalSheet', row).props.onDismiss());
    assert.equal(requests.length, 1);
    assert.deepEqual(avatars(), ['https://media.example/one.png', 'https://media.example/two.png']);
    assert.equal(triggerFocus.mock.callCount(), 1);

    await act(async () => one('Button', row).props.onPress());
    await act(async () => one('ConfirmationContent', row).props.onConfirm());
    await act(async () => {
      one('ConfirmationContent', row).props.onConfirm();
      one('ModalSheet', row).props.onClose();
    });
    assert.equal(requests.length, 2);
    const failed = latestRequest('ProfileBlockActionUnblockMutation');
    assert.deepEqual(failed.variables, { id: 'block-one' });
    assert.equal(one('ModalSheet', row).props.visible, true);
    assert.equal(one('ModalSheet', row).props.dismissDisabled, true);
    assert.equal(one('Button', row).props.accessibilityState.busy, true);
    await act(async () => failed.sink.error(new Error('offline')));
    await act(async () => one('ModalSheet', row).props.onDismiss());
    assert.deepEqual(avatars(), ['https://media.example/one.png', 'https://media.example/two.png']);
    assert.equal(toastCalls.at(-1)?.tone, 'danger');

    await act(async () => one('Button', row).props.onPress());
    await act(async () => one('ConfirmationContent', row).props.onConfirm());
    await respond(latestRequest('ProfileBlockActionUnblockMutation'), {
      unblockProfile: {
        success: true,
        profileBlockId: 'block-one',
        targetProfile: unblockedTargetProfile('one'),
      },
    });
    await act(async () => Promise.resolve());
    assert.deepEqual(avatars(), ['https://media.example/one.png', 'https://media.example/two.png']);
    const updatedRow = all('ProfileRow')[0]!;
    assert.equal(one('Button', updatedRow).props.children, '차단');
    await act(async () => one('ModalSheet', updatedRow).props.onDismiss());
    assert.equal(triggerFocus.mock.callCount(), 3);
    assert.equal(toastCalls.at(-1)?.tone, 'success');
    assert.equal(requests.length, 3);
  });

  for (const outcome of ['success', 'error'] as const) {
    it(`actor 전환 뒤 이전 pagination ${outcome} 결과를 새 Owner 목록에 적용하지 않는다`, async () => {
      const environmentA = createEnvironment();
      await render(environmentA);
      await respond(latestRequest('SettingsBlockedProfilesQuery'), firstPage(['one'], true));
      await reachEnd();
      const pendingA = latestRequest('SettingsBlockedProfilesNextPageQuery');
      selectedProfileId = 'owner-b';
      generation.current += 1;
      await render(createEnvironment());
      assert.deepEqual(avatars(), []);
      await respond(latestRequest('SettingsBlockedProfilesQuery'), firstPage(['other']));
      if (outcome === 'error') {
        await act(async () => pendingA.sink.error(new Error('old actor')));
      } else {
        await respond(pendingA, {
          node: {
            __typename: 'Profile',
            id: 'owner-a',
            profileBlocks: connection(['late']),
          },
        });
      }
      assert.deepEqual(avatars(), ['https://media.example/other.png']);
      assert.deepEqual(toastCalls, []);
    });
  }

  it('actor 전환 뒤 늦은 해제 성공은 새 Owner의 행과 feedback을 바꾸지 않는다', async () => {
    await render(createEnvironment());
    await respond(latestRequest('SettingsBlockedProfilesQuery'), firstPage(['one']));
    await act(async () => button('차단 해제').props.onPress());
    await act(async () => one('ConfirmationContent').props.onConfirm());
    const pendingA = latestRequest('ProfileBlockActionUnblockMutation');
    selectedProfileId = 'owner-b';
    generation.current += 1;
    const environmentB = createEnvironment();
    await render(environmentB);
    await respond(latestRequest('SettingsBlockedProfilesQuery'), firstPage(['other']));
    const before = environmentB.getStore().getSource().toJSON();
    await respond(pendingA, {
      unblockProfile: {
        success: true,
        profileBlockId: 'block-one',
        targetProfile: unblockedTargetProfile('one'),
      },
    });
    assert.deepEqual(avatars(), ['https://media.example/other.png']);
    assert.deepEqual(environmentB.getStore().getSource().toJSON(), before);
    assert.deepEqual(toastCalls, []);
    assert.equal(one('Button').props.accessibilityState.busy, false);
  });
});
