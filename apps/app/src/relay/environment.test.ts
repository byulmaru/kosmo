import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import { loadQuery } from 'react-relay';
import {
  createOperationDescriptor,
  createReaderSelector,
  fetchQuery,
  getFragment,
  getRequest,
  handlePotentialSnapshotErrors,
} from 'relay-runtime';
import PostDetailQueryArtifact from '../app/(tabs)/(post)/[profileHandle]/__generated__/PostDetailQuery.graphql';
import ProfileSwitcherFragment from '../components/shell/__generated__/ProfileSwitcher_query.graphql';
import UniversalShellQueryArtifact from '../components/shell/__generated__/UniversalShellQuery.graphql';
import type { RelayFieldLogger } from 'relay-runtime';
import type { createRelayEnvironment as CreateRelayEnvironment } from './environment';

type RelayFieldLoggerEvent = Parameters<RelayFieldLogger>[0];

type CaptureCall = {
  context: Readonly<Record<string, string | number | boolean>> | undefined;
  message: string;
};

const captureCalls: CaptureCall[] = [];

mock.module('@/observability/sentry', {
  exports: {
    captureHandledMessage: (
      message: string,
      context?: Readonly<Record<string, string | number | boolean>>,
    ) => {
      captureCalls.push({ context, message });
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

let createRelayEnvironment: typeof CreateRelayEnvironment;

before(async () => {
  ({ createRelayEnvironment } = await import('./environment'));
});

beforeEach(() => {
  captureCalls.length = 0;
});

describe('Relay environment diagnostics', () => {
  it('captures and deduplicates missing ProfileSwitcher paths from a Relay partial read', async () => {
    const payload = {
      currentSession: {
        id: 'session-1',
        unreadNotificationCount: 0,
        selectedProfile: {
          id: 'profile-a',
          displayName: 'Profile A',
          followingCount: 0,
          followersCount: 0,
          instance: { kind: 'LOCAL' },
          viewerState: { membership: { id: 'membership-a', role: 'OWNER' } },
          avatar: null,
          header: null,
          private: { defaultPostVisibility: 'PUBLIC' },
          unreadNotificationCount: 0,
        },
      },
      me: {
        id: 'account-1',
        profiles: [],
      },
    };
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'https://kos.moe' } },
    });
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: payload }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });

    try {
      const environment = createRelayEnvironment(null);
      const shell = createOperationDescriptor(getRequest(UniversalShellQueryArtifact), {});
      const profileSwitcherSelector = createReaderSelector(
        getFragment(ProfileSwitcherFragment),
        'client:root',
        {},
        shell.request,
      );

      await readPartialProfile(environment, profileSwitcherSelector);
      await readPartialProfile(environment, profileSwitcherSelector);

      const duplicateEvent = {
        fieldPath: 'currentSession.selectedProfile.handle',
        kind: 'missing_expected_data.log',
        owner: 'ProfileSwitcher_query',
        accountId: 'account-secret',
        handle: '@private-handle',
        profileId: 'profile-secret',
        response: { displayName: 'Private name' },
        variables: { id: 'profile-secret' },
      } as unknown as RelayFieldLoggerEvent;
      environment.relayFieldLogger(duplicateEvent);
      environment.relayFieldLogger({
        ...duplicateEvent,
        owner: 'UniversalShellQuery',
      });
      environment.relayFieldLogger({
        ...duplicateEvent,
        kind: 'missing_required_field.log',
      });

      assert.deepEqual(
        captureCalls.map(({ context }) => ({
          fieldPath: context?.relay_field_path,
          owner: context?.relay_owner,
        })),
        [
          {
            fieldPath: 'currentSession.selectedProfile.handle',
            owner: 'ProfileSwitcher_query',
          },
          {
            fieldPath: 'currentSession.selectedProfile.relativeHandle',
            owner: 'ProfileSwitcher_query',
          },
          {
            fieldPath: 'currentSession.selectedProfile.handle',
            owner: 'UniversalShellQuery',
          },
        ],
      );

      for (const call of captureCalls) {
        assert.equal(call.message, 'Relay missing expected data');
        assert.ok(call.context);
        assert.deepEqual(Object.keys(call.context).sort(), [
          'relay_environment_age_ms',
          'relay_field_path',
          'relay_kind',
          'relay_owner',
        ]);
        assert.equal(call.context.relay_kind, 'missing_expected_data.log');
        const ageMilliseconds = call.context.relay_environment_age_ms;
        assert.equal(typeof ageMilliseconds, 'number');
        assert.ok((ageMilliseconds as number) >= 0);
      }

      const secondEnvironment = createRelayEnvironment(null);
      secondEnvironment.relayFieldLogger(duplicateEvent);
      assert.equal(captureCalls.length, 4);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });
});

