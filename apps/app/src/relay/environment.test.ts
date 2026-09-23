import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import {
  createOperationDescriptor,
  createReaderSelector,
  fetchQuery,
  getFragment,
  getRequest,
  handlePotentialSnapshotErrors,
} from 'relay-runtime';
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
