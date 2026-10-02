import { Block, Undo } from '@fedify/vocab';
import { ActivityPubActors, db, first, Instances, ProfileBlocks, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { and, eq, isNotNull } from 'drizzle-orm';
import { localOutboundFederation } from './local-outbound-federation';
import { dispatchActivityPubActivity } from './outbound-recipient-dispatch';
import {
  materializeRemoteProfileActor,
  RemoteActorMaterializationError,
} from './remote-actor-materialization';
import type { Context } from '@fedify/fedify';
import type { Activity } from '@fedify/vocab';
import type { LocalOutboundContextData } from './local-outbound-federation';

export type ProfileBlockDeliveryResult =
  | { readonly status: 'SETTLED' }
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

const loadOutboundProfileBlockParticipants = async (
  {
    ownerProfileId,
    targetProfileId,
  }: {
    readonly ownerProfileId: string;
    readonly targetProfileId: string;
  },
  requireActiveOwner = true,
): Promise<OutboundProfileBlockSource | undefined> =>
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
        eq(Instances.kind, InstanceKind.LOCAL),
        isNotNull(Instances.canonicalOrigin),
        ...(requireActiveOwner
          ? [eq(Profiles.state, ProfileState.ACTIVE), eq(Instances.state, InstanceState.ACTIVE)]
          : []),
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

const dispatchProfileBlockActivity = async ({
  activity,
  actorProfileId,
  context,
  objectUri,
  orderingKey,
  targetProfileId,
}: {
  readonly activity: Activity;
  readonly actorProfileId: string;
  readonly context: Context<LocalOutboundContextData>;
  readonly objectUri: URL;
  readonly orderingKey: string;
  readonly targetProfileId: string;
}): Promise<void> => {
  const dispatch = () =>
    dispatchActivityPubActivity({
      activity,
      actorProfileId,
      context,
      directOnly: true,
      directProfileIds: [targetProfileId],
      orderingKey,
    });

  if ((await dispatch()).status === 'SETTLED') {
    return;
  }

  await materializeRemoteProfileActor({
    actorUri: objectUri,
    context,
    reactivateUnresponsive: true,
  });

  if ((await dispatch()).status === 'PENDING') {
    throw new RemoteActorMaterializationError(
      'Materialized Profile Block recipient is unavailable.',
    );
  }
};

export const sendProfileBlock = async (
  profileBlockId: string,
): Promise<ProfileBlockDeliveryResult> => {
  const source = await loadOutboundProfileBlockSource(profileBlockId);
  if (!source) {
    return { reason: 'stale_source', status: 'SKIPPED' };
  }
  if (source.targetInstanceKind !== InstanceKind.ACTIVITYPUB) {
    return { reason: 'not_remote_target', status: 'SKIPPED' };
  }
  if (!source.canonicalOrigin || !source.targetActorUri) {
    throw new RemoteActorMaterializationError('Profile Block recipient actor URI is unavailable.');
  }

  const context = localOutboundFederation.createContext(new URL(source.canonicalOrigin), {
    localInstanceId: source.localInstanceId,
  });
  const actorUri = context.getActorUri(source.ownerProfileId);
  let objectUri: URL;
  try {
    objectUri = new URL(source.targetActorUri);
  } catch {
    throw new RemoteActorMaterializationError('Profile Block recipient actor URI is invalid.');
  }
  const activityUri = getProfileBlockActivityUri(context.canonicalOrigin, profileBlockId);

  const activity = new Block({
    actor: actorUri,
    id: activityUri,
    object: objectUri,
    tos: [objectUri],
  });
  await dispatchProfileBlockActivity({
    activity,
    actorProfileId: source.ownerProfileId,
    context,
    objectUri,
    orderingKey: getProfileBlockOrderingKey(actorUri, objectUri),
    targetProfileId: source.targetProfileId,
  });
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
  const source = await loadOutboundProfileBlockParticipants(
    { ownerProfileId, targetProfileId },
    false,
  );
  if (!source) {
    return { reason: 'stale_source', status: 'SKIPPED' };
  }
  if (source.targetInstanceKind !== InstanceKind.ACTIVITYPUB) {
    return { reason: 'not_remote_target', status: 'SKIPPED' };
  }
  if (!source?.canonicalOrigin) {
    throw new RemoteActorMaterializationError('Profile Block sender origin is unavailable.');
  }

  const context = localOutboundFederation.createContext(new URL(source.canonicalOrigin), {
    localInstanceId: source.localInstanceId,
  });
  if (!source.targetActorUri) {
    throw new RemoteActorMaterializationError(
      'Profile Block Undo recipient actor URI is unavailable.',
    );
  }
  const actorUri = context.getActorUri(ownerProfileId);
  const objectUri = new URL(source.targetActorUri);
  const blockUri = getProfileBlockActivityUri(context.canonicalOrigin, profileBlockId);
  const undoUri = getProfileBlockUndoActivityUri(context.canonicalOrigin, profileBlockId);
  const activity = new Undo({
    actor: actorUri,
    id: undoUri,
    object: new Block({ actor: actorUri, id: blockUri, object: objectUri }),
    tos: [objectUri],
  });
  await dispatchProfileBlockActivity({
    activity,
    actorProfileId: ownerProfileId,
    context,
    objectUri,
    orderingKey: getProfileBlockOrderingKey(actorUri, objectUri),
    targetProfileId,
  });
  return { status: 'SETTLED' };
};
