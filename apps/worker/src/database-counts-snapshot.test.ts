import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import type {
  captureDatabaseCountsSnapshotActivity as CaptureDatabaseCountsSnapshotActivity,
  DatabaseCountsSnapshot,
  loadDatabaseCountsSnapshotActivity as LoadDatabaseCountsSnapshotActivity,
} from './activities/database-counts-snapshot';

process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let captureDatabaseCountsSnapshotActivity: typeof CaptureDatabaseCountsSnapshotActivity;
let loadDatabaseCountsSnapshotActivity: typeof LoadDatabaseCountsSnapshotActivity;

before(async () => {
  ({ captureDatabaseCountsSnapshotActivity, loadDatabaseCountsSnapshotActivity } =
    await import('./activities/database-counts-snapshot'));
});

const snapshot: DatabaseCountsSnapshot = {
  snapshotAt: '2026-10-03T12:34:56.000Z',
  profileCount: 120,
  profileLocalCount: 80,
  profileRemoteCount: 40,
  profileActiveCount: 110,
  profileDisabledCount: 7,
  profileSuspendedCount: 3,
  postCount: 900,
  postLocalCount: 650,
  postRemoteCount: 250,
  postActiveCount: 875,
  postDeletedCount: 25,
};

const environmentKeys = ['ENVIRONMENT', 'POSTHOG_HOST', 'POSTHOG_KEY'] as const;
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
);

function setEnvironment(
  values: Partial<Record<(typeof environmentKeys)[number], string | undefined>>,
): void {
  for (const key of environmentKeys) {
    const value = values[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test('snapshot Activity는 dev에서 DB를 읽거나 PostHog로 보내지 않는다', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests += 1;
    return new Response(null, { status: 200 });
  });
  t.after(() => setEnvironment(originalEnvironment));
  setEnvironment({
    ENVIRONMENT: 'dev',
    POSTHOG_HOST: undefined,
    POSTHOG_KEY: undefined,
  });

  assert.equal(await loadDatabaseCountsSnapshotActivity(), null);
  await captureDatabaseCountsSnapshotActivity({
    snapshot,
    eventId: '00000000-0000-4000-8000-000000000001',
  });
  assert.equal(requests, 0);
});

test('PostHog capture는 승인된 집계와 고정 ID를 보낸다', async (t) => {
  let requestUrl: string | undefined;
  let payload: Record<string, unknown> | undefined;
  t.after(() => setEnvironment(originalEnvironment));
  setEnvironment({
    ENVIRONMENT: 'prod',
    POSTHOG_HOST: 'https://us.i.posthog.com',
    POSTHOG_KEY: 'public-capture-key',
  });
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input);
    assert.equal(init?.method, 'POST');
    assert.ok(init?.signal);
    payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(null, { status: 200 });
  });

  await captureDatabaseCountsSnapshotActivity({
    snapshot,
    eventId: '00000000-0000-4000-8000-000000000001',
  });

  assert.equal(requestUrl, 'https://us.i.posthog.com/capture/');
  assert.deepEqual(payload, {
    api_key: 'public-capture-key',
    event: 'database_counts_snapshot',
    distinct_id: 'kosmo-production-db',
    timestamp: snapshot.snapshotAt,
    uuid: '00000000-0000-4000-8000-000000000001',
    properties: {
      profile_count: snapshot.profileCount,
      profile_local_count: snapshot.profileLocalCount,
      profile_remote_count: snapshot.profileRemoteCount,
      profile_active_count: snapshot.profileActiveCount,
      profile_disabled_count: snapshot.profileDisabledCount,
      profile_suspended_count: snapshot.profileSuspendedCount,
      post_count: snapshot.postCount,
      post_local_count: snapshot.postLocalCount,
      post_remote_count: snapshot.postRemoteCount,
      post_active_count: snapshot.postActiveCount,
      post_deleted_count: snapshot.postDeletedCount,
      environment: 'prod',
      $process_person_profile: false,
    },
  });
});

test('PostHog capture는 prod 설정 누락과 실패 응답을 실패로 반환한다', async (t) => {
  t.after(() => setEnvironment(originalEnvironment));
  setEnvironment({
    ENVIRONMENT: 'prod',
    POSTHOG_HOST: undefined,
    POSTHOG_KEY: 'capture-key',
  });
  await assert.rejects(
    captureDatabaseCountsSnapshotActivity({
      snapshot,
      eventId: '00000000-0000-4000-8000-000000000001',
    }),
    /POSTHOG_HOST and POSTHOG_KEY are required/,
  );

  process.env.POSTHOG_HOST = 'https://us.i.posthog.com';
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }));
  await assert.rejects(
    captureDatabaseCountsSnapshotActivity({
      snapshot,
      eventId: '00000000-0000-4000-8000-000000000001',
    }),
    /PostHog capture failed with HTTP 503/,
  );
});
