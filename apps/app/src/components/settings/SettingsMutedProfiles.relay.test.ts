import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement, Suspense } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import {
  ConnectionHandler,
  Environment,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import type { ReactNode, Ref } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { SettingsMutedProfiles as SettingsMutedProfilesExport } from './SettingsMutedProfiles';

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
const selectedProfileId = 'profile:owner';
const targetProfileId = 'profile:target';
const profileMuteId = 'profile-mute:target';
const connectionKey = 'SettingsMutedProfiles_profileMutes';
const triggerFocus = mock.fn();
const toastCalls: Array<{ tone: string; message: string }> = [];
const showToast = (message: string, options: { tone: string }) => {
  toastCalls.push({ message, tone: options.tone });
  return () => undefined;
};
let requests: Request[] = [];
let renderer: ReactTestRenderer | null = null;
let SettingsMutedProfiles: typeof SettingsMutedProfilesExport;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

// Keep Relay's runtime behavior; only replace compile-time tags with checked-in artifacts.
mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:query|fragment|mutation) (\w+)/)?.[1];
    assert.ok(name);
    const directory = name.startsWith('SettingsMutedProfiles') ? '.' : '../profile';
    return require(`${directory}/__generated__/${name}.graphql.ts`).default;
  },
});
mockModule('react-native', {
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('lucide-react-native', {
  Volume2: 'Volume2',
  VolumeOff: 'VolumeOff',
});
mockModule(require.resolve('lucide-react-native'), {
  Volume2: 'Volume2',
  VolumeOff: 'VolumeOff',
});
mockModule('@/components/profile/MutedProfileList', {
  MutedProfileList: ({
    state,
  }: {
    state: { status: string; profiles?: Array<{ id: string; action: ReactNode }> };
  }) =>
    createElement(
      'MutedProfileList',
      { status: state.status },
      state.status === 'loaded'
        ? state.profiles?.map((profile) =>
            createElement('ProfileRow', { id: profile.id, key: profile.id }, profile.action),
          )
        : null,
    ),
});
mockModule('@/components/pagination/PaginationScrollView', {
  usePaginationScrollRegistration: () => undefined,
});
mockModule('@/components/pagination/useAutomaticPagination', {
  useAutomaticPagination: () => ({
    endRef: { current: null },
    loadError: false,
    loadNextPage: () => undefined,
    nativeScrollProps: {},
  }),
});
mockModule('@/components/RouteBoundary', {
  RouteBoundary: ({ children, loading }: { children: ReactNode; loading: ReactNode }) =>
    createElement(Suspense, { fallback: loading }, children),
  useRouteBoundary: () => ({ fetchKey: 0 }),
});
mockModule('@/components/shell/ShellChromeContext', {
  useShellChrome: () => null,
});
mockModule('@/components/ui/StateView', {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule('@/components/ui/Button', {
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
mockModule('@/components/ui/ConfirmationContent', {
  ConfirmationContent: (props: object) => createElement('ConfirmationContent', props),
});
mockModule('@/components/ui/ModalSheet', {
  ModalSheet: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ModalSheet', props, children),
});
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({ showToast }),
});
mockModule('@/session/SessionProvider', {
  useSession: () => ({ selectedProfileId }),
});
mockModule('@/relay/RelayEnvironmentBoundary', {
  useRelayEnvironmentGeneration: () => generation,
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    actionLinkBase: 'action-link',
    actionLinkHover: 'action-link-hover',
    actionLinkPressed: 'action-link-pressed',
    stateFocusRing: 'focus-ring',
  }),
});

before(async () => {
  ({ SettingsMutedProfiles } = await import('./SettingsMutedProfiles'));
});

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));

afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  renderer = null;
  requests = [];
  generation.current = 0;
  toastCalls.length = 0;
  triggerFocus.mock.resetCalls();
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

