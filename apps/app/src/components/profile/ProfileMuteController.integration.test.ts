import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import MuteMutation from './__generated__/ProfileMuteControllerMuteMutation.graphql';
import UnmuteMutation from './__generated__/ProfileMuteControllerUnmuteMutation.graphql';
import { getProfileMuteConnectionId } from './profileMuteCache';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { useProfileMuteMutations as UseProfileMuteMutations } from './ProfileMuteController';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ProfileMuteController = {
  changeMuted: (
    change: {
      ownerProfileId: string;
      profileMuteId?: string | null;
      targetProfileId: string;
    },
    nextMuted: boolean,
  ) => Promise<void>;
};

type PendingRequest = {
  sink: {
    complete(): void;
    error(error: Error): void;
    next(payload: GraphQLResponse): void;
  };
  settled: boolean;
};

const generationRef = { current: 1 };
let selectedProfileId: string | null = 'profile:owner-a';
let refreshCalls = 0;
let renderer: ReactTestRenderer | null = null;
let pendingRequests: PendingRequest[] = [];
let controller: ProfileMuteController | null = null;
let ControllerProbe: ComponentType;

mock.module('react-relay', {
  exports: {
    ...ReactRelay,
    graphql: (parts: TemplateStringsArray) => {
      const source = parts.join('');
      if (source.includes('ProfileMuteControllerMuteMutation')) {
        return MuteMutation;
      }
      if (source.includes('ProfileMuteControllerUnmuteMutation')) {
        return UnmuteMutation;
      }
      throw new Error('Unexpected GraphQL document.');
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/shell/ShellChromeContext', {
  exports: {
    useShellChrome: () => ({
      refreshProfileMuteTimelines: () => {
        refreshCalls += 1;
      },
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/relay/RelayEnvironmentBoundary', {
  exports: { useRelayEnvironmentGeneration: () => generationRef },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/session/SessionProvider', {
  exports: { useSession: () => ({ selectedProfileId }) },
} as unknown as Parameters<typeof mock.module>[1]);

let useProfileMuteMutations: typeof UseProfileMuteMutations;

before(async () => {
  ({ useProfileMuteMutations } = await import('./ProfileMuteController'));
  ControllerProbe = () => {
    controller = useProfileMuteMutations();
    return null;
  };
});

afterEach(async () => {
  await act(async () => {
    for (const request of pendingRequests) {
      if (!request.settled) {
        request.settled = true;
        request.sink.complete();
      }
    }
  });
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  controller = null;
  pendingRequests = [];
  generationRef.current = 1;
  selectedProfileId = 'profile:owner-a';
  refreshCalls = 0;
});

describe('ProfileMuteController real Relay mutation contract', () => {
  it('mute normalizes viewerState and inserts only a loaded owner connection', async () => {
    const { environment, ownerA, targetA } = createEnvironment({
      loadOwnerAConnection: true,
      loadOwnerBConnection: false,
    });
    await renderController(environment);

    const request = startChangeMuted({ ownerProfileId: ownerA, targetProfileId: targetA }, true);
    const pending = pendingRequests[0];
    assert.ok(pending);
    await respond(pending, muteResponse('profile-mute:new', targetA));
    await request;

    assert.equal(viewerStateMuteId(environment, targetA), 'profile-mute:new');
    assert.deepEqual(connectionNodeIds(environment, getProfileMuteConnectionId(ownerA)), [
      'profile-mute:new',
    ]);
    assert.equal(
      environment.getStore().getSource().get(getProfileMuteConnectionId('profile:owner-b')),
      undefined,
    );
  });

  it('mute with a partial GraphQL error keeps viewer state and connection unchanged', async () => {
    const { environment, ownerA, targetA } = createEnvironment({
      loadOwnerAConnection: true,
      loadOwnerBConnection: false,
    });
    await renderController(environment);

    const request = startChangeMuted({ ownerProfileId: ownerA, targetProfileId: targetA }, true);
    const rejection = request?.catch((error: unknown) => error);
    const pending = pendingRequests[0];
    assert.ok(pending);
    await respond(pending, {
      data: mutePayload('profile-mute:partial', targetA),
      errors: [{ message: 'partial mute failure' }],
    });

    assert.match(String(await rejection), /partial mute failure/);
    assert.equal(viewerStateMuteId(environment, targetA), null);
    assert.deepEqual(connectionNodeIds(environment, getProfileMuteConnectionId(ownerA)), []);
    assert.equal(refreshCalls, 0);
  });

  it('mute does not create an unloaded owner connection', async () => {
    const { environment, ownerA, targetA } = createEnvironment({
      loadOwnerAConnection: false,
      loadOwnerBConnection: false,
    });
    await renderController(environment);

    const request = startChangeMuted({ ownerProfileId: ownerA, targetProfileId: targetA }, true);
    const pending = pendingRequests[0];
    assert.ok(pending);
    await respond(pending, muteResponse('profile-mute:unloaded', targetA));
    await request;

    assert.equal(
      environment.getStore().getSource().get(getProfileMuteConnectionId(ownerA)),
      undefined,
    );
    assert.equal(viewerStateMuteId(environment, targetA), 'profile-mute:unloaded');
  });

  it('nullable unmute success removes the exact owner relation and target viewer state', async () => {
    const { environment, ownerA, ownerB, targetA, targetB } = createEnvironment({
      loadOwnerAConnection: true,
      loadOwnerBConnection: true,
      ownerARelationId: 'profile-mute:a',
      ownerBRelationId: 'profile-mute:b',
      targetARelationId: 'profile-mute:a',
      targetBRelationId: 'profile-mute:b',
    });
    selectedProfileId = ownerA;
    await renderController(environment);

    const request = startChangeMuted(
      {
        ownerProfileId: ownerA,
        profileMuteId: 'profile-mute:a',
        targetProfileId: targetA,
      },
      false,
    );
    const pending = pendingRequests[0];
    assert.ok(pending);
    await respond(pending, {
      data: { unmuteProfile: { profileMuteId: null } },
    });
    await request;

    assert.equal(viewerStateMuteId(environment, targetA), null);
    assert.deepEqual(connectionNodeIds(environment, getProfileMuteConnectionId(ownerA)), []);
    assert.equal(environment.getStore().getSource().get('profile-mute:a'), null);
    assert.equal(viewerStateMuteId(environment, targetB), 'profile-mute:b');
    assert.deepEqual(connectionNodeIds(environment, getProfileMuteConnectionId(ownerB)), [
      'profile-mute:b',
    ]);
    assert.equal(refreshCalls, 1);
  });

  it('network errors preserve the existing unmute relation and do not refresh timelines', async () => {
    const { environment, ownerA, targetA } = createEnvironment({
      loadOwnerAConnection: true,
      loadOwnerBConnection: false,
      ownerARelationId: 'profile-mute:active',
      targetARelationId: 'profile-mute:active',
    });
    await renderController(environment);

    const request = startChangeMuted(
      {
        ownerProfileId: ownerA,
        profileMuteId: 'profile-mute:active',
        targetProfileId: targetA,
      },
      false,
    );
    const rejection = request?.catch((error: unknown) => error);
    const pending = pendingRequests[0];
    assert.ok(pending);
    await act(async () => {
      pending.settled = true;
      pending.sink.error(new Error('network failure'));
    });

    assert.match(String(await rejection), /network failure/);
    assert.equal(viewerStateMuteId(environment, targetA), 'profile-mute:active');
    assert.deepEqual(connectionNodeIds(environment, getProfileMuteConnectionId(ownerA)), [
      'profile-mute:active',
    ]);
    assert.equal(refreshCalls, 0);
  });

  it('a delayed actor A response cannot mutate actor B or refresh actor B', async () => {
    const actorA = createEnvironment({
      loadOwnerAConnection: true,
      loadOwnerBConnection: false,
    });
    const actorB = createEnvironment({
      loadOwnerAConnection: false,
      loadOwnerBConnection: true,
    });
    selectedProfileId = actorA.ownerA;
    await renderController(actorA.environment);

    const request = startChangeMuted(
      { ownerProfileId: actorA.ownerA, targetProfileId: actorA.targetA },
      true,
    );
    const rejection = request?.catch((error: unknown) => error);
    const pending = pendingRequests[0];
    assert.ok(pending);

    selectedProfileId = actorB.ownerB;
    generationRef.current = 2;
    await act(async () => {
      renderer?.update(
        createElement(ReactRelay.RelayEnvironmentProvider, {
          environment: actorB.environment,
          children: createElement(ControllerProbe),
        }),
      );
    });

    await respond(pending, muteResponse('profile-mute:actor-a', actorA.targetA));
    assert.match(String(await rejection), /inactive Profile/);
    assert.equal(viewerStateMuteId(actorB.environment, actorA.targetA), null);
    assert.deepEqual(
      connectionNodeIds(actorB.environment, getProfileMuteConnectionId(actorB.ownerB)),
      [],
    );
    assert.equal(refreshCalls, 0);
  });
});

function createEnvironment(options: {
  loadOwnerAConnection: boolean;
  loadOwnerBConnection: boolean;
  ownerARelationId?: string;
  ownerBRelationId?: string;
  targetARelationId?: string;
  targetBRelationId?: string;
}) {
  const ownerA = 'profile:owner-a';
  const ownerB = 'profile:owner-b';
  const targetA = 'profile:target-a';
  const targetB = 'profile:target-b';
  const source = new RecordSource({
    [ownerA]: { __id: ownerA, __typename: 'Profile', id: ownerA },
    [ownerB]: { __id: ownerB, __typename: 'Profile', id: ownerB },
    [targetA]: {
      __id: targetA,
      __typename: 'Profile',
      id: targetA,
      viewerState: { __ref: 'viewer-state:target-a' },
    },
    [targetB]: {
      __id: targetB,
      __typename: 'Profile',
      id: targetB,
      viewerState: { __ref: 'viewer-state:target-b' },
    },
    'viewer-state:target-a': {
      __id: 'viewer-state:target-a',
      __typename: 'ProfileViewerState',
      ...(options.targetARelationId ? { profileMute: { __ref: options.targetARelationId } } : {}),
    },
    'viewer-state:target-b': {
      __id: 'viewer-state:target-b',
      __typename: 'ProfileViewerState',
      ...(options.targetBRelationId ? { profileMute: { __ref: options.targetBRelationId } } : {}),
    },
  });
  const environment = new Environment({
    network: Network.create(() =>
      Observable.create((sink) => {
        const request: PendingRequest = { settled: false, sink };
        pendingRequests.push(request);
      }),
    ),
    store: new Store(source),
  });

  for (const [ownerId, relationId, loaded] of [
    [ownerA, options.ownerARelationId, options.loadOwnerAConnection],
    [ownerB, options.ownerBRelationId, options.loadOwnerBConnection],
  ] as const) {
    if (!loaded) {
      continue;
    }
    const connectionId = getProfileMuteConnectionId(ownerId);
    const edgeId = connectionId + ':edge';
    source.set(connectionId, {
      __id: connectionId,
      __typename: '__Connection',
      edges: relationId ? { __refs: [edgeId] } : { __refs: [] },
    });
    if (relationId) {
      source.set(edgeId, {
        __id: edgeId,
        __typename: 'ProfileMuteConnectionEdge',
        cursor: relationId + ':cursor',
        node: { __ref: relationId },
      });
      source.set(relationId, {
        __id: relationId,
        __typename: 'ProfileMute',
        id: relationId,
      });
    }
  }

  return { environment, ownerA, ownerB, targetA, targetB };
}

function renderController(environment: Environment) {
  return act(async () => {
    renderer = create(
      createElement(ReactRelay.RelayEnvironmentProvider, {
        environment,
        children: createElement(ControllerProbe),
      }),
    );
  });
}

function startChangeMuted(
  change: {
    ownerProfileId: string;
    profileMuteId?: string | null;
    targetProfileId: string;
  },
  nextMuted: boolean,
) {
  let request!: Promise<void>;
  act(() => {
    request = controller!.changeMuted(change, nextMuted);
  });
  return request;
}

function respond(request: PendingRequest, payload: GraphQLResponse) {
  return act(async () => {
    request.settled = true;
    request.sink.next(payload);
    request.sink.complete();
  });
}

function muteResponse(relationId: string, targetProfileId: string): GraphQLResponse {
  return {
    data: mutePayload(relationId, targetProfileId),
  };
}

function mutePayload(relationId: string, targetProfileId: string) {
  return {
    muteProfile: {
      profileMute: {
        __typename: 'ProfileMute',
        id: relationId,
        targetProfile: {
          __typename: 'Profile',
          id: targetProfileId,
          viewerState: {
            __typename: 'ProfileViewerState',
            profileMute: {
              __typename: 'ProfileMute',
              id: relationId,
            },
          },
        },
      },
    },
  };
}

function viewerStateMuteId(environment: Environment, targetProfileId: string) {
  const target = environment.getStore().getSource().get(targetProfileId);
  const viewerStateId = target?.viewerState?.__ref;
  const relation = viewerStateId
    ? environment.getStore().getSource().get(viewerStateId)?.profileMute
    : undefined;
  return relation?.__ref ?? null;
}

function connectionNodeIds(environment: Environment, connectionId: string) {
  const source = environment.getStore().getSource();
  const edgeIds = source.get(connectionId)?.edges?.__refs ?? [];
  return edgeIds.map((edgeId: string) => source.get(edgeId)?.node?.__ref);
}
