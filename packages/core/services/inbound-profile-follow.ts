import { and, asc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import {
  ActivityPubActors,
  first,
  getDatabaseConnection,
  Instances,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '../db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '../enums';
import { NotFoundError } from '../error';
import type { Transaction } from '../db';

type ProfileFollowRow = typeof ProfileFollows.$inferSelect;
type ProfileFollowRequestRow = typeof ProfileFollowRequests.$inferSelect;

export interface InboundFollowCorrelation {
  readonly activityId: string | null;
  readonly actorUri: string;
  readonly generation: Temporal.Instant;
  readonly objectUri: string;
}

export interface RecordInboundFollowInput {
  readonly correlation: InboundFollowCorrelation;
  readonly followeeProfileId: string;
  readonly followerProfileId: string;
}

export type RecordInboundFollowResult =
  | {
      readonly created: boolean;
      readonly kind: 'ESTABLISHED';
      readonly profileFollow: ProfileFollowRow;
    }
  | {
      readonly created: boolean;
      readonly kind: 'PENDING';
      readonly profileFollowRequest: ProfileFollowRequestRow;
    };

export interface RemoveInboundFollowInput {
  readonly actorUri: string;
  readonly expectedGeneration: Temporal.Instant;
  readonly followeeProfileId: string;
  readonly followerProfileId: string;
  readonly objectUri: string;
}

export type RemoveInboundFollowResult =
  | { readonly deletedId: string; readonly kind: 'ESTABLISHED' }
  | { readonly deletedId: string; readonly kind: 'PENDING' }
  | null;

const pairCondition = (
  table: typeof ProfileFollows | typeof ProfileFollowRequests,
  followerProfileId: string,
  followeeProfileId: string,
) =>
  and(
    eq(table.followerProfileId, followerProfileId),
    eq(table.followeeProfileId, followeeProfileId),
  );

const laterGeneration = (
  current: Temporal.Instant | null,
  incoming: Temporal.Instant,
): Temporal.Instant =>
  current === null || Temporal.Instant.compare(current, incoming) < 0 ? incoming : current;

const correlationUpdate = <
  Row extends {
    inboundFollowActivityId: string | null;
    inboundFollowActorUri: string | null;
    inboundFollowGeneration: Temporal.Instant | null;
    inboundFollowObjectUri: string | null;
  },
>(
  row: Row,
  correlation: InboundFollowCorrelation,
) => ({
  inboundFollowActivityId: row.inboundFollowActivityId ?? correlation.activityId,
  inboundFollowActorUri: row.inboundFollowActorUri ?? correlation.actorUri,
  inboundFollowGeneration: laterGeneration(row.inboundFollowGeneration, correlation.generation),
  inboundFollowObjectUri: row.inboundFollowObjectUri ?? correlation.objectUri,
});

const correlationValues = (correlation: InboundFollowCorrelation) => ({
  inboundFollowActivityId: correlation.activityId,
  inboundFollowActorUri: correlation.actorUri,
  inboundFollowGeneration: correlation.generation,
  inboundFollowObjectUri: correlation.objectUri,
});

export const recordInboundFollow = async (
  { correlation, followeeProfileId, followerProfileId }: RecordInboundFollowInput,
  tx?: Transaction,
): Promise<RecordInboundFollowResult> =>
  getDatabaseConnection(tx).transaction(async (tx) => {
    const participants = await tx
      .select({
        actorUri: ActivityPubActors.uri,
        followPolicy: Profiles.followPolicy,
        instanceKind: Instances.kind,
        instanceState: Instances.state,
        profileId: Profiles.id,
        profileState: Profiles.state,
      })
      .from(Profiles)
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
      .where(inArray(Profiles.id, [followerProfileId, followeeProfileId]))
      .orderBy(asc(Profiles.id))
      .for('update', { of: Profiles });
    const follower = participants.find(({ profileId }) => profileId === followerProfileId);
    const followee = participants.find(({ profileId }) => profileId === followeeProfileId);

    if (
      !follower ||
      follower.profileState !== ProfileState.ACTIVE ||
      follower.instanceKind !== InstanceKind.ACTIVITYPUB ||
      follower.instanceState !== InstanceState.ACTIVE ||
      follower.actorUri !== correlation.actorUri ||
      !followee ||
      followee.profileState !== ProfileState.ACTIVE ||
      followee.instanceKind !== InstanceKind.LOCAL ||
      followee.instanceState !== InstanceState.ACTIVE ||
      followee.actorUri !== correlation.objectUri
    ) {
      throw new NotFoundError('Profile not found');
    }

    const existingFollow = await tx
      .select()
      .from(ProfileFollows)
      .where(pairCondition(ProfileFollows, followerProfileId, followeeProfileId))
      .limit(1)
      .for('update', { of: ProfileFollows })
      .then(first);

    if (existingFollow) {
      await tx
        .delete(ProfileFollowRequests)
        .where(pairCondition(ProfileFollowRequests, followerProfileId, followeeProfileId));
      const profileFollow = await tx
        .update(ProfileFollows)
        .set(correlationUpdate(existingFollow, correlation))
        .where(eq(ProfileFollows.id, existingFollow.id))
        .returning()
        .then(first);

      return { created: false, kind: 'ESTABLISHED', profileFollow: profileFollow! };
    }

    if (followee.followPolicy === ProfileFollowPolicy.APPROVAL_REQUIRED) {
      const existingRequest = await tx
        .select()
        .from(ProfileFollowRequests)
        .where(pairCondition(ProfileFollowRequests, followerProfileId, followeeProfileId))
        .limit(1)
        .for('update', { of: ProfileFollowRequests })
        .then(first);

      if (existingRequest) {
        const profileFollowRequest = await tx
          .update(ProfileFollowRequests)
          .set(correlationUpdate(existingRequest, correlation))
          .where(eq(ProfileFollowRequests.id, existingRequest.id))
          .returning()
          .then(first);

        return {
          created: false,
          kind: 'PENDING',
          profileFollowRequest: profileFollowRequest!,
        };
      }

      const profileFollowRequest = await tx
        .insert(ProfileFollowRequests)
        .values({
          ...correlationValues(correlation),
          followeeProfileId,
          followerProfileId,
        })
        .returning()
        .then(first);

      return { created: true, kind: 'PENDING', profileFollowRequest: profileFollowRequest! };
    }

    await tx
      .delete(ProfileFollowRequests)
      .where(pairCondition(ProfileFollowRequests, followerProfileId, followeeProfileId));
    const profileFollow = await tx
      .insert(ProfileFollows)
      .values({
        ...correlationValues(correlation),
        followeeProfileId,
        followerProfileId,
      })
      .returning()
      .then(first);

    await tx
      .update(Profiles)
      .set({ followingCount: sql`${Profiles.followingCount} + 1` })
      .where(eq(Profiles.id, followerProfileId));
    await tx
      .update(Profiles)
      .set({ followersCount: sql`${Profiles.followersCount} + 1` })
      .where(eq(Profiles.id, followeeProfileId));

    return { created: true, kind: 'ESTABLISHED', profileFollow: profileFollow! };
  });

export const removeInboundFollow = async (
  {
    actorUri,
    expectedGeneration,
    followeeProfileId,
    followerProfileId,
    objectUri,
  }: RemoveInboundFollowInput,
  tx?: Transaction,
): Promise<RemoveInboundFollowResult> =>
  getDatabaseConnection(tx).transaction(async (tx) => {
    const profileFollow = await tx
      .select({ id: ProfileFollows.id })
      .from(ProfileFollows)
      .where(pairCondition(ProfileFollows, followerProfileId, followeeProfileId))
      .limit(1)
      .then(first);

    if (profileFollow) {
      const deleted = await tx
        .delete(ProfileFollows)
        .where(
          and(
            eq(ProfileFollows.id, profileFollow.id),
            eq(ProfileFollows.inboundFollowActorUri, actorUri),
            eq(ProfileFollows.inboundFollowObjectUri, objectUri),
            isNotNull(ProfileFollows.inboundFollowGeneration),
            lte(ProfileFollows.inboundFollowGeneration, expectedGeneration),
          ),
        )
        .returning({ id: ProfileFollows.id })
        .then(first);

      if (!deleted) {
        return null;
      }

      await tx
        .update(Profiles)
        .set({ followingCount: sql`greatest(${Profiles.followingCount} - 1, 0)` })
        .where(eq(Profiles.id, followerProfileId));
      await tx
        .update(Profiles)
        .set({ followersCount: sql`greatest(${Profiles.followersCount} - 1, 0)` })
        .where(eq(Profiles.id, followeeProfileId));

      return { deletedId: deleted.id, kind: 'ESTABLISHED' };
    }

    const profileFollowRequest = await tx
      .select({ id: ProfileFollowRequests.id })
      .from(ProfileFollowRequests)
      .where(pairCondition(ProfileFollowRequests, followerProfileId, followeeProfileId))
      .limit(1)
      .then(first);

    if (!profileFollowRequest) {
      return null;
    }

    const deleted = await tx
      .delete(ProfileFollowRequests)
      .where(
        and(
          eq(ProfileFollowRequests.id, profileFollowRequest.id),
          eq(ProfileFollowRequests.inboundFollowActorUri, actorUri),
          eq(ProfileFollowRequests.inboundFollowObjectUri, objectUri),
          isNotNull(ProfileFollowRequests.inboundFollowGeneration),
          lte(ProfileFollowRequests.inboundFollowGeneration, expectedGeneration),
        ),
      )
      .returning({ id: ProfileFollowRequests.id })
      .then(first);

    return deleted ? { deletedId: deleted.id, kind: 'PENDING' } : null;
  });
