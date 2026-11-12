import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement, Suspense, useState } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import {
  createOperationDescriptor,
  Environment,
  getSelector,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import followButtonProfileFragment from '../profile/__generated__/FollowButton_profile.graphql';
import profileHeroFragment from '../profile/__generated__/ProfileHero_profile.graphql';
import autoFollowMutation from './__generated__/FirstProfileOnboardingFollowMutation.graphql';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type {
  RelayActorProvider as RelayActorProviderExport,
  useRelayActor as useRelayActorExport,
} from '@/relay/RelayActorProvider';
import type { FollowButton_profile$data } from '../profile/__generated__/FollowButton_profile.graphql';
import type { ProfileHero_profile$data } from '../profile/__generated__/ProfileHero_profile.graphql';
import type * as Feature from './FirstProfileOnboardingRoute';
import type { FirstProfileStep } from './firstProfileOnboardingState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const globals = globalThis as typeof globalThis & { __KOSMO_CHANNEL__?: unknown };
const originalChannel = globals.__KOSMO_CHANNEL__;
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
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
let handledErrors: Array<{ error: unknown; context?: Record<string, string | number> }> = [];
let pickerResult: object;
let RelayActorProvider: typeof RelayActorProviderExport;
let actorControls: ReturnType<typeof useRelayActorExport>;
let useRelayActor: typeof useRelayActorExport;
type FollowPolicy = 'OPEN' | 'APPROVAL_REQUIRED';
const autoFollowTargetId = 'AZ-3YxIdfz2WSjjntTzIgFByb2ZpbGU';
let cachedAutoFollowPolicy: FollowPolicy | null = null;
let autoFollowEnvironment: Environment | null = null;
let navigate: (step: FirstProfileStep | 'complete') => void;
let sessionValue = {
  accountId: 'account-1' as string | null,
  sessionId: 'session-1' as string | null,
  status: 'valid',
};

mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:query|mutation|fragment) (\w+)/)?.[1];
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
mockModule('@/observability/sentry', {
  captureHandledError: (error: unknown, context?: Record<string, string | number>) =>
    handledErrors.push({ error, context }),
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

function Probe({ step }: { step: FirstProfileStep | 'complete' }) {
  flow = feature.useFirstProfileOnboarding();
  return createElement('Draft', {
    handle: flow.draft.handle,
    profile: flow.createdProfile?.id,
    busy: flow.busy,
    result: flow.result.kind,
    step,
  });
}
function ActorProbe() {
  actorControls = useRelayActor();
  return createElement('Actor', { selectedProfileId: actorControls.selectedProfileId });
}
function TestApp() {
  const [step, setStep] = useState<FirstProfileStep | 'complete'>('handle');
  navigate = setStep;
  return createElement(
    RelayActorProvider,
    { createEnvironment: environment },
    createElement(ActorProbe),
    createElement(
      Suspense,
      { fallback: createElement('Loading') },
      createElement(feature.FirstProfileOnboardingRoute, null, createElement(Probe, { step })),
    ),
  );
}
function renderTree() {
  return createElement(TestApp);
}
function displayedStep() {
  return renderer!.root.findAll((node) => String(node.type) === 'Draft')[0]!.props.step;
}
function displayedActor() {
  return renderer!.root.findAll((node) => String(node.type) === 'Actor')[0]!.props
    .selectedProfileId;
}
function environment(_token: string | null, actor: string | null) {
  const environment = new Environment({
    network: Network.create((request, variables) =>
      Observable.create((sink) => {
        requests.push({
          name: request.name,
          variables: JSON.parse(JSON.stringify(variables)) as Record<string, unknown>,
          sink,
          actor,
        });
      }),
    ),
    store: new Store(new RecordSource()),
  });
  if (actor === 'profile-1') {
    autoFollowEnvironment = environment;
  }
  if (actor === 'profile-1' && cachedAutoFollowPolicy) {
    environment.commitUpdate((store) => {
      const target = store.create(autoFollowTargetId, 'Profile');
      target.setValue(autoFollowTargetId, 'id');
      target.setValue('target', 'displayName');
      target.setValue('target', 'handle');
      target.setValue('@target', 'relativeHandle');
      target.setValue(cachedAutoFollowPolicy, 'followPolicy');
      target.setValue(4, 'followersCount');
      const viewerState = store.create(
        `client:${autoFollowTargetId}:viewerState`,
        'ProfileViewerState',
      );
      viewerState.setValue(false, 'isSelf');
      viewerState.setValue(null, 'follow');
      viewerState.setValue(null, 'followRequest');
      viewerState.setValue(null, 'profileBlock');
      target.setLinkedRecord(viewerState, 'viewerState');

      const follower = store.create('profile-1', 'Profile');
      follower.setValue('profile-1', 'id');
      follower.setValue(0, 'followingCount');
    });
  }
  return environment;
}
function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-1',
    handle: 'spring',
    relativeHandle: '@spring',
    displayName: 'spring',
    bio: null,
    followPolicy: 'OPEN',
    tags: [],
    avatar: null,
    header: null,
    private: { defaultPostVisibility: 'PUBLIC' },
    instance: { kind: 'LOCAL' },
    viewerState: { membership: { role: 'OWNER' } },
    ...overrides,
  };
}
function query(accountId = 'account-1', profileId: string | null = null, sessionId = 'session-1') {
  return {
    me: {
      id: accountId,
      profiles: profileId ? [profile({ id: profileId })] : [],
    },
    currentSession: {
      id: sessionId,
      selectedProfile: profileId ? profile({ id: profileId }) : null,
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
async function reject(name: string, error: Error) {
  const index = requests.findIndex((request) => request.name === name);
  assert.notEqual(
    index,
    -1,
    `missing ${name}; pending ${requests.map((request) => request.name).join(', ')}`,
  );
  const [request] = requests.splice(index, 1);
  await act(async () => request!.sink.error(error));
  return request!;
}
function autoFollowRequests() {
  return requests.filter((request) => request.name === 'FirstProfileOnboardingFollowMutation');
}
function followPayload(followPolicy: FollowPolicy) {
  const isRequest = followPolicy === 'APPROVAL_REQUIRED';
  const relationshipId = isRequest ? 'request-1' : 'follow-1';
  return {
    followProfile: {
      result: {
        __typename: isRequest ? 'ProfileFollowRequest' : 'ProfileFollow',
        id: relationshipId,
      },
      followerProfile: { id: 'profile-1', followingCount: isRequest ? 0 : 1 },
      followeeProfile: {
        id: autoFollowTargetId,
        displayName: 'target',
        handle: 'target',
        relativeHandle: '@target',
        followPolicy,
        followersCount: isRequest ? 4 : 5,
        viewerState: {
          isSelf: false,
          follow: isRequest
            ? null
            : { id: relationshipId, follower: { id: 'profile-1', followingCount: 1 } },
          followRequest: isRequest ? { id: relationshipId } : null,
          profileBlock: null,
        },
      },
    },
  };
}
function followButtonProfile(environment: Environment, owner: object): FollowButton_profile$data {
  const selector = getSelector(followButtonProfileFragment, {
    __id: autoFollowTargetId,
    __fragments: { FollowButton_profile: {} },
    __fragmentOwner: owner,
  });
  assert.ok(selector.kind === 'SingularReaderSelector');
  return environment.lookup(selector).data as FollowButton_profile$data;
}
function profileHeroProfile(environment: Environment, profileId: string, owner: object) {
  const selector = getSelector(profileHeroFragment, {
    __id: profileId,
    __fragments: { ProfileHero_profile: {} },
    __fragmentOwner: owner,
  });
  assert.ok(selector.kind === 'SingularReaderSelector');
  return environment.lookup(selector).data as ProfileHero_profile$data;
}
async function change(input: Partial<typeof flow.draft>) {
  await act(async () => flow.setDraft({ ...flow.draft, ...input }));
}
async function next(step: Exclude<FirstProfileStep, 'review'> = 'handle') {
  const destination = {
    handle: 'details',
    details: 'tags',
    tags: 'posting',
    posting: 'review',
  } as const;
  await act(async () => flow.next(step, () => navigate(destination[step])));
}
async function finish() {
  await act(async () => flow.complete(() => navigate('complete')));
}
async function skip(step: 'details' | 'tags' | 'posting') {
  const destination = { details: 'tags', tags: 'posting', posting: 'review' } as const;
  await act(async () => flow.skip(() => navigate(destination[step])));
}
async function createFirst() {
  await change({ handle: 'spring' });
  await next();
  await resolve('FirstProfileOnboardingCreateMutation', { createProfile: { profile: profile() } });
}
async function selected() {
  await resolve('FirstProfileOnboardingSelectMutation', {
    selectProfile: { profile: { id: 'profile-1' } },
  });
  if (requests.some((request) => request.name === 'FirstProfileOnboardingQuery')) {
    await resolve('FirstProfileOnboardingQuery', query('account-1', 'profile-1'));
  }
}
async function save(overrides: Record<string, unknown>) {
  await resolve('FirstProfileOnboardingSaveMutation', {
    updateProfile: { profile: profile(overrides) },
  });
}

before(async () => {
  feature = await import('./FirstProfileOnboardingRoute');
  ({ RelayActorProvider, useRelayActor } = await import('@/relay/RelayActorProvider'));
});
beforeEach(async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {},
  });
  globals.__KOSMO_CHANNEL__ = 'dev';
  requests = [];
  autoFollowEnvironment = null;
  cachedAutoFollowPolicy = null;
  storedProfileId = null;
  transferFailure = false;
  transferCount = 0;
  handledErrors = [];
  sessionValue = { accountId: 'account-1', sessionId: 'session-1', status: 'valid' };
  pickerResult = {
    canceled: false,
    assets: [{ uri: 'file:///avatar.png', width: 20, height: 20 }],
  };
  await act(async () => {
    renderer = create(renderTree());
  });
  await resolve('FirstProfileOnboardingQuery', query());
});
afterEach(async () => {
  try {
    await act(async () => renderer?.unmount());
    await act(async () => mock.timers.tick(300_001));
  } finally {
    mock.timers.reset();
    if (originalDocument) {
      Object.defineProperty(globalThis, 'document', originalDocument);
    } else {
      Reflect.deleteProperty(globalThis, 'document');
    }
    if (originalChannel === undefined) {
      delete globals.__KOSMO_CHANNEL__;
    } else {
      globals.__KOSMO_CHANNEL__ = originalChannel;
    }
    renderer = null;
  }
});

