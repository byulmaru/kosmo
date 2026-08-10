import { db, first, ProfileFollowRequests, ProfileFollows } from '@kosmo/core/db';
import { acceptProfileFollowRequest } from '@kosmo/core/services';
import { and, eq } from 'drizzle-orm';
import { isHttpUri } from './activitypub-uri';
import { isCompatibleOutboundFollowActivity } from './follow-delivery';
import { resolveInboundLocalRecipient } from './inbound-local-recipient';
import { observeInboundNoop, observeInboundRejected } from './inbound-observability';
import type { InboxContext } from '@fedify/fedify';
import type { Follow } from '@fedify/vocab';
import type { FedifyExecutionContext } from './fedify-execution';

export const handleInboundAcceptFollow = async ({
  context,
  follow,
  followeeActorUri,
  followeeProfileId,
  acceptProfileFollowRequest: acceptFollowRequest = acceptProfileFollowRequest,
}: {
  readonly acceptProfileFollowRequest?: typeof acceptProfileFollowRequest;
  context: InboxContext<FedifyExecutionContext>;
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
    observeInboundRejected({
      activityType: 'Accept',
      actorOrigin: followerActorUri?.origin,
      handler: 'accept',
      objectOrigin: objectUri?.origin,
      phase: 'protocol',
      reasonCode: 'accept_follow_identity_mismatch',
    });
    return;
  }

  const followerProfile = await resolveInboundLocalRecipient(context, followerActorUri);
  if (!followerProfile) {
    observeInboundNoop({
      activityType: 'Accept',
      actorOrigin: followerActorUri.origin,
      handler: 'accept',
      objectOrigin: objectUri.origin,
      phase: 'projection',
      reasonCode: 'accept_follower_profile_missing',
    });
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
    observeInboundNoop({
      activityType: 'Accept',
      actorOrigin: followerActorUri.origin,
      handler: 'accept',
      objectOrigin: objectUri.origin,
      phase: 'projection',
      reasonCode: 'accept_follow_projection_missing_or_mismatched',
    });
    return;
  }

  const result = await acceptFollowRequest({
    expectedRowId: projection.id,
    followeeProfileId,
    followerProfileId: followerProfile.id,
  });
  if (result.kind === 'ALREADY_ESTABLISHED') {
    observeInboundNoop({
      activityType: 'Accept',
      actorOrigin: followerActorUri.origin,
      handler: 'accept',
      objectOrigin: objectUri.origin,
      phase: 'projection',
      reasonCode: 'duplicate_accept_noop',
    });
  } else if (result.kind === 'NOOP') {
    observeInboundNoop({
      activityType: 'Accept',
      actorOrigin: followerActorUri.origin,
      handler: 'accept',
      objectOrigin: objectUri.origin,
      phase: 'projection',
      reasonCode: 'accept_follow_state_changed_noop',
    });
  }
};
