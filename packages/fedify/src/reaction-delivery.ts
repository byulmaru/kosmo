import { EmojiReact, Like, Undo } from '@fedify/vocab';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { reactionTypeSchema } from '@kosmo/core/validation';
import { federation } from './federation';
import type { Context } from '@fedify/fedify';
import type { Recipient } from '@fedify/vocab';

type RemoteReactionActor = {
  readonly inboxUri: string | null;
  readonly sharedInboxUri: string | null;
  readonly uri: string;
};

type OutboundReaction = {
  readonly createdAt: Temporal.Instant;
  readonly id: string;
  readonly type: string;
};

type ReactionDeliveryOptions = {
  readonly actor: RemoteReactionActor;
  readonly objectUri: string;
  readonly outboundReaction: OutboundReaction;
  readonly senderProfileId: string;
};

type ReactionRecipient = Recipient & {
  readonly id: URL;
  readonly inboxId: URL;
};

const toHttpUrl = (value: string, label: string): URL => {
  const uri = new URL(value);
  if (uri.protocol !== 'http:' && uri.protocol !== 'https:') {
    throw new TypeError(`${label} must be an HTTP(S) URI.`);
  }
  return uri;
};

const createFederationContext = async (): Promise<Context<void>> => {
  const localInstance = await resolveConfiguredLocalInstance();
  return federation.createContext(new URL(localInstance.canonicalOrigin), undefined);
};

const toReactionRecipient = (actor: RemoteReactionActor): ReactionRecipient => {
  if (!actor.inboxUri) {
    throw new TypeError('ActivityPub Reaction recipient must have an inbox.');
  }

  return {
    endpoints: actor.sharedInboxUri
      ? { sharedInbox: toHttpUrl(actor.sharedInboxUri, 'ActivityPub shared inbox') }
      : null,
    id: toHttpUrl(actor.uri, 'ActivityPub Reaction recipient'),
    inboxId: toHttpUrl(actor.inboxUri, 'ActivityPub Reaction inbox'),
  };
};

const getReactionActivityUri = (canonicalOrigin: string, reactionId: string): URL =>
  new URL(`/ap/reaction/${reactionId}`, canonicalOrigin);

const createReactionActivity = (
  context: Pick<Context<void>, 'canonicalOrigin' | 'getActorUri'>,
  recipientActor: ReactionRecipient,
  { objectUri, outboundReaction, senderProfileId }: ReactionDeliveryOptions,
) => {
  const parsedType = reactionTypeSchema.safeParse(outboundReaction.type);
  if (!parsedType.success) {
    throw new TypeError('Unsupported outbound ActivityPub Reaction Type.');
  }

  const actorUri = context.getActorUri(senderProfileId);
  const activityOptions = {
    actor: actorUri,
    content: parsedType.data,
    id: getReactionActivityUri(context.canonicalOrigin, outboundReaction.id),
    object: toHttpUrl(objectUri, 'ActivityPub Reaction object'),
    published: outboundReaction.createdAt,
    tos: [recipientActor.id],
  };

  return parsedType.data === '❤️' ? new Like(activityOptions) : new EmojiReact(activityOptions);
};

export const sendProfileReaction = async (options: ReactionDeliveryOptions): Promise<void> => {
  const recipientActor = toReactionRecipient(options.actor);
  const context = await createFederationContext();
  const activity = createReactionActivity(context, recipientActor, options);
  const orderingKey = getReactionActivityUri(
    context.canonicalOrigin,
    options.outboundReaction.id,
  ).href;

  await context.sendActivity({ identifier: options.senderProfileId }, recipientActor, activity, {
    orderingKey,
  });
};

export const sendProfileReactionUndo = async (options: ReactionDeliveryOptions): Promise<void> => {
  const recipientActor = toReactionRecipient(options.actor);
  const context = await createFederationContext();
  const originalActivity = createReactionActivity(context, recipientActor, options);
  if (!originalActivity.id) {
    throw new TypeError('ActivityPub Reaction must have an ID.');
  }

  const activity = new Undo({
    actor: context.getActorUri(options.senderProfileId),
    id: new URL(`${originalActivity.id.href}#undo`),
    object: originalActivity,
    tos: [recipientActor.id],
  });

  await context.sendActivity({ identifier: options.senderProfileId }, recipientActor, activity, {
    orderingKey: originalActivity.id.href,
  });
};
