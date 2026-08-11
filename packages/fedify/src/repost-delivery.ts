import '@kosmo/core/polyfill';

import { Announce, PUBLIC_COLLECTION, Undo } from '@fedify/vocab';
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
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { resolveActivityPubPostUri } from './activitypub-post-uri';
import { federation } from './federation';
import type { Context } from '@fedify/fedify';
import type { Recipient } from '@fedify/vocab';
import type { FedifyContextData } from './fedify-context';

const FollowerProfiles = alias(Profiles, 'repost_delivery_follower_profile');
const FollowerInstances = alias(Instances, 'repost_delivery_follower_instance');

type RepostDeliveryKind = 'ANNOUNCE' | 'UNDO';

type RepostProjection = {
  readonly activityId: URL;
  readonly actorProfileId: string;
  readonly actorUri: URL;
  readonly followersUri: URL;
  readonly objectUri: URL;
  readonly orderingKey: string;
  readonly published: Temporal.Instant;
  readonly undoId: URL;
  readonly visibility: PostVisibility;
};

const parseHttpUri = (value: string): URL | undefined => {
  try {
    const uri = new URL(value);
    return uri.protocol === 'http:' || uri.protocol === 'https:' ? uri : undefined;
  } catch {
    return undefined;
  }
};

const getFollowersUri = (actorUri: URL): URL =>
  new URL(`${actorUri.pathname.replace(/\/$/, '')}/followers`, actorUri);

const loadRepostProjection = async (
  context: Context<FedifyContextData>,
  repostId: string,
  kind: RepostDeliveryKind,
): Promise<RepostProjection | undefined> => {
  const localInstance = await resolveConfiguredLocalInstance();
  const row = await db
    .select({
      authorInstanceId: Instances.id,
      authorInstanceKind: Instances.kind,
      authorInstanceOrigin: Instances.canonicalOrigin,
      authorInstanceState: Instances.state,
      authorProfileId: Profiles.id,
      authorProfileState: Profiles.state,
      repost: Posts,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(eq(Posts.id, repostId))
    .limit(1)
    .then(first);

  const expectedState = kind === 'ANNOUNCE' ? PostState.ACTIVE : PostState.DELETED;
  if (
    !row ||
    row.repost.state !== expectedState ||
    row.repost.currentContentId !== null ||
    row.repost.replyParentId !== null ||
    row.repost.repostSourceId === null ||
    (row.repost.visibility !== PostVisibility.UNLISTED &&
      row.repost.visibility !== PostVisibility.FOLLOWERS) ||
    row.authorProfileState !== ProfileState.ACTIVE ||
    row.authorInstanceId !== localInstance.id ||
    row.authorInstanceKind !== InstanceKind.LOCAL ||
    row.authorInstanceState !== InstanceState.ACTIVE ||
    row.authorInstanceOrigin !== localInstance.canonicalOrigin ||
    context.canonicalOrigin !== localInstance.canonicalOrigin
  ) {
    return undefined;
  }

  if (kind === 'ANNOUNCE') {
    const source = await db
      .select({
        currentContentId: Posts.currentContentId,
        instanceState: Instances.state,
        profileState: Profiles.state,
        state: Posts.state,
      })
      .from(Posts)
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(eq(Posts.id, row.repost.repostSourceId))
      .limit(1)
      .then(first);
    if (
      !source ||
      source.currentContentId === null ||
      source.state !== PostState.ACTIVE ||
      source.profileState !== ProfileState.ACTIVE ||
      source.instanceState === InstanceState.SUSPENDED
    ) {
      return undefined;
    }
  }

  const objectUri = await resolveActivityPubPostUri(row.repost.repostSourceId, db);
  if (!objectUri) {
    return undefined;
  }

  const actorUri = context.getActorUri(row.authorProfileId);
  const activityId = new URL(`/ap/announce/${row.repost.id}`, localInstance.canonicalOrigin);
  return {
    activityId,
    actorProfileId: row.authorProfileId,
    actorUri,
    followersUri: getFollowersUri(actorUri),
    objectUri,
    orderingKey: `activitypub-repost:${row.repost.id}`,
    published: row.repost.createdAt,
    undoId: new URL('#undo', activityId),
    visibility: row.repost.visibility,
  };
};

const loadRecipients = async (actorProfileId: string): Promise<Recipient[]> => {
  const rows = await db
    .select({
      inboxUri: ActivityPubActors.inboxUri,
      sharedInboxUri: ActivityPubActors.sharedInboxUri,
      uri: ActivityPubActors.uri,
    })
    .from(ProfileFollows)
    .innerJoin(FollowerProfiles, eq(FollowerProfiles.id, ProfileFollows.followerProfileId))
    .innerJoin(FollowerInstances, eq(FollowerInstances.id, FollowerProfiles.instanceId))
    .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, FollowerProfiles.id))
    .where(
      and(
        eq(ProfileFollows.followeeProfileId, actorProfileId),
        eq(FollowerProfiles.state, ProfileState.ACTIVE),
        eq(FollowerInstances.kind, InstanceKind.ACTIVITYPUB),
        ne(FollowerInstances.state, InstanceState.SUSPENDED),
        isNotNull(ActivityPubActors.inboxUri),
      ),
    );

  return rows.flatMap(({ inboxUri, sharedInboxUri, uri }) => {
    const id = parseHttpUri(uri);
    const inboxId = inboxUri ? parseHttpUri(inboxUri) : undefined;
    if (!id || !inboxId) {
      return [];
    }

    const sharedInbox = sharedInboxUri ? parseHttpUri(sharedInboxUri) : undefined;
    return [
      {
        endpoints: sharedInbox ? { sharedInbox } : null,
        id,
        inboxId,
      },
    ];
  });
};

const createAnnounce = (projection: RepostProjection): Announce =>
  new Announce({
    actor: projection.actorUri,
    ...(projection.visibility === PostVisibility.UNLISTED ? { ccs: [PUBLIC_COLLECTION] } : {}),
    id: projection.activityId,
    object: projection.objectUri,
    published: projection.published,
    tos: [projection.followersUri],
  });

const sendRepostActivity = async (repostId: string, kind: RepostDeliveryKind): Promise<void> => {
  const localInstance = await resolveConfiguredLocalInstance();
  const context = federation.createContext(new URL(localInstance.canonicalOrigin), { db });
  const projection = await loadRepostProjection(context, repostId, kind);
  if (!projection) {
    return;
  }

  const recipients = await loadRecipients(projection.actorProfileId);
  if (recipients.length === 0) {
    return;
  }

  const announce = createAnnounce(projection);
  const activity =
    kind === 'ANNOUNCE'
      ? announce
      : new Undo({
          actor: projection.actorUri,
          ...(projection.visibility === PostVisibility.UNLISTED
            ? { ccs: [PUBLIC_COLLECTION] }
            : {}),
          id: projection.undoId,
          object: announce,
          tos: [projection.followersUri],
        });

  await context.sendActivity({ identifier: projection.actorProfileId }, recipients, activity, {
    orderingKey: projection.orderingKey,
    preferSharedInbox: true,
  });
};

export const sendRepostAnnounce = async (repostId: string): Promise<void> =>
  sendRepostActivity(repostId, 'ANNOUNCE');

export const sendRepostUndo = async (repostId: string): Promise<void> =>
  sendRepostActivity(repostId, 'UNDO');