describe('Relay Post node cache', () => {
  it('links Query.node to a cached Post only in the current environment store', () => {
    const postId = 'cached-post';
    const operation = createOperationDescriptor(getRequest(PostDetailQueryArtifact), { postId });
    const actorAEnvironment = createRelayEnvironment(null, 'profile-a');
    const actorBEnvironment = createRelayEnvironment(null, 'profile-b');

    actorAEnvironment.commitUpdate((store) => {
      store.create(postId, 'Post').setValue(postId, 'id');
    });
    actorAEnvironment.check(operation);
    assert.equal(readPostNodeId(actorAEnvironment, operation), postId);

    actorBEnvironment.check(operation);
    assert.equal(readPostNodeId(actorBEnvironment, operation), undefined);

    const wrongTypeEnvironment = createRelayEnvironment(null, 'profile-c');
    wrongTypeEnvironment.commitUpdate((store) => {
      store.create(postId, 'Profile').setValue(postId, 'id');
    });
    wrongTypeEnvironment.check(operation);
    assert.equal(readPostNodeId(wrongTypeEnvironment, operation), undefined);
  });

  it('uses the network when the requested node is absent or is not a Post', async () => {
    const environment = createRelayEnvironment(null);
    const wrongTypeId = 'profile-instead-of-post';
    environment.commitUpdate((store) => {
      store.create(wrongTypeId, 'Profile').setValue(wrongTypeId, 'id');
    });

    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    let requestCount = 0;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'https://kos.moe' } },
    });
    globalThis.fetch = async () => {
      requestCount += 1;
      return new Response(
        JSON.stringify({
          data: {
            currentSession: { id: 'session-1', selectedProfile: null },
            node: null,
          },
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      );
    };

    try {
      await fetchQuery(
        environment,
        PostDetailQueryArtifact,
        { postId: 'missing-post' },
        { fetchPolicy: 'store-or-network' },
      ).toPromise();
      await fetchQuery(
        environment,
        PostDetailQueryArtifact,
        { postId: wrongTypeId },
        { fetchPolicy: 'store-or-network' },
      ).toPromise();

      assert.equal(requestCount, 2);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('keeps the store-and-network refresh when a Post is cached', async () => {
    const environment = createRelayEnvironment(null, 'profile-a');
    const postId = 'cached-post';
    const operation = createOperationDescriptor(getRequest(PostDetailQueryArtifact), { postId });
    environment.commitUpdate((store) => {
      store.create(postId, 'Post').setValue(postId, 'id');
    });
    environment.check(operation);
    assert.equal(readPostNodeId(environment, operation), postId);

    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    let requestCount = 0;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'https://kos.moe' } },
    });
    globalThis.fetch = async () => {
      requestCount += 1;
      return new Response(JSON.stringify({ data: { currentSession: null, node: null } }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    };

    let queryReference: ReturnType<typeof loadQuery> | undefined;
    try {
      queryReference = loadQuery(
        environment,
        PostDetailQueryArtifact,
        { postId },
        { fetchPolicy: 'store-and-network' },
      );
      await new Promise<void>((resolve) => setImmediate(resolve));

      assert.equal(requestCount, 1);
    } finally {
      queryReference?.dispose();
      globalThis.fetch = originalFetch;
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });
});

async function readPartialProfile(
  environment: ReturnType<typeof createRelayEnvironment>,
  profileSwitcherSelector: ReturnType<typeof createReaderSelector>,
): Promise<void> {
  await fetchQuery(environment, UniversalShellQueryArtifact, {}).toPromise();
  const snapshot = environment.lookup(profileSwitcherSelector) as {
    fieldErrors?: unknown;
  };
  handlePotentialSnapshotErrors(environment, snapshot.fieldErrors as never, undefined as never);
}

function readPostNodeId(
  environment: ReturnType<typeof createRelayEnvironment>,
  operation: ReturnType<typeof createOperationDescriptor>,
): string | undefined {
  const data = environment.lookup(operation.fragment).data as {
    node?: { id?: string } | null;
  } | null;
  return data?.node?.id;
}
