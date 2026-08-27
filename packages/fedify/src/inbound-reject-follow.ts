import '@kosmo/core/polyfill';

import { db, first, ProfileFollowRequests, ProfileFollows } from '@kosmo/core/db';
import {
  executeProfileFollowPairTransition,
  executeProfileFollowRemoval,
} from '@kosmo/core/temporal/follow-command';
import { and, eq } from 'drizzle-orm';
import { isHttpUri } from './activitypub-uri';
import { isCompatibleOutboundFollowActivity } from './follow-delivery';
import { resolveInboundLocalRecipient } from './inbound-local-recipient';
import { observeInboundNoop, observeInboundRejected } from './inbound-observability';
import type { InboxContext } from '@fedify/fedify';
import type { Follow } from '@fedify/vocab';

export const handleInboundRejectFollow = async ({
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
    observeInboundRejected({
      activityType: 'Reject',
      actorOrigin: followerActorUri?.origin,
      handler: 'reject',
      objectOrigin: objectUri?.origin,
      phase: 'protocol',
      reasonCode: 'reject_follow_identity_mismatch',
    });
    return;
  }

  const followerProfile = await resolveInboundLocalRecipient(context, followerActorUri);
  if (!followerProfile) {
    observeInboundNoop({
      activityType: 'Reject',
      actorOrigin: followerActorUri.origin,
      handler: 'reject',
      objectOrigin: objectUri.origin,
      phase: 'projection',
      reasonCode: 'reject_follower_profile_missing',
    });
    return;
  }

  const pendingRequest = await db
    .select({ createdAt: ProfileFollowRequests.createdAt, id: ProfileFollowRequests.id })
    .from(ProfileFollowRequests)
    .where(
      and(
        eq(ProfileFollowRequests.followerProfileId, followerProfile.id),
        eq(ProfileFollowRequests.followeeProfileId, followeeProfileId),
      ),
    )
    .limit(1)
    .then(first);
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
  const projection = pendingRequest ?? profileFollow;

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
      activityType: 'Reject',
      actorOrigin: followerActorUri.origin,
      handler: 'reject',
      objectOrigin: objectUri.origin,
      phase: 'projection',
      reasonCode: 'reject_follow_projection_missing_or_mismatched',
    });
    return;
  }

  const pair = {
    followeeProfileId,
    followerProfileId: followerProfile.id,
  };
  if (pendingRequest) {
    const result = await executeProfileFollowPairTransition({
      pair,
      command: {
        kind: 'REJECT',
        expectedRowId: pendingRequest.id,
        origin: 'ACTIVITYPUB',
      },
    });
    if (result.result.commandKind !== 'REJECT') {
      throw new Error('Unexpected inbound Reject transition result');
    }
    if (!result.result.changed) {
      observeInboundNoop({
        activityType: 'Reject',
        actorOrigin: followerActorUri.origin,
        handler: 'reject',
        objectOrigin: objectUri.origin,
        phase: 'projection',
        reasonCode: 'reject_follow_state_changed_noop',
      });
    }
    return;
  }

  const removed = await executeProfileFollowRemoval({
    ...pair,
    expectedRowId: profileFollow!.id,
    origin: 'ACTIVITYPUB',
  });
  if (!removed.ok) {
    throw new Error(removed.error.message);
  }
  if (!removed.changed) {
    observeInboundNoop({
      activityType: 'Reject',
      actorOrigin: followerActorUri.origin,
      handler: 'reject',
      objectOrigin: objectUri.origin,
      phase: 'projection',
      reasonCode: 'reject_follow_state_changed_noop',
    });
  }
};
