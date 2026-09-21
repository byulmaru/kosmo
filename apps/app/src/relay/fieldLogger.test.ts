import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import {
  createOperationDescriptor,
  createReaderSelector,
  Environment,
  fetchQuery,
  getFragment,
  getRequest,
  handlePotentialSnapshotErrors,
  Network,
  RecordSource,
  Store,
} from 'relay-runtime';
import ProfileSwitcherFragment from '../components/shell/__generated__/ProfileSwitcher_query.graphql';
import UniversalShellQueryArtifact from '../components/shell/__generated__/UniversalShellQuery.graphql';
import type { RelayFieldLogger } from 'relay-runtime';
import type { createRelayFieldLogger as CreateRelayFieldLogger } from './fieldLogger';

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

let createRelayFieldLogger: typeof CreateRelayFieldLogger;

before(async () => {
  ({ createRelayFieldLogger } = await import('./fieldLogger'));
});

beforeEach(() => {
  captureCalls.length = 0;
});

describe('Relay field diagnostics', () => {
  it('captures one warning per owner and field path with safe diagnostic fields', () => {
    let currentTime = 0;
    const logger = createRelayFieldLogger(() => currentTime);
    const baseEvent = {
      fieldPath: 'currentSession.selectedProfile.id',
      kind: 'missing_expected_data.log',
      owner: 'ProfileSwitcher_query',
    } as const satisfies RelayFieldLoggerEvent;

    logger(baseEvent);
    logger(baseEvent);
    currentTime = 5 * 60_000;
    logger({ ...baseEvent, fieldPath: 'me.profiles' });
    logger({ ...baseEvent, owner: 'UniversalShellQuery' });
    logger({ ...baseEvent, owner: 'UniversalShellQuery' });

    assert.deepEqual(captureCalls, [
      {
        message: 'Relay missing expected data',
        context: {
          relay_environment_age_bucket: 'under_5m',
          relay_field_path: 'currentSession.selectedProfile.id',
          relay_kind: 'missing_expected_data.log',
          relay_owner: 'ProfileSwitcher_query',
        },
      },
      {
        message: 'Relay missing expected data',
        context: {
          relay_environment_age_bucket: '5m_to_30m',
          relay_field_path: 'me.profiles',
          relay_kind: 'missing_expected_data.log',
          relay_owner: 'ProfileSwitcher_query',
        },
      },
      {
        message: 'Relay missing expected data',
        context: {
          relay_environment_age_bucket: '5m_to_30m',
          relay_field_path: 'currentSession.selectedProfile.id',
          relay_kind: 'missing_expected_data.log',
          relay_owner: 'UniversalShellQuery',
        },
      },
    ]);
  });

  it('excludes user values and non-missing events from the warning context', () => {
    const logger = createRelayFieldLogger(() => 0);
    const eventWithUserValues = {
      fieldPath: 'currentSession.selectedProfile.id',
      kind: 'missing_expected_data.log',
      owner: 'UniversalShellQuery',
      accountId: 'account-secret',
      handle: '@private-handle',
      profileId: 'profile-secret',
      response: { displayName: 'Private name' },
      variables: { id: 'profile-secret' },
    } as unknown as RelayFieldLoggerEvent;

    logger(eventWithUserValues);
    logger({
      ...eventWithUserValues,
      kind: 'missing_expected_data.throw',
      handled: false,
    });
    logger({
      ...eventWithUserValues,
      kind: 'missing_required_field.log',
    });

    assert.equal(captureCalls.length, 1);
    assert.deepEqual(captureCalls[0]?.context, {
      relay_environment_age_bucket: 'under_5m',
      relay_field_path: 'currentSession.selectedProfile.id',
      relay_kind: 'missing_expected_data.log',
      relay_owner: 'UniversalShellQuery',
    });
  });

  it('deduplicates independently for each Relay Environment logger', () => {
    const event = {
      fieldPath: 'currentSession.selectedProfile.id',
      kind: 'missing_expected_data.log',
      owner: 'ProfileSwitcher_query',
    } as const satisfies RelayFieldLoggerEvent;

    createRelayFieldLogger(() => 0)(event);
    createRelayFieldLogger(() => 0)(event);

    assert.equal(captureCalls.length, 2);
  });

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
    const environment = new Environment({
      network: Network.create(async () => ({ data: payload })),
      relayFieldLogger: createRelayFieldLogger(() => 0),
      store: new Store(new RecordSource()),
    });
    const shell = createOperationDescriptor(getRequest(UniversalShellQueryArtifact), {});
    const profileSwitcherSelector = createReaderSelector(
      getFragment(ProfileSwitcherFragment),
      'client:root',
      {},
      shell.request,
    );

    await fetchQuery(environment, UniversalShellQueryArtifact, {}).toPromise();
    const firstSnapshot = environment.lookup(profileSwitcherSelector) as {
      fieldErrors?: unknown;
    };
    handlePotentialSnapshotErrors(
      environment,
      firstSnapshot.fieldErrors as never,
      undefined as never,
    );
    await fetchQuery(environment, UniversalShellQueryArtifact, {}).toPromise();
    const secondSnapshot = environment.lookup(profileSwitcherSelector) as {
      fieldErrors?: unknown;
    };
    handlePotentialSnapshotErrors(
      environment,
      secondSnapshot.fieldErrors as never,
      undefined as never,
    );

    assert.deepEqual(
      captureCalls.map(({ context }) => context),
      [
        {
          relay_environment_age_bucket: 'under_5m',
          relay_field_path: 'currentSession.selectedProfile.handle',
          relay_kind: 'missing_expected_data.log',
          relay_owner: 'ProfileSwitcher_query',
        },
        {
          relay_environment_age_bucket: 'under_5m',
          relay_field_path: 'currentSession.selectedProfile.relativeHandle',
          relay_kind: 'missing_expected_data.log',
          relay_owner: 'ProfileSwitcher_query',
        },
      ],
    );
  });
});
