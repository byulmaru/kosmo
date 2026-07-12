import { and, eq, sql } from 'drizzle-orm';
import { db, first, firstOrThrow, ProfileFollowRequests, ProfileFollows, Profiles } from './db';
import { FollowRequestService } from './follow-request';
import type {
  ActivityPubFollowPort,
  FollowRequestNotificationPort,
  FollowRequestRepository,
  FollowRequestStore,
} from './follow-request';

const createStore = (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): FollowRequestStore => ({
  lockPair: async (followerProfileId, followeeProfileId) => {
    const key = `${followerProfileId}:${followeeProfileId}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  },
  findProfile: (id) =>
    tx
      .select({ id: Profiles.id, state: Profiles.state, followPolicy: Profiles.followPolicy })
      .from(Profiles)
      .where(eq(Profiles.id, id))
      .limit(1)
      .then(first),
  findFollow: (followerProfileId, followeeProfileId) =>
    tx
      .select()
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, followerProfileId),
          eq(ProfileFollows.followeeProfileId, followeeProfileId),
        ),
      )
      .limit(1)
      .then(first),
  findRequest: (followerProfileId, followeeProfileId) =>
    tx
      .select()
      .from(ProfileFollowRequests)
      .where(
        and(
          eq(ProfileFollowRequests.followerProfileId, followerProfileId),
          eq(ProfileFollowRequests.followeeProfileId, followeeProfileId),
        ),
      )
      .limit(1)
      .then(first),
  findRequestById: (id) =>
    tx
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, id))
      .limit(1)
      .then(first),
  insertFollow: (followerProfileId, followeeProfileId) =>
    tx
      .insert(ProfileFollows)
      .values({ followerProfileId, followeeProfileId })
      .returning()
      .then(firstOrThrow),
  insertRequest: (followerProfileId, followeeProfileId) =>
    tx
      .insert(ProfileFollowRequests)
      .values({ followerProfileId, followeeProfileId })
      .returning()
      .then(firstOrThrow),
  deleteRequest: (id) =>
    tx
      .delete(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, id))
      .returning()
      .then(first),
});

export const drizzleFollowRequestRepository: FollowRequestRepository = {
  transaction: (callback) => db.transaction((tx) => callback(createStore(tx))),
};

export const createDrizzleFollowRequestService = (
  ports: {
    notifications?: FollowRequestNotificationPort;
    activityPub?: ActivityPubFollowPort;
  } = {},
) =>
  new FollowRequestService({
    repository: drizzleFollowRequestRepository,
    ...ports,
  });

export const followRequestService = createDrizzleFollowRequestService();
