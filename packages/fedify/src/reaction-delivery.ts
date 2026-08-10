import { EmojiReact, Like, Undo } from '@fedify/vocab';
import {
  ActivityPubActors,
  ActivityPubPosts,
  db,
  first,
  Instances,
  Posts,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import {
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileState,
} from '@kosmo/core/enums';
import { reactionTypeSchema } from '@kosmo/core/validation';
import { and, eq, inArray, isNotNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { federation } from './federation';
import { createFedifyExecutionContext } from './fedify-execution';
import { ensureDrizzleLocalProfileActor } from './local-actor-store';
import type { SenderKeyPair } from '@fedify/fedify';
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
  readonly actorUri: URL;
  readonly canonicalOrigin: string;
  readonly objectUri: URL;
  readonly reaction: OutboundReaction;
  readonly recipient: ReactionRecipient;
  readonly senderKeys: SenderKeyPair[];
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

const toSenderKeys = (actorUri: URL, keyPairs: readonly CryptoKeyPair[]): SenderKeyPair[] =>
  keyPairs.map(({ privateKey }, index) => ({
    keyId: new URL(index === 0 ? '#main-key' : `#key-${index + 1}`, actorUri),
    privateKey,
  }));

const loadReactionProjection = async (
  reaction: OutboundReaction,
  activity: 'REACTION' | 'UNDO',
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
    .leftJoin(
      ProfileFollows,
      and(
        eq(ProfileFollows.followerProfileId, reaction.profileId),
        eq(ProfileFollows.followeeProfileId, Posts.profileId),
      ),
    )
    .leftJoin(ActivityPubPosts, eq(ActivityPubPosts.postId, Posts.id))
    .leftJoin(TargetActors, eq(TargetActors.profileId, Profiles.id))
    .where(
      and(
        eq(Posts.id, reaction.postId),
        eq(Posts.state, PostState.ACTIVE),
        activity === 'REACTION'
          ? or(
              inArray(Posts.visibility, [PostVisibility.PUBLIC, PostVisibility.UNLISTED]),
              and(eq(Posts.visibility, PostVisibility.FOLLOWERS), isNotNull(ProfileFollows.id)),
            )
          : undefined,
      ),
    )
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

  if (!row.senderInstanceOrigin) {
    return undefined;
  }

  const canonicalOrigin = toHttpUrl(
    row.senderInstanceOrigin,
    'ActivityPub Reaction sender origin',
  ).origin;
  const actorUri = new URL(`/ap/actor/${reaction.profileId}`, canonicalOrigin);
  const sender = await ensureDrizzleLocalProfileActor({
    actorUri,
    localInstanceId: row.senderInstanceId,
    profileId: reaction.profileId,
  });
  if (!sender) {
    return undefined;
  }

  return {
    actorUri,
    canonicalOrigin,
    objectUri: toHttpUrl(row.objectUri, 'ActivityPub Reaction object'),
    reaction,
    recipient: {
      endpoints: row.actorSharedInboxUri
        ? { sharedInbox: toHttpUrl(row.actorSharedInboxUri, 'ActivityPub shared inbox') }
        : null,
      id: toHttpUrl(row.actorUri, 'ActivityPub Reaction recipient'),
      inboxId: toHttpUrl(row.actorInboxUri, 'ActivityPub Reaction inbox'),
    },
    senderKeys: toSenderKeys(actorUri, sender.keyPairs),
  };
};

const createReactionActivity = (projection: ReactionProjection) => {
  const parsedType = reactionTypeSchema.safeParse(projection.reaction.type);
  if (!parsedType.success) {
    throw new TypeError('Unsupported outbound ActivityPub Reaction Type.');
  }

  const activityOptions = {
    actor: projection.actorUri,
    content: parsedType.data,
    id: getReactionActivityUri(projection.canonicalOrigin, projection.reaction.id),
    object: projection.objectUri,
    published: projection.reaction.createdAt,
    tos: [projection.recipient.id],
  };

  return parsedType.data === '❤️' ? new Like(activityOptions) : new EmojiReact(activityOptions);
};

export const sendReaction = async (reaction: OutboundReaction): Promise<void> => {
  const projection = await loadReactionProjection(reaction, 'REACTION');
  if (!projection) {
    return;
  }

  const context = federation.createContext(
    new URL(projection.canonicalOrigin),
    createFedifyExecutionContext(),
  );
  const activity = createReactionActivity(projection);
  const orderingKey = getReactionActivityUri(projection.canonicalOrigin, reaction.id).href;
  await context.sendActivity(projection.senderKeys, projection.recipient, activity, {
    orderingKey,
    preferSharedInbox: true,
  });
};

export const sendReactionUndo = async (reaction: OutboundReaction): Promise<void> => {
  const projection = await loadReactionProjection(reaction, 'UNDO');
  if (!projection) {
    return;
  }

  const context = federation.createContext(
    new URL(projection.canonicalOrigin),
    createFedifyExecutionContext(),
  );
  const originalActivity = createReactionActivity(projection);
  if (!originalActivity.id) {
    throw new TypeError('ActivityPub Reaction must have an ID.');
  }

  const activity = new Undo({
    actor: projection.actorUri,
    id: new URL(`${originalActivity.id.href}#undo`),
    object: originalActivity,
    tos: [projection.recipient.id],
  });

  await context.sendActivity(projection.senderKeys, projection.recipient, activity, {
    orderingKey: originalActivity.id.href,
    preferSharedInbox: true,
  });
};