async function render(environment: Environment, onUnmuteSuccess?: () => void) {
  await act(async () => {
    const tree = createElement(ReactRelay.RelayEnvironmentProvider, {
      environment,
      children: createElement(SettingsMutedProfiles, { onUnmuteSuccess }),
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

function one(type: string) {
  const matches = all(type);
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

function firstPage() {
  return {
    currentSession: {
      id: 'session:owner',
      selectedProfile: {
        id: selectedProfileId,
        instance: { kind: 'LOCAL' },
        profileMutes: {
          edges: [
            {
              cursor: 'cursor-target',
              node: {
                __typename: 'ProfileMute',
                id: profileMuteId,
                targetProfile: {
                  __typename: 'Profile',
                  id: targetProfileId,
                  displayName: '뮤트 대상',
                  relativeHandle: '@target',
                  avatar: { id: 'avatar:target', url: 'https://media.example/target.png' },
                  viewerState: {
                    __typename: 'ProfileViewerState',
                    profileMute: { __typename: 'ProfileMute', id: profileMuteId },
                  },
                },
              },
            },
          ],
          pageInfo: {
            endCursor: 'cursor-target',
            hasNextPage: false,
            hasPreviousPage: false,
            startCursor: 'cursor-target',
          },
        },
      },
    },
  };
}

async function respond(request: Request, data: Record<string, unknown>) {
  await act(async () => {
    request.sink.next({ data });
    request.sink.complete();
  });
}

describe('SettingsMutedProfiles with the real ProfileMuteAction', () => {
  it('실제 뮤트 해제 버튼의 pending·실패·성공을 거쳐 Relay normalized 상태를 갱신한다', async () => {
    const environment = createEnvironment();
    const onUnmuteSuccess = mock.fn();
    await render(environment, onUnmuteSuccess);
    assert.equal(one('MutedProfileList').props.status, 'loading');

    await respond(latestRequest('SettingsMutedProfilesQuery'), firstPage());
    assert.equal(all('ProfileRow').length, 1);
    assert.equal(button('뮤트 해제').props.loading, false);

    await act(async () => button('뮤트 해제').props.onPress());
    assert.equal(one('ModalSheet').props.visible, true);
    await act(async () => one('ConfirmationContent').props.onConfirm());

    const failed = latestRequest('ProfileMuteControllerUnmuteMutation');
    assert.deepEqual(failed.variables, {
      connections: [ConnectionHandler.getConnectionID(selectedProfileId, connectionKey)],
      id: profileMuteId,
    });
    assert.equal(button('뮤트 해제').props.loading, true);

    await act(async () => failed.sink.error(new Error('offline')));
    assert.equal(button('뮤트 해제').props.loading, false);
    assert.equal(one('ModalSheet').props.visible, false);
    await act(async () => one('ModalSheet').props.onDismiss());
    assert.equal(toastCalls.at(-1)?.tone, 'danger');
    assert.equal(onUnmuteSuccess.mock.callCount(), 0);
    assert.equal(all('ProfileRow').length, 1);

    await act(async () => button('뮤트 해제').props.onPress());
    await act(async () => one('ConfirmationContent').props.onConfirm());
    const succeeded = latestRequest('ProfileMuteControllerUnmuteMutation');
    assert.equal(button('뮤트 해제').props.loading, true);
    await respond(succeeded, {
      unmuteProfile: {
        profileMuteId,
        deletedProfileMuteId: profileMuteId,
        targetProfile: {
          __typename: 'Profile',
          id: targetProfileId,
          viewerState: { __typename: 'ProfileViewerState', profileMute: null },
        },
      },
    });
    await act(async () => Promise.resolve());

    assert.equal(all('ProfileRow').length, 0);
    const source = environment.getStore().getSource();
    const target = source.get(targetProfileId);
    assert.ok(target);
    const viewerStateRef = target.viewerState as { __ref?: string } | null | undefined;
    assert.ok(viewerStateRef?.__ref);
    const viewerState = source.get(viewerStateRef.__ref);
    assert.ok(viewerState);
    assert.equal(viewerState.profileMute, null);
    assert.equal(toastCalls.at(-1)?.tone, 'success');
    assert.equal(onUnmuteSuccess.mock.callCount(), 1);
  });
});
