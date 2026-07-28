import { Create, Delete, PUBLIC_COLLECTION } from '@fedify/vocab';
import { ActivityPubActors, db, first, Instances, Posts, Profiles } from '@kosmo/core/db';
import {
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileState,
} from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { isHttpUri } from './activitypub-uri';
import { federation } from './federation';
import { projectLocalPostNote } from './local-post-note';
import type { Context } from '@fedify/fedify';
import type { Recipient } from '@fedify/vocab';

type DeliverySource = {
  readonly authorProfileId: string;
  readonly deletedAt: Temporal.Instant | null;
  readonly replyParentId: string;
  readonly visibility: (typeof PostVisibility)[keyof typeof PostVisibility];
};

type StoredRecipient = {
  readonly inboxUri: string;
  readonly sharedInboxUri: string | null;
  readonly uri: string;
};

const createFederationContext = async (): Promise<Context<void>> => {
  const localInstance = await resolveConfiguredLocalInstance();
  return federation.createContext(new URL(localInstance.canonicalOrigin), undefined);
};

const loadDeletedReplySource = async (
  context: Context<void>,
  postId: string,
): Promise<DeliverySource | null> => {
  const row = await db
    .select({
      authorProfileId: Profiles.id,
      deletedAt: Posts.deletedAt,
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
        eq(Instances.canonicalOrigin, context.canonicalOrigin),
        eq(Instances.state, InstanceState.ACTIVE),
        eq(Profiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);

  return row?.replyParentId
    ? {
        authorProfileId: row.authorProfileId,
        deletedAt: row.deletedAt,
        replyParentId: row.replyParentId,
        visibility: row.visibility,
      }
    : null;
};

const loadRemoteParentRecipient = async (
  replyParentId: string,
): Promise<StoredRecipient | null> => {
  const row = await db
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
        eq(Posts.id, replyParentId),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.kind, InstanceKind.ACTIVITYPUB),
        inArray(Instances.state, [InstanceState.ACTIVE, InstanceState.UNRESPONSIVE]),
        isNotNull(ActivityPubActors.inboxUri),
      ),
    )
    .limit(1)
    .then(first);

  return row?.inboxUri
    ? { inboxUri: row.inboxUri, sharedInboxUri: row.sharedInboxUri, uri: row.uri }
    : null;
};

const parseHttpUri = (value: string): URL | null => {
  try {
    const uri = new URL(value);
    return isHttpUri(uri) ? uri : null;
  } catch {
    return null;
  }
};

const toRecipient = (actor: StoredRecipient): Recipient | null => {
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

  const parentActor = await loadRemoteParentRecipient(source.replyParentId);
  return parentActor ? toRecipient(parentActor) : null;
};

const noteUri = (canonicalOrigin: string | URL, postId: string): URL =>
  new URL(`/ap/note/${postId}`, canonicalOrigin);

export const sendLocalReplyCreate = async (postId: string): Promise<void> => {
  const context = await createFederationContext();
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
  const context = await createFederationContext();
  const source = await loadDeletedReplySource(context, postId);
  if (!source) {
    return;
  }

  const recipient = await selectRecipient(source);
  if (!recipient) {
    return;
  }

  const objectUri = noteUri(context.canonicalOrigin, postId);
  const followersUri = new URL(
    `${context.getActorUri(source.authorProfileId).pathname.replace(/\/$/, '')}/followers`,
    context.canonicalOrigin,
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
