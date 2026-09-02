import { db, first, ProfileFollowRequests, ProfileFollows } from '@kosmo/core/db';
import { executeProfileFollowPairTransition } from '@kosmo/core/temporal/follow-command';
import { and, eq } from 'drizzle-orm';
import { isHttpUri } from './activitypub-uri';
import { isCompatibleOutboundFollowActivity } from './follow-delivery';
import { resolveInboundLocalRecipient } from './inbound-local-recipient';
import { observeInbound } from './inbound-observability';
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
    observeInbound({
      outcome: 'rejected',
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
    observeInbound({
      outcome: 'noop',
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
    observeInbound({
      outcome: 'noop',
      activityType: 'Accept',
      actorOrigin: followerActorUri.origin,
      handler: 'accept',
      objectOrigin: objectUri.origin,
      phase: 'projection',
      reasonCode: 'accept_follow_projection_missing_or_mismatched',
    });
    return;
  }

  // An established projection has no Pending lifecycle to bootstrap. The
  // generation check above remains authoritative; once it matches, a
  // repeated Accept is an idempotent protocol noop.
  if (profileFollow) {
    observeInbound({
      outcome: 'noop',
      activityType: 'Accept',
      actorOrigin: followerActorUri.origin,
      handler: 'accept',
      objectOrigin: objectUri.origin,
      phase: 'projection',
      reasonCode: 'duplicate_accept_noop',
    });
    return;
  }

  const transition = await executeProfileFollowPairTransition({
    pair: {
      followeeProfileId,
      followerProfileId: followerProfile.id,
    },
    command: {
      kind: 'ACCEPT',
      expectedRowId: projection.id,
      origin: 'ACTIVITYPUB',
    },
  });
  if (transition.result.commandKind !== 'ACCEPT') {
    throw new Error('Unexpected inbound Accept transition result');
  }
  if (transition.result.kind === 'ALREADY_ESTABLISHED') {
    observeInbound({
      outcome: 'noop',
      activityType: 'Accept',
      actorOrigin: followerActorUri.origin,
      handler: 'accept',
      objectOrigin: objectUri.origin,
      phase: 'projection',
      reasonCode: 'duplicate_accept_noop',
    });
  } else if (transition.result.kind === 'NOOP') {
    observeInbound({
      outcome: 'noop',
      activityType: 'Accept',
      actorOrigin: followerActorUri.origin,
      handler: 'accept',
      objectOrigin: objectUri.origin,
      phase: 'projection',
      reasonCode: 'accept_follow_state_changed_noop',
    });
  }
};
