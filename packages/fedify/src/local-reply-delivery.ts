import { Create, Delete, PUBLIC_COLLECTION } from '@fedify/vocab';
import { ActivityPubActors, db, first, Instances, Posts, Profiles } from '@kosmo/core/db';
import {
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileState,
} from '@kosmo/core/enums';
import { and, eq, isNotNull } from 'drizzle-orm';
import { isHttpUri } from './activitypub-uri';
import { projectLocalPostNote } from './local-post-note';
import { localReplyFederation } from './local-reply-federation';
import type { Recipient } from '@fedify/vocab';

type DeliverySource = {
  readonly authorProfileId: string;
  readonly canonicalOrigin: string;
  readonly deletedAt: Temporal.Instant | null;
  readonly localInstanceId: string;
  readonly replyParentId: string;
  readonly visibility: (typeof PostVisibility)[keyof typeof PostVisibility];
};

type StoredRecipient = {
  readonly inboxUri: string | null;
  readonly sharedInboxUri: string | null;
  readonly uri: string;
};

const createFederationContext = (
  source: Pick<DeliverySource, 'canonicalOrigin' | 'localInstanceId'>,
) =>
  localReplyFederation.createContext(new URL(source.canonicalOrigin), {
    localInstanceId: source.localInstanceId,
  });

const parseHttpUri = (value: string): URL | null => {
  try {
    const uri = new URL(value);
    return isHttpUri(uri) ? uri : null;
  } catch {
    return null;
  }
};

const toRecipient = (actor: StoredRecipient): Recipient | null => {
  if (!actor.inboxUri) {
    return null;
  }

  const id = parseHttpUri(actor.uri);
  const inboxId = parseHttpUri(actor.inboxUri);
  if (!id || !inboxId) {
    return null;
  }

  const sharedInbox = actor.sharedInboxUri ? parseHttpUri(actor.sharedInboxUri) : null;
  return {
    endpoints: sharedInbox ? { sharedInbox } : null,
    id,
    inboxId,
  };
};

const selectRecipient = async (
  source: Pick<DeliverySource, 'visibility'> & {
    readonly replyParentId: string | null;
  },
): Promise<Recipient | null> => {
  if (
    !source.replyParentId ||
    (source.visibility !== PostVisibility.PUBLIC && source.visibility !== PostVisibility.UNLISTED)
  ) {
    return null;
  }

  const parentActor = await db
    .select({
      inboxUri: ActivityPubActors.inboxUri,
      sharedInboxUri: ActivityPubActors.sharedInboxUri,
      uri: ActivityPubActors.uri,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .where(
      and(
        eq(Posts.id, source.replyParentId),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.kind, InstanceKind.ACTIVITYPUB),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(ActivityPubActors.inboxUri),
      ),
    )
    .limit(1)
    .then(first);

  return parentActor ? toRecipient(parentActor) : null;
};

const noteUri = (canonicalOrigin: string | URL, postId: string): URL =>
  new URL(`/ap/note/${postId}`, canonicalOrigin);

export const sendLocalReplyCreate = async (postId: string): Promise<void> => {
  const source = await db
    .select({ canonicalOrigin: Instances.canonicalOrigin, localInstanceId: Instances.id })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(Posts.id, postId),
        eq(Posts.state, PostState.ACTIVE),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
        eq(Profiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);
  if (!source?.canonicalOrigin) {
    return;
  }

  const context = createFederationContext({
    canonicalOrigin: source.canonicalOrigin,
    localInstanceId: source.localInstanceId,
  });
  const projection = await projectLocalPostNote(context, postId);
  if (!projection?.replyParentId) {
    return;
  }

  const recipient = await selectRecipient(projection);
  if (!recipient) {
    return;
  }

  const objectUri = noteUri(projection.canonicalOrigin, postId);
  const activity = new Create({
    actor: context.getActorUri(projection.authorProfileId),
    ccs: projection.object.ccIds,
    id: new URL('#create', objectUri),
    object: projection.object,
    published: projection.createdAt,
    tos: projection.object.toIds,
  });
  await context.sendActivity({ identifier: projection.authorProfileId }, recipient, activity, {
    orderingKey: objectUri.href,
    preferSharedInbox: true,
  });
};

export const sendLocalReplyDelete = async (postId: string): Promise<void> => {
  const source = await db
    .select({
      authorProfileId: Profiles.id,
      canonicalOrigin: Instances.canonicalOrigin,
      deletedAt: Posts.deletedAt,
      localInstanceId: Instances.id,
      replyParentId: Posts.replyParentId,
      visibility: Posts.visibility,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(Posts.id, postId),
        eq(Posts.state, PostState.DELETED),
        isNotNull(Posts.replyParentId),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
        eq(Profiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);
  if (!source?.replyParentId || !source.canonicalOrigin) {
    return;
  }

  const context = createFederationContext({
    canonicalOrigin: source.canonicalOrigin,
    localInstanceId: source.localInstanceId,
  });
  const recipient = await selectRecipient(source);
  if (!recipient) {
    return;
  }

  const objectUri = noteUri(source.canonicalOrigin, postId);
  const followersUri = new URL(
    `${context.getActorUri(source.authorProfileId).pathname.replace(/\/$/, '')}/followers`,
    source.canonicalOrigin,
  );
  const activity = new Delete({
    actor: context.getActorUri(source.authorProfileId),
    ccs:
      source.visibility === PostVisibility.PUBLIC
        ? [followersUri]
        : source.visibility === PostVisibility.UNLISTED
          ? [PUBLIC_COLLECTION]
          : [],
    id: new URL('#delete', objectUri),
    object: objectUri,
    published: source.deletedAt,
    tos: source.visibility === PostVisibility.PUBLIC ? [PUBLIC_COLLECTION] : [followersUri],
  });
  await context.sendActivity({ identifier: source.authorProfileId }, recipient, activity, {
    orderingKey: objectUri.href,
    preferSharedInbox: true,
  });
};
