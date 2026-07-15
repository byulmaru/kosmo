import '@kosmo/core/polyfill';

import { Follow } from '@fedify/vocab';
import { ActivityPubActors, db, first, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { recordInboundFollow, removeInboundFollow } from '@kosmo/core/services';
import { and, eq, getColumns } from 'drizzle-orm';
import { sendAcceptFollowActivity } from './follow-delivery';
import {
  findOrMaterializeRemoteProfileActorByUri,
  findUsableStoredRemoteProfileActorByUri,
} from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Recipient, Undo } from '@fedify/vocab';

type LocalRecipient = {
  actor: typeof ActivityPubActors.$inferSelect;
  profile: typeof Profiles.$inferSelect;
};

const getNow = () => Temporal.Now.instant();

const isHttpUri = (uri: URL | null): uri is URL =>
  uri !== null && (uri.protocol === 'http:' || uri.protocol === 'https:');

const findActiveLocalRecipient = async (actorUri: URL): Promise<LocalRecipient | undefined> =>
  db
    .select({ actor: getColumns(ActivityPubActors), profile: getColumns(Profiles) })
    .from(ActivityPubActors)
    .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(ActivityPubActors.uri, actorUri.href),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        eq(Profiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);

const resolveLocalRecipient = async (
  context: InboxContext<void>,
  objectUri: URL,
): Promise<LocalRecipient | undefined> => {
  if (
    context.recipient !== null &&
    context.getActorUri(context.recipient).href !== objectUri.href
  ) {
    return undefined;
  }

  const recipient = await findActiveLocalRecipient(objectUri);

  if (context.recipient !== null && recipient?.profile.id !== context.recipient) {
    return undefined;
  }

  return recipient;
};

const toRecipient = (actor: typeof ActivityPubActors.$inferSelect): Recipient | undefined => {
  if (!actor.inboxUri) {
    return undefined;
  }

  return {
    endpoints: actor.sharedInboxUri ? { sharedInbox: new URL(actor.sharedInboxUri) } : null,
    id: new URL(actor.uri),
    inboxId: new URL(actor.inboxUri),
  };
};

export const handleInboundFollow = async (
  context: InboxContext<void>,
  follow: Follow,
  now: Temporal.Instant = getNow(),
): Promise<void> => {
  const actorUri = follow.actorId;
  const objectUri = follow.objectId;

  if (!isHttpUri(actorUri) || !isHttpUri(objectUri)) {
    return;
  }

  // Local validation intentionally precedes every remote lookup.
  const localRecipient = await resolveLocalRecipient(context, objectUri);
  if (!localRecipient) {
    return;
  }

  let remoteActor: Awaited<ReturnType<typeof findOrMaterializeRemoteProfileActorByUri>>;

  try {
    remoteActor = await findOrMaterializeRemoteProfileActorByUri({ actorUri, context, now });
  } catch {
    return;
  }

  const result = await recordInboundFollow({
    correlation: {
      activityId: follow.id?.href ?? null,
      actorUri: actorUri.href,
      objectUri: objectUri.href,
    },
    followeeProfileId: localRecipient.profile.id,
    followerProfileId: remoteActor.profile.id,
  });

  if (result.kind !== 'ESTABLISHED') {
    return;
  }

  const recipientActor = toRecipient(remoteActor.actor);
  if (!recipientActor) {
    return;
  }

  try {
    await sendAcceptFollowActivity({
      context,
      receivedFollow: follow,
      recipientActor,
      senderProfileId: localRecipient.profile.id,
    });
  } catch {
    // The projection is authoritative; delivery retries belong to a separate slice.
  }
};

const noNetworkDocumentLoader = async (url: string) => {
  throw new Error(`Network lookup is disabled for inbound Undo: ${url}`);
};

export const handleInboundUndo = async (context: InboxContext<void>, undo: Undo): Promise<void> => {
  const actorUri = undo.actorId;
  if (!isHttpUri(actorUri)) {
    return;
  }

  // Undo never materializes or dereferences an unknown actor.
  let remoteActor: Awaited<ReturnType<typeof findUsableStoredRemoteProfileActorByUri>>;

  try {
    remoteActor = await findUsableStoredRemoteProfileActorByUri(actorUri);
  } catch {
    return;
  }

  if (!remoteActor || remoteActor.instance.state !== InstanceState.ACTIVE) {
    return;
  }

  const embedded = await undo.getObject({
    documentLoader: noNetworkDocumentLoader,
    suppressError: true,
  });
  if (!(embedded instanceof Follow)) {
    return;
  }

  const objectUri = embedded.objectId;
  if (
    !isHttpUri(objectUri) ||
    embedded.actorId?.href !== actorUri.href ||
    undo.actorId?.href !== embedded.actorId.href
  ) {
    return;
  }

  const localRecipient = await resolveLocalRecipient(context, objectUri);
  if (!localRecipient) {
    return;
  }

  await removeInboundFollow({
    actorUri: actorUri.href,
    followeeProfileId: localRecipient.profile.id,
    followerProfileId: remoteActor.profile.id,
    objectUri: objectUri.href,
  });
};
