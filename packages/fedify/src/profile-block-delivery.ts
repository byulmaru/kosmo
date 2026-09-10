import { Block, Undo } from '@fedify/vocab';
import { ActivityPubActors, db, first, Instances, ProfileBlocks, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import {
  ensureProfileBlockProtocolActivity,
  loadProfileBlockProtocolActivityByProfileBlockId,
  markProfileBlockProtocolDeliveryPending,
  markProfileBlockProtocolDeliverySettled,
  markProfileBlockProtocolUndoPending,
  markProfileBlockProtocolUndoSettled,
} from '@kosmo/core/services';
import { and, eq, isNotNull } from 'drizzle-orm';
import { localOutboundFederation } from './local-outbound-federation';
import { dispatchActivityPubActivity } from './outbound-recipient-dispatch';
import type { ActivityPubDispatchResult } from './outbound-recipient-dispatch';

export type ProfileBlockDeliveryResult =
  | { readonly status: 'SETTLED' }
  | { readonly status: 'PENDING'; readonly reason: 'recipient_unavailable' }
  | { readonly status: 'SKIPPED'; readonly reason: 'not_remote_target' | 'stale_source' };

export const getProfileBlockActivityUri = (
  canonicalOrigin: string | URL,
  profileBlockId: string,
): URL => new URL(`/ap/block/${encodeURIComponent(profileBlockId)}`, canonicalOrigin);

export const getProfileBlockUndoActivityUri = (
  canonicalOrigin: string | URL,
  profileBlockId: string,
): URL => new URL(`/ap/block/${encodeURIComponent(profileBlockId)}/undo`, canonicalOrigin);

export const getProfileBlockOrderingKey = (actorUri: URL, objectUri: URL): string =>
  `profile-block:${actorUri.href}\n${objectUri.href}`;

type OutboundProfileBlockSource = {
  readonly canonicalOrigin: string | null;
  readonly localInstanceId: string;
  readonly ownerProfileId: string;
  readonly targetActorUri: string | null;
  readonly targetInstanceKind: InstanceKind;
  readonly targetProfileId: string;
};

const loadOutboundProfileBlockParticipants = async ({
  ownerProfileId,
  targetProfileId,
}: {
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
}): Promise<OutboundProfileBlockSource | undefined> =>
  db
    .select({
      canonicalOrigin: Instances.canonicalOrigin,
      localInstanceId: Instances.id,
      ownerProfileId: Profiles.id,
    })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(Profiles.id, ownerProfileId),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
      ),
    )
    .limit(1)
    .then(first)
    .then(async (source) => {
      if (!source) {
        return undefined;
      }
      const target = await db
        .select({
          actorUri: ActivityPubActors.uri,
          instanceKind: Instances.kind,
          profileId: Profiles.id,
        })
        .from(Profiles)
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
        .where(eq(Profiles.id, targetProfileId))
        .limit(1)
        .then(first);
      return {
        ...source,
        targetProfileId,
        targetActorUri: target?.actorUri ?? null,
        targetInstanceKind: target?.instanceKind ?? InstanceKind.LOCAL,
      };
    });

const loadOutboundProfileBlockSource = async (
  profileBlockId: string,
): Promise<OutboundProfileBlockSource | undefined> => {
  const relation = await db
    .select({
      ownerProfileId: ProfileBlocks.ownerProfileId,
      targetProfileId: ProfileBlocks.targetProfileId,
    })
    .from(ProfileBlocks)
    .where(eq(ProfileBlocks.id, profileBlockId))
    .limit(1)
    .then(first);
  if (!relation) {
    return undefined;
  }
  return loadOutboundProfileBlockParticipants(relation);
};

const toPendingResult = (result: ActivityPubDispatchResult): ProfileBlockDeliveryResult =>
  result.status === 'PENDING'
    ? { reason: 'recipient_unavailable', status: 'PENDING' }
    : { status: 'SETTLED' };