describe('first profile step mutations', () => {
  it('starts and saves the posting step with Public/Open defaults', async () => {
    await createFirst();
    await selected();
    await skip('details');
    await skip('tags');
    assert.equal(flow.draft.defaultPostVisibility, 'PUBLIC');
    await next('posting');
    assert.deepEqual(requests[0]!.variables, {
      input: { defaultPostVisibility: 'PUBLIC', followPolicy: 'OPEN' },
    });
    await save({});
    assert.equal(displayedStep(), 'review');
    assert.equal(flow.summary?.draft.defaultPostVisibility, 'PUBLIC');
    assert.equal(flow.summary?.draft.followPolicy, 'OPEN');
  });

  for (const action of ['skip', 'complete'] as const) {
    it(`keeps saved Public when ${action} discards an unsaved Unlisted selection`, async () => {
      await createFirst();
      await selected();
      await skip('details');
      await skip('tags');
      await change({ defaultPostVisibility: 'UNLISTED' });
      if (action === 'skip') {
        await skip('posting');
      } else {
        await finish();
      }
      assert.equal(displayedStep(), action === 'skip' ? 'review' : 'complete');
      assert.equal(flow.summary?.draft.defaultPostVisibility, 'PUBLIC');
      assert.equal(flow.summary?.draft.followPolicy, 'OPEN');
      assert.equal(requests.length, 0);
    });
  }

  it('creates and selects on handle Next before advancing and ignores repeated pending actions', async () => {
    await change({ handle: 'spring' });
    assert.equal(requests.length, 0);
    await next();
    await next();
    assert.equal(displayedStep(), 'handle');
    assert.deepEqual(
      requests.map((request) => request.name),
      ['FirstProfileOnboardingCreateMutation'],
    );
    await resolve('FirstProfileOnboardingCreateMutation', {
      createProfile: { profile: profile() },
    });
    assert.equal(displayedStep(), 'handle');
    await selected();
    assert.equal(displayedStep(), 'details');
    assert.equal(flow.createdProfile?.id, 'profile-1');
    assert.equal(storedProfileId, 'profile-1');
    assert.equal(requests.length, 0);
  });

  it('creates and selects on handle immediate completion without saving optional inputs', async () => {
    await change({ handle: 'spring' });
    await finish();
    await resolve('FirstProfileOnboardingCreateMutation', {
      createProfile: { profile: profile() },
    });
    await selected();
    assert.equal(displayedStep(), 'complete');
    assert.equal(flow.result.kind, 'success');
    assert.equal(storedProfileId, 'profile-1');
    assert.equal(requests.length, 0);
  });

  it('starts the configured follow in the selected actor before immediate completion navigates', async () => {
    globals.__KOSMO_CHANNEL__ = 'prod';
    await change({ handle: 'spring' });
    await finish();
    await resolve('FirstProfileOnboardingCreateMutation', {
      createProfile: { profile: profile() },
    });
    await selected();

    assert.equal(displayedStep(), 'complete');
    assert.equal(flow.result.kind, 'success');
    assert.equal(storedProfileId, 'profile-1');
    assert.equal(actorControls.selectedProfileId, 'profile-1');
    assert.deepEqual(
      autoFollowRequests().map(({ actor, variables }) => ({ actor, variables })),
      [{ actor: 'profile-1', variables: { id: 'AZ-3YxIdfz2WSjjntTzIgFByb2ZpbGU' } }],
    );

    await resolve('FirstProfileOnboardingFollowMutation', followPayload('APPROVAL_REQUIRED'));
    assert.equal(actorControls.selectedProfileId, 'profile-1');
    assert.equal(displayedStep(), 'complete');
    assert.deepEqual(handledErrors, []);
    assert.equal(requests.length, 0);
  });

  it('keeps actor B after a rerender and late actor A follow response', async () => {
    globals.__KOSMO_CHANNEL__ = 'prod';
    await createFirst();
    await selected();

    assert.equal(displayedStep(), 'details');
    assert.deepEqual(
      autoFollowRequests().map((request) => request.actor),
      ['profile-1'],
    );
    await change({ bio: '다시 렌더링' });
    assert.equal(autoFollowRequests().length, 1);
    await act(async () => {
      assert.equal(actorControls.resetCurrentActor('profile-2'), true);
    });
    assert.equal(displayedActor(), 'profile-2');
    assert.deepEqual(
      autoFollowRequests().map((request) => request.actor),
      ['profile-1'],
    );

    const profileBQuery = await resolve(
      'FirstProfileOnboardingQuery',
      query('account-1', 'profile-2'),
    );
    assert.equal(profileBQuery.actor, 'profile-2');
    assert.equal(displayedActor(), 'profile-2');
    assert.equal(renderer!.root.findAll((node) => String(node.type) === 'StateView').length, 1);
    assert.equal(renderer!.root.findAll((node) => String(node.type) === 'Draft').length, 0);

    const profileAFollow = await resolve(
      'FirstProfileOnboardingFollowMutation',
      followPayload('OPEN'),
    );
    assert.equal(profileAFollow.actor, 'profile-1');
    assert.equal(displayedActor(), 'profile-2');
    assert.equal(renderer!.root.findAll((node) => String(node.type) === 'StateView').length, 1);
    assert.equal(renderer!.root.findAll((node) => String(node.type) === 'Draft').length, 0);
    assert.equal(autoFollowRequests().length, 0);
    assert.equal(requests.length, 0);
  });

  for (const followPolicy of ['OPEN', 'APPROVAL_REQUIRED'] as const) {
    it(`normalizes the ${followPolicy} auto-follow into an already loaded FollowButton profile`, async () => {
      globals.__KOSMO_CHANNEL__ = 'prod';
      cachedAutoFollowPolicy = followPolicy;
      await createFirst();
      await selected();

      const environment = autoFollowEnvironment;
      assert.ok(environment);
      assert.equal(autoFollowRequests().length, 1);
      const operation = createOperationDescriptor(autoFollowMutation, {
        id: autoFollowTargetId,
      }).request;
      const before = followButtonProfile(environment, operation);
      assert.equal(before.viewerState?.isSelf, false);
      assert.equal(Boolean(before.viewerState?.follow), false);
      assert.equal(Boolean(before.viewerState?.followRequest), false);
      assert.equal(before.followersCount, 4);
      assert.equal(profileHeroProfile(environment, 'profile-1', operation).followingCount, 0);

      await resolve('FirstProfileOnboardingFollowMutation', followPayload(followPolicy));

      const after = followButtonProfile(environment, operation);
      const isRequest = followPolicy === 'APPROVAL_REQUIRED';
      assert.equal(Boolean(after.viewerState?.follow), !isRequest);
      assert.equal(Boolean(after.viewerState?.followRequest), isRequest);
      assert.equal(after.followersCount, isRequest ? 4 : 5);
      assert.equal(
        profileHeroProfile(environment, 'profile-1', operation).followingCount,
        isRequest ? 0 : 1,
      );
      if (!isRequest) {
        assert.equal(after.viewerState?.follow?.follower?.id, 'profile-1');
        assert.equal(after.viewerState?.follow?.follower?.followingCount, 1);
      }
      assert.equal(handledErrors.length, 0);
    });
  }

  it('does not start the automatic follow in the dev channel', async () => {
    globals.__KOSMO_CHANNEL__ = 'dev';
    await createFirst();
    await selected();

    assert.equal(displayedStep(), 'details');
    assert.equal(autoFollowRequests().length, 0);
    assert.equal(requests.length, 0);
  });

  it('retains the handle after create failure and retries without a recovery query', async () => {
    await change({ handle: 'spring' });
    await next();
    await resolve('FirstProfileOnboardingCreateMutation', null, [
      { message: 'create unavailable', path: ['createProfile'] },
    ]);
    assert.equal(displayedStep(), 'handle');
    assert.equal(flow.createdProfile, null);
    assert.equal(flow.draft.handle, 'spring');
    assert.equal(flow.result.kind, 'error');
    assert.equal(flow.busy, false);
    assert.equal(requests.length, 0);
    await next();
    assert.equal(requests[0]!.name, 'FirstProfileOnboardingCreateMutation');
  });

  it('shows a handle conflict at the input and retries the corrected handle', async () => {
    await change({ handle: 'spring' });
    await next();
    await resolve('FirstProfileOnboardingCreateMutation', null, [
      {
        message: '이미 사용 중인 핸들이에요.',
        extensions: { code: 'CONFLICT', field: 'handle' },
        path: ['createProfile'],
      },
    ]);
    assert.equal(flow.errors.handle, '이미 사용 중인 핸들이에요.');
    assert.equal(flow.draft.handle, 'spring');
    assert.equal(requests.length, 0);
    await change({ handle: 'another_spring' });
    await next();
    assert.equal(requests[0]!.variables.handle, 'another_spring');
  });

  it('retains the created identity on selection failure and retries selection without recreating', async () => {
    globals.__KOSMO_CHANNEL__ = 'prod';
    await createFirst();
    await resolve('FirstProfileOnboardingSelectMutation', null, [
      { message: 'selection unavailable' },
    ]);
    assert.equal(displayedStep(), 'handle');
    assert.equal(flow.createdProfile?.id, 'profile-1');
    assert.equal(flow.result.kind, 'error');
    assert.equal(autoFollowRequests().length, 0);
    await next();
    assert.deepEqual(
      requests.map((request) => request.name),
      ['FirstProfileOnboardingSelectMutation'],
    );
    await selected();
    assert.equal(displayedStep(), 'details');
    assert.equal(storedProfileId, 'profile-1');
    assert.deepEqual(
      autoFollowRequests().map((request) => request.actor),
      ['profile-1'],
    );
  });

  for (const failureKind of ['graphql', 'network'] as const) {
    it(`logs a ${failureKind} auto-follow failure and continues onboarding`, async () => {
      globals.__KOSMO_CHANNEL__ = 'prod';
      await createFirst();
      await selected();

      assert.equal(displayedStep(), 'details');
      assert.equal(flow.result.kind, 'idle');
      assert.equal(actorControls.selectedProfileId, 'profile-1');
      assert.deepEqual(
        autoFollowRequests().map((request) => request.actor),
        ['profile-1'],
      );
      if (failureKind === 'graphql') {
        await resolve('FirstProfileOnboardingFollowMutation', null, [
          { message: 'follow unavailable', path: ['followProfile'] },
        ]);
      } else {
        await reject('FirstProfileOnboardingFollowMutation', new Error('network unavailable'));
      }

      assert.equal(handledErrors.length, 1);
      assert.ok(handledErrors[0]!.error instanceof Error);
      assert.equal(handledErrors[0]!.context?.operation, 'first_profile_auto_follow');
      assert.equal(displayedStep(), 'details');
      assert.equal(flow.result.kind, 'idle');
      assert.equal(flow.busy, false);
      assert.equal(actorControls.selectedProfileId, 'profile-1');
      assert.equal(autoFollowRequests().length, 0);
      assert.equal(requests.length, 0);
    });
  }

  it('saves only the current step and does not select the actor again for optional updates', async () => {
    await createFirst();
    await selected();
    await change({
      displayName: '봄',
      bio: '소개',
      tagInput: 'bad tag',
      defaultPostVisibility: 'FOLLOWERS',
      followPolicy: 'APPROVAL_REQUIRED',
    });
    await next('details');
    assert.equal(displayedStep(), 'details');
    assert.deepEqual(requests[0]!.variables, { input: { displayName: '봄', bio: '소개' } });
    assert.equal(requests[0]!.actor, 'profile-1');
    await save({ displayName: '봄', bio: '소개' });
    assert.equal(displayedStep(), 'tags');
    assert.equal(flow.summary?.draft.displayName, '봄');
    await change({ tagInput: '#책' });
    await next('tags');
    assert.deepEqual(requests[0]!.variables, { input: { tags: ['책'] } });
    await save({ displayName: '봄', bio: '소개', tags: [{ id: 'tag-book', name: '책' }] });
    assert.equal(displayedStep(), 'posting');
    await next('posting');
    assert.deepEqual(requests[0]!.variables, {
      input: { defaultPostVisibility: 'FOLLOWERS', followPolicy: 'APPROVAL_REQUIRED' },
    });
    await save({
      displayName: '봄',
      bio: '소개',
      tags: [{ id: 'tag-book', name: '책' }],
      followPolicy: 'APPROVAL_REQUIRED',
      private: { defaultPostVisibility: 'FOLLOWERS' },
    });
    assert.equal(displayedStep(), 'review');
    assert.equal(flow.createdProfile?.id, 'profile-1');
    await finish();
    assert.equal(displayedStep(), 'complete');
    assert.equal(requests.length, 0);
  });

  it('keeps a failed optional draft and lets skip and completion proceed without another mutation', async () => {
    await createFirst();
    await selected();
    await change({ displayName: '저장되지 않은 이름', bio: '남겨 둔 소개' });
    await next('details');
    await resolve('FirstProfileOnboardingSaveMutation', null, [{ message: 'save unavailable' }]);
    assert.equal(displayedStep(), 'details');
    assert.equal(flow.result.kind, 'error');
    assert.equal(flow.createdProfile?.id, 'profile-1');
    assert.equal(flow.draft.bio, '남겨 둔 소개');
    assert.equal(flow.summary?.draft.displayName, 'spring');
    await skip('details');
    assert.equal(displayedStep(), 'tags');
    assert.equal(flow.draft.displayName, '저장되지 않은 이름');
    assert.equal(flow.summary?.draft.displayName, 'spring');
    await finish();
    assert.equal(displayedStep(), 'complete');
    assert.equal(flow.result.kind, 'success');
    assert.equal(requests.length, 0);
    assert.equal(flow.createdProfile?.id, 'profile-1');
  });

  it('keeps the flow usable when a successful save has a nullable summary field error', async () => {
    await createFirst();
    await selected();
    await change({ displayName: '저장한 이름' });
    await next('details');
    await resolve(
      'FirstProfileOnboardingSaveMutation',
      { updateProfile: { profile: profile({ displayName: '저장한 이름', private: null }) } },
      [
        {
          message: 'private projection unavailable',
          path: ['updateProfile', 'profile', 'private'],
        },
      ],
    );
    assert.equal(displayedStep(), 'tags');
    assert.equal(flow.createdProfile?.id, 'profile-1');
    assert.equal(flow.summary, null);
    await skip('tags');
    assert.equal(displayedStep(), 'posting');
    await finish();
    assert.equal(displayedStep(), 'complete');
    assert.equal(flow.result.kind, 'success');
    assert.equal(flow.summary, null);
    assert.equal(requests.length, 0);
  });

  it('completes directly after an optional save failure without retrying the save', async () => {
    await createFirst();
    await selected();
    await change({ displayName: '저장되지 않은 이름' });
    await next('details');
    await resolve('FirstProfileOnboardingSaveMutation', null, [{ message: 'save unavailable' }]);
    await finish();
    assert.equal(displayedStep(), 'complete');
    assert.equal(flow.createdProfile?.id, 'profile-1');
    assert.equal(flow.summary?.draft.displayName, 'spring');
    assert.equal(flow.result.kind, 'success');
    assert.equal(requests.length, 0);
  });

  it('allows skipping invalid optional fields without validation or mutation', async () => {
    await createFirst();
    await selected();
    await change({ displayName: '이'.repeat(41), tagInput: 'bad tag' });
    await next('details');
    assert.equal(displayedStep(), 'details');
    assert.ok(flow.errors.displayName);
    await skip('details');
    await skip('tags');
    await finish();
    assert.equal(displayedStep(), 'complete');
    assert.equal(requests.length, 0);
  });

  it('reuses a completed image upload on save retry and never recreates the Profile', async () => {
    await createFirst();
    await selected();
    await act(async () => flow.pickImage('avatar'));
    transferFailure = true;
    await next('details');
    await resolve('FirstProfileOnboardingIssueMediaMutation', {
      issueMediaUploadUrl: { media: { id: 'media-1' }, uploadUrl: 'https://upload.example/one' },
    });
    assert.equal(displayedStep(), 'details');
    assert.equal(flow.result.kind, 'error');
    assert.equal(flow.images.avatar.asset?.uri, 'file:///avatar.png');
    transferFailure = false;
    await next('details');
    await resolve('FirstProfileOnboardingIssueMediaMutation', {
      issueMediaUploadUrl: { media: { id: 'media-2' }, uploadUrl: 'https://upload.example/two' },
    });
    await resolve('FirstProfileOnboardingCompleteMediaMutation', {
      completeMediaUpload: { media: { id: 'media-2', state: 'READY' } },
    });
    await resolve('FirstProfileOnboardingSaveMutation', null, [{ message: 'save unavailable' }]);
    await next('details');
    assert.deepEqual(
      requests.map((request) => request.name),
      ['FirstProfileOnboardingSaveMutation'],
    );
    assert.equal((requests[0]!.variables.input as { avatarId: string }).avatarId, 'media-2');
    await save({ avatar: { id: 'media-2', url: 'https://media.example/avatar' } });
    assert.equal(displayedStep(), 'tags');
    assert.equal(flow.createdProfile?.id, 'profile-1');
    assert.equal(transferCount, 2);
  });

  it('redirects a new entry with an existing Profile instead of resuming by handle', async () => {
    await createFirst();
    await selected();
    assert.equal(displayedStep(), 'details');
    await act(async () => {
      renderer!.unmount();
      renderer = create(renderTree());
    });
    await resolve('FirstProfileOnboardingQuery', query('account-1', 'profile-1'));
    const redirects = renderer!.root.findAll((node) => String(node.type) === 'Redirect');
    assert.equal(redirects.length, 1);
    assert.equal(redirects[0]!.props.href, '/home');
    assert.equal(renderer!.root.findAll((node) => String(node.type) === 'Draft').length, 0);
    assert.equal(requests.length, 0);
  });

  it('keeps the active Profile through a failed post-selection query and boundary retry', async () => {
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
    await act(async () => errorViews[0]!.props.onAction());
    await resolve('FirstProfileOnboardingQuery', query('account-1', 'profile-1'));
    assert.equal(displayedStep(), 'details');
    assert.equal(flow.createdProfile?.id, 'profile-1');
    assert.equal(flow.draft.handle, 'spring');
    await finish();
    assert.equal(displayedStep(), 'complete');
    assert.equal(requests.length, 0);
  });

  it('clears the active draft and created identity after the authentication lifecycle changes', async () => {
    await createFirst();
    await selected();
    await change({ displayName: '계정별 초안' });
    sessionValue = { accountId: 'account-2', sessionId: 'session-2', status: 'valid' };
    await act(async () => actorControls.resetSession());
    await resolve('FirstProfileOnboardingQuery', query('account-2', null, 'session-2'));
    assert.equal(flow.createdProfile, null);
    assert.equal(flow.draft.handle, '');
    assert.equal(flow.draft.displayName, '');
    await change({ handle: 'second_account' });
    await next();
    assert.equal(requests[0]!.variables.handle, 'second_account');
  });
});
