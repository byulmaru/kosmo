import { Create, Delete, PUBLIC_COLLECTION } from '@fedify/vocab';
import {
  ActivityPubActors,
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
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { and, eq, isNotNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { federation } from './federation';
import { projectLocalPostNote } from './local-post-note';
import type { Context } from '@fedify/fedify';
import type { Recipient } from '@fedify/vocab';

const ParentPosts = alias(Posts, 'local_reply_delivery_parent_post');
const ParentProfiles = alias(Profiles, 'local_reply_delivery_parent_profile');
const ParentInstances = alias(Instances, 'local_reply_delivery_parent_instance');
const ParentActors = alias(ActivityPubActors, 'local_reply_delivery_parent_actor');

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

const loadFollowerRecipients = async (authorProfileId: string): Promise<StoredRecipient[]> =>
  db
    .select({
      inboxUri: ActivityPubActors.inboxUri,
      sharedInboxUri: ActivityPubActors.sharedInboxUri,
      uri: ActivityPubActors.uri,
    })
    .from(ProfileFollows)
    .innerJoin(Profiles, eq(Profiles.id, ProfileFollows.followerProfileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .where(
      and(
        eq(ProfileFollows.followeeProfileId, authorProfileId),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.kind, InstanceKind.ACTIVITYPUB),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(ActivityPubActors.inboxUri),
      ),
    )
    .then((rows) =>
      rows.flatMap((row) =>
        row.inboxUri
          ? [{ inboxUri: row.inboxUri, sharedInboxUri: row.sharedInboxUri, uri: row.uri }]
          : [],
      ),
    );

const loadRemoteParentRecipient = async (
  replyParentId: string,
): Promise<StoredRecipient | null> => {
  const row = await db
    .select({
      inboxUri: ParentActors.inboxUri,
      sharedInboxUri: ParentActors.sharedInboxUri,
      uri: ParentActors.uri,
    })
    .from(ParentPosts)
    .innerJoin(ParentProfiles, eq(ParentProfiles.id, ParentPosts.profileId))
    .innerJoin(ParentInstances, eq(ParentInstances.id, ParentProfiles.instanceId))
    .innerJoin(ParentActors, eq(ParentActors.profileId, ParentProfiles.id))
    .where(
      and(
        eq(ParentPosts.id, replyParentId),
        eq(ParentProfiles.state, ProfileState.ACTIVE),
        eq(ParentInstances.kind, InstanceKind.ACTIVITYPUB),
        eq(ParentInstances.state, InstanceState.ACTIVE),
        isNotNull(ParentActors.inboxUri),
      ),
    )
    .limit(1)
    .then(first);

  return row?.inboxUri
    ? { inboxUri: row.inboxUri, sharedInboxUri: row.sharedInboxUri, uri: row.uri }
    : null;
};

const toRecipient = (actor: StoredRecipient): Recipient | null => {
  try {
    let sharedInbox: URL | undefined;
    if (actor.sharedInboxUri) {
      try {
        sharedInbox = new URL(actor.sharedInboxUri);
      } catch {
        // 잘못 저장된 optional shared inbox는 usable personal inbox를 막지 않는다.
      }
    }
    return {
      endpoints: sharedInbox ? { sharedInbox } : null,
      id: new URL(actor.uri),
      inboxId: new URL(actor.inboxUri),
    };
  } catch {
    return null;
  }
};

const selectRecipients = async (
  source: Pick<DeliverySource, 'authorProfileId' | 'visibility'> & {
    readonly replyParentId: string | null;
  },
): Promise<Recipient[]> => {
  if (!source.replyParentId || source.visibility === PostVisibility.DIRECT) {
    return [];
  }

  const actors = await loadFollowerRecipients(source.authorProfileId);
  if (
    source.visibility === PostVisibility.PUBLIC ||
    source.visibility === PostVisibility.UNLISTED
  ) {
    const parentActor = await loadRemoteParentRecipient(source.replyParentId);
    if (parentActor) {
      actors.push(parentActor);
    }
  }

  return [...new Map(actors.map((actor) => [actor.uri, actor])).values()].flatMap((actor) => {
    const recipient = toRecipient(actor);
    return recipient ? [recipient] : [];
  });
};

const noteUri = (canonicalOrigin: string | URL, postId: string): URL =>
  new URL(`/ap/note/${postId}`, canonicalOrigin);

export const sendLocalReplyCreate = async (postId: string): Promise<void> => {
  const context = await createFederationContext();
  const projection = await projectLocalPostNote(context, postId);
  if (!projection?.replyParentId) {
    return;
  }

  const recipients = await selectRecipients(projection);
  if (recipients.length === 0) {
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
  await context.sendActivity({ identifier: projection.authorProfileId }, recipients, activity, {
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

  const recipients = await selectRecipients(source);
  if (recipients.length === 0) {
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
  await context.sendActivity({ identifier: source.authorProfileId }, recipients, activity, {
    orderingKey: objectUri.href,
    preferSharedInbox: true,
  });
};
