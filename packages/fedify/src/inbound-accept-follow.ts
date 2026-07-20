import { db, first, ProfileFollowRequests, ProfileFollows } from '@kosmo/core/db';
import { acceptProfileFollowRequest } from '@kosmo/core/services';
import { and, eq } from 'drizzle-orm';
import { isHttpUri } from './activitypub-uri';
import { isCompatibleOutboundFollowActivity } from './follow-delivery';
import { resolveInboundLocalRecipient } from './inbound-local-recipient';
import type { InboxContext } from '@fedify/fedify';
import type { Follow } from '@fedify/vocab';

export const handleInboundAcceptFollow = async ({
  context,
  follow,
  followeeActorUri,
  followeeProfileId,
}: {
  context: InboxContext<void>;
  follow: Follow;
  followeeActorUri: URL;
  followeeProfileId: string;
}): Promise<void> => {
  const followerActorUri = follow.actorId;
  const objectUri = follow.objectId;
  if (
    !isHttpUri(followerActorUri) ||
    !isHttpUri(objectUri) ||
    objectUri.href !== followeeActorUri.href
  ) {
    return;
  }

  const followerProfile = await resolveInboundLocalRecipient(context, followerActorUri);
  if (!followerProfile) {
    return;
  }

  const profileFollow = await db
    .select({ createdAt: ProfileFollows.createdAt, id: ProfileFollows.id })
    .from(ProfileFollows)
    .where(
      and(
        eq(ProfileFollows.followerProfileId, followerProfile.id),
        eq(ProfileFollows.followeeProfileId, followeeProfileId),
      ),
    )
    .limit(1)
    .then(first);
  const projection =
    profileFollow ??
    (await db
      .select({ createdAt: ProfileFollowRequests.createdAt, id: ProfileFollowRequests.id })
      .from(ProfileFollowRequests)
      .where(
        and(
          eq(ProfileFollowRequests.followerProfileId, followerProfile.id),
          eq(ProfileFollowRequests.followeeProfileId, followeeProfileId),
        ),
      )
      .limit(1)
      .then(first));

  if (
    !projection ||
    !isCompatibleOutboundFollowActivity(
      context.canonicalOrigin,
      follow.id,
      follow.published,
      projection,
    )
  ) {
    return;
  }

  await acceptProfileFollowRequest({
    expectedRowId: projection.id,
    followeeProfileId,
    followerProfileId: followerProfile.id,
  });
};
