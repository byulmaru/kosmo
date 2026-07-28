import { ActivityPubActors, ActivityPubPosts, Instances, Posts, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Reactions, Transaction } from '@kosmo/core/db';
import type { sendProfileReaction } from '@kosmo/fedify';

const SenderProfiles = alias(Profiles, 'outbound_reaction_sender_profile');
const SenderInstances = alias(Instances, 'outbound_reaction_sender_instance');
const TargetActors = alias(ActivityPubActors, 'outbound_reaction_target_actor');

type ReactionDeliveryCommand = Parameters<typeof sendProfileReaction>[0];

export const resolveReactionDeliveryCommand = async (
  tx: Transaction,
  reaction: typeof Reactions.$inferSelect,
): Promise<ReactionDeliveryCommand | undefined> => {
  const projection = await tx
    .select({
      actorInboxUri: TargetActors.inboxUri,
      actorSharedInboxUri: TargetActors.sharedInboxUri,
      actorUri: TargetActors.uri,
      objectUri: ActivityPubPosts.uri,
      senderInstanceKind: SenderInstances.kind,
      targetInstanceKind: Instances.kind,
      targetInstanceState: Instances.state,
      targetProfileState: Profiles.state,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(SenderProfiles, eq(SenderProfiles.id, reaction.profileId))
    .innerJoin(SenderInstances, eq(SenderInstances.id, SenderProfiles.instanceId))
    .leftJoin(ActivityPubPosts, eq(ActivityPubPosts.postId, Posts.id))
    .leftJoin(TargetActors, eq(TargetActors.profileId, Profiles.id))
    .where(eq(Posts.id, reaction.postId))
    .limit(1)
    .then((rows) => rows[0]);

  if (
    !projection ||
    projection.senderInstanceKind !== InstanceKind.LOCAL ||
    projection.targetInstanceKind !== InstanceKind.ACTIVITYPUB ||
    projection.targetInstanceState !== InstanceState.ACTIVE ||
    projection.targetProfileState !== ProfileState.ACTIVE ||
    !projection.objectUri ||
    !projection.actorUri ||
    !projection.actorInboxUri
  ) {
    return undefined;
  }

  return {
    actor: {
      inboxUri: projection.actorInboxUri,
      sharedInboxUri: projection.actorSharedInboxUri,
      uri: projection.actorUri,
    },
    objectUri: projection.objectUri,
    outboundReaction: reaction,
    senderProfileId: reaction.profileId,
  };
};

export const deliverReactionCreation = async (
  command: ReactionDeliveryCommand | undefined,
): Promise<void> => {
  if (!command) {
    return;
  }

  try {
    const { sendProfileReaction } = await import('@kosmo/fedify');
    await sendProfileReaction(command);
  } catch (error) {
    console.error('Post-commit ActivityPub Reaction delivery failed', {
      error,
      reactionId: command.outboundReaction.id,
    });
  }
};

export const deliverReactionUndo = async (
  command: ReactionDeliveryCommand | undefined,
): Promise<void> => {
  if (!command) {
    return;
  }

  try {
    const { sendProfileReactionUndo } = await import('@kosmo/fedify');
    await sendProfileReactionUndo(command);
  } catch (error) {
    console.error('Post-commit ActivityPub Reaction Undo delivery failed', {
      error,
      reactionId: command.outboundReaction.id,
    });
  }
};
