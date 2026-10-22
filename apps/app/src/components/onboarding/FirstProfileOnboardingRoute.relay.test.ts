import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement, Suspense } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type {
  RelayActorProvider as RelayActorProviderExport,
  useRelayActor as useRelayActorExport,
} from '@/relay/RelayActorProvider';
import type * as Feature from './FirstProfileOnboardingRoute';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const mockModule = (specifier: string, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
type Request = {
  name: string;
  actor: string | null;
  variables: Record<string, unknown>;
  sink: { next(value: GraphQLResponse): void; complete(): void; error(error: Error): void };
};
let requests: Request[] = [];
let renderer: ReactTestRenderer | null = null;
let feature: typeof Feature;
let flow: ReturnType<typeof Feature.useFirstProfileOnboarding>;
let storedProfileId: string | null = null;
let transferFailure = false;
let transferCount = 0;
let pickerResult: object;
let RelayActorProvider: typeof RelayActorProviderExport;
let actorControls: ReturnType<typeof useRelayActorExport>;
let useRelayActor: typeof useRelayActorExport;
let sessionValue = {
  accountId: 'account-1' as string | null,
  sessionId: 'session-1' as string | null,
  status: 'valid',
};

mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:query|mutation) (\w+)/)?.[1];
    assert.ok(name);
    return require(`./__generated__/${name}.graphql.ts`).default;
  },
});
mockModule('react-native', { Platform: { OS: 'web' } });
mockModule('@/session/SessionProvider', { useSession: () => sessionValue });