export const sendProfileBlock = async (
  profileBlockId: string,
  { createIfMissing = false }: { readonly createIfMissing?: boolean } = {},
): Promise<ProfileBlockDeliveryResult> => {
  const existing = await loadProfileBlockProtocolActivityByProfileBlockId(profileBlockId);
  const source =
    (await loadOutboundProfileBlockSource(profileBlockId)) ??
    (existing?.origin === 'OUTBOUND'
      ? await loadOutboundProfileBlockParticipants({
          ownerProfileId: existing.ownerProfileId,
          targetProfileId: existing.targetProfileId,
        })
      : undefined);
  if (!source) {
    return { reason: 'stale_source', status: 'SKIPPED' };
  }
  if (source.targetInstanceKind !== InstanceKind.ACTIVITYPUB) {
    return { reason: 'not_remote_target', status: 'SKIPPED' };
  }
  if (!source.canonicalOrigin || !source.targetActorUri) {
    return { reason: 'recipient_unavailable', status: 'PENDING' };
  }

  const context = localOutboundFederation.createContext(new URL(source.canonicalOrigin), {
    localInstanceId: source.localInstanceId,
  });
  const actorUri = context.getActorUri(source.ownerProfileId);
  let objectUri: URL;
  try {
    objectUri = existing ? new URL(existing.objectUri) : new URL(source.targetActorUri);
  } catch {
    return { reason: 'recipient_unavailable', status: 'PENDING' };
  }
  if (existing?.origin !== undefined && existing.origin !== 'OUTBOUND') {
    return { reason: 'stale_source', status: 'SKIPPED' };
  }
  if (!existing && !createIfMissing) {
    return { reason: 'stale_source', status: 'SKIPPED' };
  }
  if (existing?.origin === 'OUTBOUND' && existing.deliveryState === 'SETTLED') {
    return { status: 'SETTLED' };
  }

  const activityUri = existing
    ? new URL(existing.activityUri)
    : getProfileBlockActivityUri(context.canonicalOrigin, profileBlockId);
  const outboundActorUri = existing ? new URL(existing.actorUri) : actorUri;

  await ensureProfileBlockProtocolActivity({
    activityUri: activityUri.href,
    actorUri: outboundActorUri.href,
    objectUri: objectUri.href,
    origin: 'OUTBOUND',
    ownerProfileId: source.ownerProfileId,
    profileBlockId,
    targetProfileId: source.targetProfileId,
  });

  const result = await dispatchActivityPubActivity({
    activity: new Block({
      actor: outboundActorUri,
      id: activityUri,
      object: objectUri,
      tos: [objectUri],
    }),
    actorProfileId: source.ownerProfileId,
    context,
    directOnly: true,
    directProfileIds: [source.targetProfileId],
    orderingKey: getProfileBlockOrderingKey(outboundActorUri, objectUri),
  });
  if (result.status === 'PENDING') {
    await markProfileBlockProtocolDeliveryPending(activityUri.href);
    return toPendingResult(result);
  }
  await markProfileBlockProtocolDeliverySettled(activityUri.href);
  return { status: 'SETTLED' };
};

export const sendProfileBlockUndo = async ({
  ownerProfileId,
  profileBlockId,
  targetProfileId,
}: {
  readonly ownerProfileId: string;
  readonly profileBlockId: string;
  readonly targetProfileId: string;
}): Promise<ProfileBlockDeliveryResult> => {
  const protocol = await loadProfileBlockProtocolActivityByProfileBlockId(profileBlockId);
  if (!protocol || protocol.origin !== 'OUTBOUND') {
    return { reason: 'stale_source', status: 'SKIPPED' };
  }
  if (protocol.state === 'CLOSING' || protocol.state === 'CLOSED') {
    if (protocol.state === 'CLOSED' || protocol.undoDeliveryState === 'SETTLED') {
      return { status: 'SETTLED' };
    }
  }
  if (protocol.ownerProfileId !== ownerProfileId || protocol.targetProfileId !== targetProfileId) {
    return { reason: 'stale_source', status: 'SKIPPED' };
  }

  const source =
    (await loadOutboundProfileBlockSource(profileBlockId)) ??
    (await loadOutboundProfileBlockParticipants({ ownerProfileId, targetProfileId }));
  if (!source) {
    return { reason: 'stale_source', status: 'SKIPPED' };
  }
  if (source.targetInstanceKind !== InstanceKind.ACTIVITYPUB) {
    return { reason: 'not_remote_target', status: 'SKIPPED' };
  }
  if (protocol.deliveryState !== 'SETTLED') {
    const blockResult = await sendProfileBlock(profileBlockId);
    if (blockResult.status !== 'SETTLED') {
      return blockResult;
    }
  }
  if (!source?.canonicalOrigin) {
    return { reason: 'recipient_unavailable', status: 'PENDING' };
  }

  const context = localOutboundFederation.createContext(new URL(source.canonicalOrigin), {
    localInstanceId: source.localInstanceId,
  });
  const actorUri = new URL(protocol.actorUri);
  const objectUri = new URL(protocol.objectUri);
  const blockUri = new URL(protocol.activityUri);
  const undoUri = new URL(`${blockUri.href}/undo`);
  const result = await dispatchActivityPubActivity({
    activity: new Undo({
      actor: actorUri,
      id: undoUri,
      object: new Block({ actor: actorUri, id: blockUri, object: objectUri }),
      tos: [objectUri],
    }),
    actorProfileId: ownerProfileId,
    context,
    directOnly: true,
    directProfileIds: [targetProfileId],
    orderingKey: getProfileBlockOrderingKey(actorUri, objectUri),
  });
  if (result.status === 'PENDING') {
    await markProfileBlockProtocolUndoPending(protocol.activityUri);
    return toPendingResult(result);
  }
  await markProfileBlockProtocolUndoSettled(protocol.activityUri);
  return { status: 'SETTLED' };
};
