import { and, eq } from 'drizzle-orm';
import { db, first, ProfileFollows } from '../db';
import {
  executeProfileFollowPairTransition,
  executeProfileFollowRemoval,
} from '../temporal/follow-command';
import type { ProfileFollowRequests, Profiles } from '../db';

type ProfileRow = typeof Profiles.$inferSelect;
type ProfileFollowRow = typeof ProfileFollows.$inferSelect;
type ProfileFollowRequestRow = typeof ProfileFollowRequests.$inferSelect;

type FollowProfileResult = {
  readonly created: boolean;
  readonly followeeProfile: ProfileRow;
  readonly followerProfile: ProfileRow;
  readonly result:
    | { readonly kind: 'ESTABLISHED'; readonly profileFollow: ProfileFollowRow }
    | { readonly kind: 'PENDING'; readonly profileFollowRequest: ProfileFollowRequestRow };
};

export const followProfile = async ({
  followerProfileId,
  followeeProfileId,
}: {
  readonly followerProfileId: string;
  readonly followeeProfileId: string;
}): Promise<FollowProfileResult> => {
  const transition = await executeProfileFollowPairTransition({
    pair: { followerProfileId, followeeProfileId },
    command: { kind: 'FOLLOW', origin: 'LOCAL' },
  });
  const result = transition.result;
  if (result.commandKind !== 'FOLLOW') {
    throw new Error('Invalid Follow result');
  }

  return {
    created: result.created,
    followeeProfile: transition.followeeProfile,
    followerProfile: transition.followerProfile,
    result:
      result.kind === 'ESTABLISHED'
        ? { kind: result.kind, profileFollow: transition.profileFollow! }
        : { kind: result.kind, profileFollowRequest: transition.profileFollowRequest! },
  };
};

export const unfollowProfile = async ({
  followerProfileId,
  followeeProfileId,
}: {
  readonly followerProfileId: string;
  readonly followeeProfileId: string;
}) => {
  const profileFollow = await db
    .select({ id: ProfileFollows.id })
    .from(ProfileFollows)
    .where(
      and(
        eq(ProfileFollows.followerProfileId, followerProfileId),
        eq(ProfileFollows.followeeProfileId, followeeProfileId),
      ),
    )
    .limit(1)
    .then(first);
  if (!profileFollow) {
    return { profileFollowId: null };
  }

  return executeProfileFollowRemoval({
    followerProfileId,
    followeeProfileId,
    expectedRowId: profileFollow.id,
    origin: 'LOCAL',
  });
};
