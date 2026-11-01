import { getDatabaseConnection, Instances, Posts, Profiles } from '@kosmo/core/db';
import { InstanceKind, PostState, ProfileState } from '@kosmo/core/enums';
import { eq, sql } from 'drizzle-orm';
import { capturePostHogEvent } from './posthog';

export type DatabaseCountsSnapshot = {
  readonly snapshotAt: string;
  readonly profileCount: number;
  readonly profileLocalCount: number;
  readonly profileRemoteCount: number;
  readonly profileActiveCount: number;
  readonly profileDisabledCount: number;
  readonly profileSuspendedCount: number;
  readonly postCount: number;
  readonly postLocalCount: number;
  readonly postRemoteCount: number;
  readonly postActiveCount: number;
  readonly postDeletedCount: number;
};

function asCount(value: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Database count is outside the safe integer range.');
  }
  return count;
}

export async function loadDatabaseCountsSnapshotActivity(): Promise<DatabaseCountsSnapshot | null> {
  if (process.env.ENVIRONMENT !== 'prod') {
    return null;
  }

  return await getDatabaseConnection().transaction(async (database) => {
    await database.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`);
    await database.execute(sql`SET LOCAL row_security = off`);
    await database.execute(sql`SET LOCAL statement_timeout = '30s'`);

    const [profiles] = await database
      .select({
        snapshotAt: sql<string>`to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        profileCount: sql`count(*)`.mapWith(asCount),
        profileLocalCount:
          sql`count(*) filter (where ${Instances.kind} = ${InstanceKind.LOCAL})`.mapWith(asCount),
        profileRemoteCount:
          sql`count(*) filter (where ${Instances.kind} = ${InstanceKind.ACTIVITYPUB})`.mapWith(
            asCount,
          ),
        profileActiveCount:
          sql`count(*) filter (where ${Profiles.state} = ${ProfileState.ACTIVE})`.mapWith(asCount),
        profileDisabledCount:
          sql`count(*) filter (where ${Profiles.state} = ${ProfileState.DISABLED})`.mapWith(
            asCount,
          ),
        profileSuspendedCount:
          sql`count(*) filter (where ${Profiles.state} = ${ProfileState.SUSPENDED})`.mapWith(
            asCount,
          ),
      })
      .from(Profiles)
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId));

    const [posts] = await database
      .select({
        postCount: sql`count(*)`.mapWith(asCount),
        postLocalCount:
          sql`count(*) filter (where ${Instances.kind} = ${InstanceKind.LOCAL})`.mapWith(asCount),
        postRemoteCount:
          sql`count(*) filter (where ${Instances.kind} = ${InstanceKind.ACTIVITYPUB})`.mapWith(
            asCount,
          ),
        postActiveCount: sql`count(*) filter (where ${Posts.state} = ${PostState.ACTIVE})`.mapWith(
          asCount,
        ),
        postDeletedCount:
          sql`count(*) filter (where ${Posts.state} = ${PostState.DELETED})`.mapWith(asCount),
      })
      .from(Posts)
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId));

    return {
      ...profiles,
      ...posts,
      snapshotAt: Temporal.Instant.from(profiles.snapshotAt).toString(),
    };
  });
}

export async function captureDatabaseCountsSnapshotActivity({
  snapshot,
  eventId,
}: {
  readonly snapshot: DatabaseCountsSnapshot;
  readonly eventId: string;
}): Promise<void> {
  if (process.env.ENVIRONMENT !== 'prod') {
    return;
  }

  await capturePostHogEvent({
    event: 'database_counts_snapshot',
    distinct_id: 'kosmo-production-db',
    timestamp: snapshot.snapshotAt,
    uuid: eventId,
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
}
