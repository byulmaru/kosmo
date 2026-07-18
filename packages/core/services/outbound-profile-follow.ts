import { and, eq } from 'drizzle-orm';
import { first, getDatabaseConnection, ProfileFollowRequests, ProfileFollows } from '../db';
import { ensureProfileFollow } from './profile-follow-relation';
import type { Transaction } from '../db';

export type OutboundProfileFollowProjection = {
  readonly createdAt: Temporal.Instant;
  readonly followeeProfileId: string;
  readonly followerProfileId: string;
  readonly id: string;
};

type OutboundProfileFollowPair = Pick<
  OutboundProfileFollowProjection,
  'followeeProfileId' | 'followerProfileId'
>;

const pairCondition = (
  table: typeof ProfileFollows | typeof ProfileFollowRequests,
  { followeeProfileId, followerProfileId }: OutboundProfileFollowPair,
) =>
  and(
    eq(table.followerProfileId, followerProfileId),
    eq(table.followeeProfileId, followeeProfileId),
  );

const findProjection = async (
  {
    id,
    pair,
  }: {
    readonly id?: string;
    readonly pair?: OutboundProfileFollowPair;
  },
  tx?: Transaction,
): Promise<OutboundProfileFollowProjection | undefined> => {
  const connection = getDatabaseConnection(tx);
  const established = await connection
    .select()
    .from(ProfileFollows)
    .where(id ? eq(ProfileFollows.id, id) : pairCondition(ProfileFollows, pair!))
    .limit(1)
    .then(first);

  if (established) {
    return established;
  }

  const pending = await connection
    .select()
    .from(ProfileFollowRequests)
    .where(id ? eq(ProfileFollowRequests.id, id) : pairCondition(ProfileFollowRequests, pair!))
    .limit(1)
    .then(first);

  return pending;
};

export const findOutboundProfileFollowProjectionById = (
  id: string,
  tx?: Transaction,
): Promise<OutboundProfileFollowProjection | undefined> => findProjection({ id }, tx);

export const findOutboundProfileFollowProjectionByPair = (
  pair: OutboundProfileFollowPair,
  tx?: Transaction,
): Promise<OutboundProfileFollowProjection | undefined> => findProjection({ pair }, tx);

export const acceptOutboundProfileFollow = async (
  {
    expectedRowId,
    followeeProfileId,
    followerProfileId,
  }: OutboundProfileFollowPair & { readonly expectedRowId: string },
  tx?: Transaction,
): Promise<boolean> =>
  getDatabaseConnection(tx).transaction(async (tx) => {
    const pair = { followeeProfileId, followerProfileId };
    const established = await tx
      .select({ id: ProfileFollows.id })
      .from(ProfileFollows)
      .where(pairCondition(ProfileFollows, pair))
      .limit(1)
      .then(first);

    if (established) {
      return established.id === expectedRowId;
    }

    const deleted = await tx
      .delete(ProfileFollowRequests)
      .where(
        and(
          eq(ProfileFollowRequests.id, expectedRowId),
          pairCondition(ProfileFollowRequests, pair),
        ),
      )
      .returning({ id: ProfileFollowRequests.id })
      .then(first);

    if (!deleted) {
      return false;
    }

    await ensureProfileFollow(pair, tx);
    return true;
  });