mockModule('expo-router', {
  Redirect: ({ href }: { href: string }) => createElement('Redirect', { href }),
});
mockModule('expo-image-picker', { launchImageLibraryAsync: async () => pickerResult });
mockModule('@/auth/selectedProfileStorage', {
  writeSelectedProfile: async (id: string) => {
    storedProfileId = id;
  },
  deleteSelectedProfile: async () => {
    storedProfileId = null;
  },
});
mockModule('@/auth/tokenStorage', {
  readSessionToken: async () => null,
  writeSessionToken: async () => undefined,
  deleteSessionToken: async () => undefined,
});
mockModule('@/relay/environment', {
  createRelayEnvironment: () => {
    throw new Error('test must provide the real test environment');
  },
});
mockModule('@/components/Splash', { Splash: () => createElement('Loading') });
mockModule('@/components/ui/StateView', {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule('@/components/media/imageUpload', {
  releaseImagePreview: () => undefined,
  reportImageUploadError: () => undefined,
  transferImage: async () => {
    transferCount += 1;
    if (transferFailure) {
      throw new Error('transfer failed');
    }
  },
});

function Probe() {
  flow = feature.useFirstProfileOnboarding();
  actorControls = useRelayActor();
  return createElement('Draft', {
    handle: flow.draft.handle,
    profile: flow.createdProfile?.id,
    busy: flow.busy,
    result: flow.result.kind,
  });
}
function environment(_token: string | null, actor: string | null) {
  return new Environment({
    network: Network.create((request, variables) =>
      Observable.create((sink) => {
        requests.push({ name: request.name, variables, sink, actor });
      }),
    ),
    store: new Store(new RecordSource()),
  });
}
function query(accountId = 'account-1', profileId: string | null = null, sessionId = 'session-1') {
  return {
    me: { id: accountId, profiles: profileId ? [{ id: profileId, handle: 'spring' }] : [] },
    currentSession: {
      id: sessionId,
      selectedProfile: profileId
        ? {
            id: profileId,
            instance: { kind: 'LOCAL' },
            viewerState: { membership: { role: 'OWNER' } },
          }
        : null,
    },
  };
}
async function resolve(name: string, data: object | null, errors?: ReadonlyArray<object>) {
  const index = requests.findIndex((request) => request.name === name);
  assert.notEqual(
    index,
    -1,
    `missing ${name}; pending ${requests.map((request) => request.name).join(', ')}`,
  );
  const [request] = requests.splice(index, 1);
  await act(async () => {
    request!.sink.next({ data, ...(errors ? { errors } : {}) } as GraphQLResponse);
    request!.sink.complete();
  });
  return request!;
}
async function change(input: Partial<typeof flow.draft>) {
  await act(async () => flow.setDraft({ ...flow.draft, ...input }));
}
async function finish(step: Parameters<typeof flow.complete>[0] = 'handle') {
  await act(async () => {
    flow.complete(step);
  });
}
async function createFirst() {
  await change({ handle: 'spring' });
  await finish();
  await resolve('FirstProfileOnboardingCreateMutation', {
    createProfile: { profile: { id: 'profile-1', handle: 'spring', relativeHandle: '@spring' } },
  });
}
async function selected() {
  await resolve('FirstProfileOnboardingSelectMutation', {
    selectProfile: { profile: { id: 'profile-1' } },
  });
  if (requests.some((request) => request.name === 'FirstProfileOnboardingQuery')) {
    await resolve('FirstProfileOnboardingQuery', query('account-1', 'profile-1'));
  }
}

before(async () => {
  feature = await import('./FirstProfileOnboardingRoute');
  ({ RelayActorProvider, useRelayActor } = await import('@/relay/RelayActorProvider'));
});
beforeEach(async () => {
  requests = [];
  storedProfileId = null;
  transferFailure = false;
  transferCount = 0;
  sessionValue = { accountId: 'account-1', sessionId: 'session-1', status: 'valid' };
  pickerResult = {
    canceled: false,
    assets: [{ uri: 'file:///avatar.png', width: 20, height: 20 }],
  };
  await act(async () => {
    renderer = create(
      createElement(
        RelayActorProvider,
        { createEnvironment: environment },
        createElement(
          Suspense,
          { fallback: createElement('Loading') },
          createElement(feature.FirstProfileOnboardingRoute, null, createElement(Probe)),
        ),
      ),
    );
  });
  await resolve('FirstProfileOnboardingQuery', query());
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
});

describe('first profile Relay completion', () => {
  it('creates only on explicit completion and ignores a repeated action while pending', async () => {
    await change({ handle: 'spring' });
    assert.equal(requests.length, 0);
    await finish();
    await finish();
    assert.equal(
      requests.filter((request) => request.name === 'FirstProfileOnboardingCreateMutation').length,
      1,
    );
    await resolve('FirstProfileOnboardingCreateMutation', {
      createProfile: { profile: { id: 'profile-1', handle: 'spring', relativeHandle: '@spring' } },
    });
    await selected();
    assert.equal(flow.result.kind, 'success');
    assert.equal(flow.createdProfile?.id, 'profile-1');
    assert.equal(storedProfileId, 'profile-1');
    assert.equal(requests.length, 0);
  });

  it('retains the created identity when selection fails and retries selection without creating again', async () => {
    await createFirst();
    await resolve('FirstProfileOnboardingSelectMutation', null, [
      { message: 'selection unavailable' },
    ]);
    assert.equal(flow.result.kind, 'error');
    assert.equal(flow.createdProfile?.id, 'profile-1');
    await finish('review');
    assert.deepEqual(
      requests.map((request) => request.name),
      ['FirstProfileOnboardingSelectMutation'],
    );
    await selected();
    assert.equal(flow.result.kind, 'success');
  });

  it('binds optional updates to the created profile and preserves the entire draft after failure', async () => {
    await change({
      handle: 'spring',
      displayName: '봄',
      bio: '소개',
      tags: ['책'],
      defaultPostVisibility: 'FOLLOWERS',
      followPolicy: 'APPROVAL_REQUIRED',
    });
    await finish('posting');
    await resolve('FirstProfileOnboardingCreateMutation', {
      createProfile: { profile: { id: 'profile-1', handle: 'spring', relativeHandle: '@spring' } },
    });
    const first = requests[0]!;
    assert.equal(first.name, 'FirstProfileOnboardingSaveMutation');
    assert.equal(first.variables.profileId, 'profile-1');
    assert.deepEqual(first.variables.input, {
      displayName: '봄',
      bio: '소개',
      tags: ['책'],
      defaultPostVisibility: 'FOLLOWERS',
      followPolicy: 'APPROVAL_REQUIRED',
    });
    await resolve(first.name, null, [{ message: 'save failed' }]);
    assert.equal(flow.draft.bio, '소개');
    assert.deepEqual(flow.draft.tags, ['책']);
    assert.equal(flow.createdProfile?.id, 'profile-1');
    await finish('posting');
    assert.equal(requests[0]!.name, 'FirstProfileOnboardingSaveMutation');
    await resolve('FirstProfileOnboardingSaveMutation', {
      selectProfile: { profile: { id: 'profile-1' } },
      updateProfile: {
        profile: {
          id: 'profile-1',
          displayName: '봄',
          bio: '소개',
          followPolicy: 'APPROVAL_REQUIRED',
          tags: [{ id: 'tag-book', name: '책' }],
          avatar: null,
          header: null,
          private: { defaultPostVisibility: 'FOLLOWERS' },
        },
      },
    });
    await resolve('FirstProfileOnboardingQuery', query('account-1', 'profile-1'));
    assert.equal(flow.result.kind, 'success');
    assert.equal(flow.completedFrom, 'posting');
    await finish('review');
    assert.deepEqual(
      requests.map((request) => request.name),
      ['FirstProfileOnboardingSelectMutation'],
    );
  });

  it('keeps a failed image and the profile, then reuses a ready image across a save retry', async () => {
    await change({ handle: 'spring' });
    await act(async () => flow.pickImage('avatar'));
    transferFailure = true;
    await finish('details');
    await resolve('FirstProfileOnboardingCreateMutation', {
      createProfile: { profile: { id: 'profile-1', handle: 'spring', relativeHandle: '@spring' } },
    });
    await resolve('FirstProfileOnboardingIssueMediaMutation', {
      selectProfile: { profile: { id: 'profile-1' } },
      issueMediaUploadUrl: { media: { id: 'media-1' }, uploadUrl: 'https://upload.example/one' },
    });
    assert.equal(flow.result.kind, 'error');
    assert.equal(flow.images.avatar.presentation.kind, 'replacement');
    assert.equal(flow.images.avatar.asset?.uri, 'file:///avatar.png');
    transferFailure = false;
    await finish('details');
    await resolve('FirstProfileOnboardingIssueMediaMutation', {
      selectProfile: { profile: { id: 'profile-1' } },
      issueMediaUploadUrl: { media: { id: 'media-2' }, uploadUrl: 'https://upload.example/two' },
    });
    await resolve('FirstProfileOnboardingCompleteMediaMutation', {
      selectProfile: { profile: { id: 'profile-1' } },
      completeMediaUpload: { media: { id: 'media-2', state: 'READY' } },
    });
    await resolve('FirstProfileOnboardingSaveMutation', null, [{ message: 'save failed' }]);
    await finish('details');
    assert.deepEqual(
      requests.map((request) => request.name),
      ['FirstProfileOnboardingSaveMutation'],
    );
    assert.equal((requests[0]!.variables.input as { avatarId: string }).avatarId, 'media-2');
    assert.equal(transferCount, 2);
    await resolve('FirstProfileOnboardingSaveMutation', {
      selectProfile: { profile: { id: 'profile-1' } },
      updateProfile: {
        profile: {
          id: 'profile-1',
          displayName: 'spring',
          bio: null,
          followPolicy: 'OPEN',
          tags: [],
          avatar: { id: 'media-2', url: 'https://media.example/avatar' },
          header: null,
          private: { defaultPostVisibility: 'UNLISTED' },
        },
      },
    });
    await resolve('FirstProfileOnboardingQuery', query('account-1', 'profile-1'));
    assert.equal(flow.result.kind, 'success');
    assert.equal(flow.images.avatar.mediaId, 'media-2');
    assert.equal(flow.createdProfile?.id, 'profile-1');
    assert.equal(transferCount, 2);
  });

  it('shows a handle conflict from a non-null create root on the input field', async () => {
    await change({ handle: 'spring' });
    await finish();
    await resolve('FirstProfileOnboardingCreateMutation', null, [
      {
        message: '이미 사용 중인 핸들이에요.',
        extensions: { code: 'CONFLICT', field: 'handle' },
        path: ['createProfile'],
      },
    ]);
    assert.equal(flow.createdProfile, null);
    assert.equal(flow.errors.handle, '이미 사용 중인 핸들이에요.');
    assert.equal(flow.draft.handle, 'spring');
  });

  it('treats nullable query field errors as retryable errors and retains a created draft on retry', async () => {
    await createFirst();
    await resolve('FirstProfileOnboardingSelectMutation', {
      selectProfile: { profile: { id: 'profile-1' } },
    });
    await resolve('FirstProfileOnboardingQuery', { ...query('account-1', 'profile-1'), me: null }, [
      { message: 'profiles unavailable', path: ['me', 'profiles'] },
    ]);
    const errorViews = renderer!.root.findAll((node) => String(node.type) === 'StateView');
    assert.equal(errorViews.length, 1);
    assert.equal(renderer!.root.findAll((node) => String(node.type) === 'Redirect').length, 0);
    await act(async () => {
      (errorViews[0]!.props as { onAction: () => void }).onAction();
    });
    await resolve('FirstProfileOnboardingQuery', query('account-1', 'profile-1'));
    assert.equal(flow.createdProfile?.id, 'profile-1');
    assert.equal(flow.draft.handle, 'spring');
    assert.equal(flow.result.kind, 'success');
    await finish();
    assert.deepEqual(
      requests.map((request) => request.name),
      ['FirstProfileOnboardingSelectMutation'],
    );
  });

  it('confirms reverted input after an unconfirmed save instead of trusting the old baseline', async () => {
    await createFirst();
    await selected();
    await change({ displayName: '봄' });
    await finish('details');
    await resolve('FirstProfileOnboardingSaveMutation', null, [
      { message: 'response lost after commit', path: ['updateProfile'] },
    ]);
    await change({ displayName: '' });
    await finish('details');
    assert.equal(requests[0]?.name, 'FirstProfileOnboardingSaveMutation');
    assert.equal((requests[0]!.variables.input as { displayName: string }).displayName, 'spring');
    await resolve('FirstProfileOnboardingSaveMutation', {
      selectProfile: { profile: { id: 'profile-1' } },
      updateProfile: {
        profile: {
          id: 'profile-1',
          displayName: 'spring',
          bio: null,
          followPolicy: 'OPEN',
          tags: [],
          avatar: null,
          header: null,
          private: { defaultPostVisibility: 'UNLISTED' },
        },
      },
    });
    assert.equal(flow.result.kind, 'success');
    assert.equal(flow.createdProfile?.id, 'profile-1');
  });

  it('clears a retained draft and identity when the authentication lifecycle changes', async () => {
    await createFirst();
    await selected();
    await change({ displayName: '계정별 초안' });
    sessionValue = { accountId: 'account-2', sessionId: 'session-2', status: 'valid' };
    await act(async () => actorControls.resetSession());
    await resolve('FirstProfileOnboardingQuery', query('account-2', null, 'session-2'));
    assert.equal(flow.createdProfile, null);
    assert.equal(flow.draft.handle, '');
    assert.equal(flow.draft.displayName, '');
    assert.equal(flow.result.kind, 'idle');
    await change({ handle: 'second_account' });
    await finish();
    assert.deepEqual(
      requests.map((request) => request.name),
      ['FirstProfileOnboardingCreateMutation'],
    );
    assert.equal(requests[0]!.variables.handle, 'second_account');
  });

  it('waits for a confirmed session before accepting a draft and retains it through actor refresh', async () => {
    sessionValue = { accountId: null, sessionId: null, status: 'error' };
    await act(async () => actorControls.resetActor(null));
    assert.equal(requests.length, 0);
    assert.equal(renderer!.root.findAll((node) => String(node.type) === 'Draft').length, 0);
    const errorView = renderer!.root.findAll((node) => String(node.type) === 'StateView')[0]!;
    sessionValue = { accountId: 'account-1', sessionId: 'session-1', status: 'valid' };
    await act(async () => {
      (errorView.props as { onAction: () => void }).onAction();
    });
    await resolve('FirstProfileOnboardingQuery', query());
    await createFirst();
    await selected();
    assert.equal(flow.createdProfile?.id, 'profile-1');
    assert.equal(flow.draft.handle, 'spring');
    assert.equal(flow.result.kind, 'success');
  });

  it('starts a fresh draft when SessionProvider observes a different Account without resetSession', async () => {
    await createFirst();
    await selected();
    await change({ displayName: '첫 계정의 초안' });
    sessionValue = { accountId: 'account-2', sessionId: 'session-2', status: 'valid' };
    await act(async () => actorControls.resetActor(null));
    await resolve('FirstProfileOnboardingQuery', query('account-2', null, 'session-2'));
    assert.equal(flow.createdProfile, null);
    assert.equal(flow.draft.handle, '');
    assert.equal(flow.draft.displayName, '');
    await change({ handle: 'new_account' });
    await finish();
    assert.equal(requests[0]!.variables.handle, 'new_account');
  });

  it('does not let a late completion replace a newer selected actor', async () => {
    await createFirst();
    const oldSelection = requests.shift()!;
    await act(async () => actorControls.resetActor('profile-other'));
    await resolve('FirstProfileOnboardingQuery', query('account-1', 'profile-other'));
    await act(async () => {
      oldSelection.sink.next({ data: { selectProfile: { profile: { id: 'profile-1' } } } });
      oldSelection.sink.complete();
    });
    assert.equal(storedProfileId, null);
    assert.equal(requests.length, 0);
    assert.equal(renderer!.root.findAll((node) => String(node.type) === 'StateView').length, 1);
  });
});
