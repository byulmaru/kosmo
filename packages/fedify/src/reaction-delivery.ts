import { EmojiReact, Like, Undo } from '@fedify/vocab';
import {
  ActivityPubActors,
  ActivityPubPosts,
  db,
  first,
  Instances,
  Posts,
  Profiles,
} from '@kosmo/core/db';
import { InstanceKind, InstanceState, PostState, ProfileState } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { reactionTypeSchema } from '@kosmo/core/validation';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { federation } from './federation';
import type { Context } from '@fedify/fedify';
import type { Recipient } from '@fedify/vocab';
import type { Reactions } from '@kosmo/core/db';

const SenderProfiles = alias(Profiles, 'outbound_reaction_sender_profile');
const SenderInstances = alias(Instances, 'outbound_reaction_sender_instance');
const TargetActors = alias(ActivityPubActors, 'outbound_reaction_target_actor');

type OutboundReaction = typeof Reactions.$inferSelect;

type ReactionRecipient = Recipient & {
  readonly id: URL;
  readonly inboxId: URL;
};

type ReactionProjection = {
  readonly canonicalOrigin: string;
  readonly objectUri: URL;
  readonly reaction: OutboundReaction;
  readonly recipient: ReactionRecipient;
};

const toHttpUrl = (value: string, label: string): URL => {
  const uri = new URL(value);
  if (uri.protocol !== 'http:' && uri.protocol !== 'https:') {
    throw new TypeError(`${label} must be an HTTP(S) URI.`);
  }
  return uri;
};

const getReactionActivityUri = (canonicalOrigin: string, reactionId: string): URL =>
  new URL(`/ap/reaction/${reactionId}`, canonicalOrigin);

const loadReactionProjection = async (
  reaction: OutboundReaction,
): Promise<ReactionProjection | undefined> => {
  const row = await db
    .select({
      actorInboxUri: TargetActors.inboxUri,
      actorSharedInboxUri: TargetActors.sharedInboxUri,
      actorUri: TargetActors.uri,
      objectUri: ActivityPubPosts.uri,
      senderInstanceId: SenderInstances.id,
      senderInstanceKind: SenderInstances.kind,
      senderInstanceOrigin: SenderInstances.canonicalOrigin,
      senderInstanceState: SenderInstances.state,
      senderProfileState: SenderProfiles.state,
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
    .where(and(eq(Posts.id, reaction.postId), eq(Posts.state, PostState.ACTIVE)))
    .limit(1)
    .then(first);

  if (
    !row ||
    row.senderInstanceKind !== InstanceKind.LOCAL ||
    row.senderInstanceState !== InstanceState.ACTIVE ||
    row.senderProfileState !== ProfileState.ACTIVE ||
    row.targetInstanceKind !== InstanceKind.ACTIVITYPUB ||
    row.targetInstanceState !== InstanceState.ACTIVE ||
    row.targetProfileState !== ProfileState.ACTIVE ||
    !row.objectUri ||
    !row.actorUri ||
    !row.actorInboxUri
  ) {
    return undefined;
  }

  const localInstance = await resolveConfiguredLocalInstance();
  if (
    row.senderInstanceId !== localInstance.id ||
    row.senderInstanceOrigin !== localInstance.canonicalOrigin
  ) {
    return undefined;
  }

  return {
    canonicalOrigin: localInstance.canonicalOrigin,
    objectUri: toHttpUrl(row.objectUri, 'ActivityPub Reaction object'),
    reaction,
    recipient: {
      endpoints: row.actorSharedInboxUri
        ? { sharedInbox: toHttpUrl(row.actorSharedInboxUri, 'ActivityPub shared inbox') }
        : null,
      id: toHttpUrl(row.actorUri, 'ActivityPub Reaction recipient'),
      inboxId: toHttpUrl(row.actorInboxUri, 'ActivityPub Reaction inbox'),
    },
  };
};

const createReactionActivity = (
  context: Pick<Context<void>, 'canonicalOrigin' | 'getActorUri'>,
  projection: ReactionProjection,
) => {
  const parsedType = reactionTypeSchema.safeParse(projection.reaction.type);
  if (!parsedType.success) {
    throw new TypeError('Unsupported outbound ActivityPub Reaction Type.');
  }

  const activityOptions = {
    actor: context.getActorUri(projection.reaction.profileId),
    content: parsedType.data,
    id: getReactionActivityUri(context.canonicalOrigin, projection.reaction.id),
    object: projection.objectUri,
    published: projection.reaction.createdAt,
    tos: [projection.recipient.id],
  };

  return parsedType.data === '❤️' ? new Like(activityOptions) : new EmojiReact(activityOptions);
};

export const sendReaction = async (reaction: OutboundReaction): Promise<void> => {
  const projection = await loadReactionProjection(reaction);
  if (!projection) {
    return;
  }

  const context = federation.createContext(new URL(projection.canonicalOrigin), undefined);
  const activity = createReactionActivity(context, projection);
  const orderingKey = getReactionActivityUri(context.canonicalOrigin, reaction.id).href;
  await context.sendActivity({ identifier: reaction.profileId }, projection.recipient, activity, {
    orderingKey,
    preferSharedInbox: true,
  });
};

export const sendReactionUndo = async (reaction: OutboundReaction): Promise<void> => {
  const projection = await loadReactionProjection(reaction);
  if (!projection) {
    return;
  }

  const context = federation.createContext(new URL(projection.canonicalOrigin), undefined);
  const originalActivity = createReactionActivity(context, projection);
  if (!originalActivity.id) {
    throw new TypeError('ActivityPub Reaction must have an ID.');
  }

  const activity = new Undo({
    actor: context.getActorUri(reaction.profileId),
    id: new URL(`${originalActivity.id.href}#undo`),
    object: originalActivity,
    tos: [projection.recipient.id],
  });

  await context.sendActivity({ identifier: reaction.profileId }, projection.recipient, activity, {
    orderingKey: originalActivity.id.href,
    preferSharedInbox: true,
  });
};
