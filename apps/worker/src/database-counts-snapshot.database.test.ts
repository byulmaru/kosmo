import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  InstanceKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { inArray } from 'drizzle-orm';
import type * as CoreDb from '@kosmo/core/db';
import type { loadDatabaseCountsSnapshotActivity as LoadDatabaseCountsSnapshotActivity } from './activities/database-counts-snapshot';

process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let db: typeof CoreDb.db;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let Posts: typeof CoreDb.Posts;
let Profiles: typeof CoreDb.Profiles;
let loadDatabaseCountsSnapshotActivity: typeof LoadDatabaseCountsSnapshotActivity;

before(async () => {
  ({ db, Instances, pg, Posts, Profiles } = await import('@kosmo/core/db'));
  ({ loadDatabaseCountsSnapshotActivity } = await import('./activities/database-counts-snapshot'));
});

after(async () => pg.end());

test('database snapshot은 모든 local/remote profile 및 post state를 같은 관측에 포함한다', async () => {
  const previousEnvironment = process.env.ENVIRONMENT;
  process.env.ENVIRONMENT = 'prod';
  const profileIds: string[] = [];
  const instanceIds: string[] = [];

  try {
    const beforeSnapshot = await loadDatabaseCountsSnapshotActivity();
    assert.ok(beforeSnapshot);

    for (const [kind, prefix] of [
      [InstanceKind.LOCAL, 'local'],
      [InstanceKind.ACTIVITYPUB, 'remote'],
    ] as const) {
      const suffix = crypto.randomUUID();
      const [instance] = await db
        .insert(Instances)
        .values({ domain: `${suffix}.example`, kind })
        .returning({ id: Instances.id });
      assert.ok(instance);
      instanceIds.push(instance.id);

      for (const state of [ProfileState.ACTIVE, ProfileState.DISABLED, ProfileState.SUSPENDED]) {
        const profileSuffix = crypto.randomUUID();

        const [profile] = await db
          .insert(Profiles)
          .values({
            displayName: `${prefix}-${state}-${profileSuffix}`,
            followPolicy: ProfileFollowPolicy.OPEN,
            handle: `${prefix}-${state}-${profileSuffix}`,
            instanceId: instance.id,
            normalizedHandle: `${prefix}-${state}-${profileSuffix}`,
            state,
          })
          .returning({ id: Profiles.id });
        assert.ok(profile);
        profileIds.push(profile.id);

        await db.insert(Posts).values(
          [PostState.ACTIVE, PostState.DELETED].map((postState) => ({
            profileId: profile.id,
            state: postState,
            visibility: PostVisibility.PUBLIC,
            deletedAt: postState === PostState.DELETED ? Temporal.Now.instant() : null,
          })),
        );
      }
    }

    const afterSnapshot = await loadDatabaseCountsSnapshotActivity();
    assert.ok(afterSnapshot);
    assert.ok(Date.parse(afterSnapshot.snapshotAt));
    assert.deepEqual(
      {
        profileCount: afterSnapshot.profileCount - beforeSnapshot.profileCount,
        profileLocalCount: afterSnapshot.profileLocalCount - beforeSnapshot.profileLocalCount,
        profileRemoteCount: afterSnapshot.profileRemoteCount - beforeSnapshot.profileRemoteCount,
        profileActiveCount: afterSnapshot.profileActiveCount - beforeSnapshot.profileActiveCount,
        profileDisabledCount:
          afterSnapshot.profileDisabledCount - beforeSnapshot.profileDisabledCount,
        profileSuspendedCount:
          afterSnapshot.profileSuspendedCount - beforeSnapshot.profileSuspendedCount,
        postCount: afterSnapshot.postCount - beforeSnapshot.postCount,
        postLocalCount: afterSnapshot.postLocalCount - beforeSnapshot.postLocalCount,
        postRemoteCount: afterSnapshot.postRemoteCount - beforeSnapshot.postRemoteCount,
        postActiveCount: afterSnapshot.postActiveCount - beforeSnapshot.postActiveCount,
        postDeletedCount: afterSnapshot.postDeletedCount - beforeSnapshot.postDeletedCount,
      },
      {
        profileCount: 6,
        profileLocalCount: 3,
        profileRemoteCount: 3,
        profileActiveCount: 2,
        profileDisabledCount: 2,
        profileSuspendedCount: 2,
        postCount: 12,
        postLocalCount: 6,
        postRemoteCount: 6,
        postActiveCount: 6,
        postDeletedCount: 6,
      },
    );
  } finally {
    if (profileIds.length > 0) {
      await db.delete(Posts).where(inArray(Posts.profileId, profileIds));
      await db.delete(Profiles).where(inArray(Profiles.id, profileIds));
    }
    if (instanceIds.length > 0) {
      await db.delete(Instances).where(inArray(Instances.id, instanceIds));
    }
    if (previousEnvironment === undefined) {
      delete process.env.ENVIRONMENT;
    } else {
      process.env.ENVIRONMENT = previousEnvironment;
    }
  }
});
