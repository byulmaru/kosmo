import '@kosmo/core/polyfill';

import { isActor } from '@fedify/vocab';
import {
  ActivityPubActors,
  db,
  first,
  Instances,
  ProfileMigrations,
  Profiles,
} from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { startProfileMigration } from '@kosmo/core/temporal/profile-migration';
import { and, eq } from 'drizzle-orm';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import { observeInbound } from './inbound-observability';
import {
  findOrMaterializeRemoteProfileActorByUri,
  findStoredRemoteProfileActorByUri,
  RemoteActorMaterializationError,
} from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Move } from '@fedify/vocab';

const noNetworkDocumentLoader = async (): Promise<never> => {
  throw new TypeError('Remote Move target representation lookup is disabled');
};

const noNetworkMoveRepresentationOptions = {
  contextLoader: noNetworkDocumentLoader,
  crossOrigin: 'trust' as const,
  documentLoader: noNetworkDocumentLoader,
  suppressError: true as const,
};

const isExpectedRemoteActorRejection = (error: unknown) =>
  error instanceof RemoteActorMaterializationError ||
  error instanceof NotFoundError ||
  error instanceof ConflictError;

const observeMove = (
  observation: Omit<Parameters<typeof observeInbound>[0], 'activityType' | 'handler'>,
) => observeInbound({ ...observation, activityType: 'Move', handler: 'move' });

type MoveIdentity = {
  readonly actorUri: URL;
  readonly objectUri: URL;
  readonly targetUri: URL;
};

const readMoveIdentity = (move: Move): MoveIdentity | undefined => {
  const actorHref = uniqueHref(move.actorIds);
  const objectHref = uniqueHref(move.objectIds);
  const targetHref = uniqueHref(move.targetIds);
  const actorUri = actorHref ? new URL(actorHref) : null;
  const objectUri = objectHref ? new URL(objectHref) : null;
  const targetUri = targetHref ? new URL(targetHref) : null;

  if (
    !isHttpUri(actorUri) ||
    !isHttpUri(objectUri) ||
    !isHttpUri(targetUri) ||
    actorUri.href !== objectUri.href ||
    actorUri.href === targetUri.href
  ) {
    return undefined;
  }

  return { actorUri, objectUri, targetUri };
};

const findPreparedLocalTarget = async ({
  sourceProfileId,
  targetUri,
}: {
  readonly sourceProfileId: string;
  readonly targetUri: URL;
}) => {
  const target = await db
    .select({ profileId: Profiles.id })
    .from(ActivityPubActors)
    .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(ActivityPubActors.uri, targetUri.href),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        eq(Profiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);

  if (!target) {
    return undefined;
  }

  const migration = await db
    .select({ id: ProfileMigrations.id })
    .from(ProfileMigrations)
    .where(
      and(
        eq(ProfileMigrations.sourceProfileId, sourceProfileId),
        eq(ProfileMigrations.targetProfileId, target.profileId),
      ),
    )
    .limit(1)
    .then(first);

  if (!migration) {
    return undefined;
  }

  return target.profileId;
};

/**
 * Validates an authenticated ActivityPub Move and starts the durable follower-transfer workflow.
 * All protocol and target admission checks happen before source materialization or workflow start.
 */
export const handleInboundMove = async (
  context: InboxContext<void>,
  move: Move,
  now: Temporal.Instant = Temporal.Now.instant(),
): Promise<void> => {
  const identity = readMoveIdentity(move);
  const actorOrigin = identity?.actorUri.origin;
  const objectOrigin = identity?.objectUri.origin;

  if (!identity) {
    observeMove({
      actorOrigin,
      objectOrigin,
      outcome: 'rejected',
      phase: 'validation',
      reasonCode: 'move_actor_object_target_invalid',
    });
    return;
  }

  const embeddedObject = await move.getObject(noNetworkMoveRepresentationOptions);
  if (
    embeddedObject !== null &&
    (!isActor(embeddedObject) || embeddedObject.id?.href !== identity.actorUri.href)
  ) {
    observeMove({
      actorOrigin: identity.actorUri.origin,
      objectOrigin: identity.objectUri.origin,
      outcome: 'rejected',
      phase: 'protocol',
      reasonCode: 'move_object_not_matching_actor',
    });
    return;
  }

  const embeddedTarget = await move.getTarget(noNetworkMoveRepresentationOptions);
  if (
    embeddedTarget !== null &&
    (!isActor(embeddedTarget) || embeddedTarget.id?.href !== identity.targetUri.href)
  ) {
    observeMove({
      actorOrigin: identity.actorUri.origin,
      objectOrigin: identity.targetUri.origin,
      outcome: 'rejected',
      phase: 'protocol',
      reasonCode: 'move_target_not_matching_actor',
    });
    return;
  }

  // A Local target is accepted only when its canonical Actor row and the exact source preparation
  // relation are present. That relation is the source of the Local Actor's alsoKnownAs alias.
  const storedSource = await findStoredRemoteProfileActorByUri(identity.actorUri);
  const localTarget = storedSource
    ? await findPreparedLocalTarget({
        sourceProfileId: storedSource.profile.id,
        targetUri: identity.targetUri,
      })
    : undefined;

  let targetProfileId: string;
  if (localTarget) {
    targetProfileId = localTarget;
  } else {
    if (identity.targetUri.origin === new URL(context.canonicalOrigin).origin) {
      observeMove({
        actorOrigin: identity.actorUri.origin,
        objectOrigin: identity.targetUri.origin,
        outcome: 'rejected',
        phase: 'validation',
        reasonCode: 'move_local_target_not_prepared',
      });
      return;
    }

    // A Move sender controls the activity payload, including any embedded target object. Always
    // resolve a remote target by its canonical URI through the receiving context before trusting
    // its alias assertion; otherwise a forged embedded actor could authorize the migration.
    const targetActor = await context.lookupObject(identity.targetUri);
    if (!isActor(targetActor) || targetActor.id?.href !== identity.targetUri.href) {
      observeMove({
        actorOrigin: identity.actorUri.origin,
        objectOrigin: identity.targetUri.origin,
        outcome: targetActor === null ? 'external_failure' : 'rejected',
        phase: targetActor === null ? 'actor_lookup' : 'protocol',
        reasonCode:
          targetActor === null ? 'move_target_lookup_failed' : 'move_target_not_matching_actor',
      });
      return;
    }
    if (!targetActor.aliasIds.some((uri) => uri.href === identity.actorUri.href)) {
      observeMove({
        actorOrigin: identity.actorUri.origin,
        objectOrigin: identity.targetUri.origin,
        outcome: 'rejected',
        phase: 'protocol',
        reasonCode: 'move_target_alias_missing',
      });
      return;
    }

    let target;
    try {
      target = await findOrMaterializeRemoteProfileActorByUri({
        actorUri: identity.targetUri,
        context,
        now,
      });
    } catch (error) {
      if (isExpectedRemoteActorRejection(error)) {
        observeMove({
          actorOrigin: identity.actorUri.origin,
          objectOrigin: identity.targetUri.origin,
          outcome: 'external_failure',
          phase: 'actor_lookup',
          reasonCode: 'move_target_materialization_rejected',
          error,
        });
        return;
      }
      throw error;
    }
    targetProfileId = target.profile.id;
  }

  let source: Awaited<ReturnType<typeof findOrMaterializeRemoteProfileActorByUri>>;
  try {
    source = await findOrMaterializeRemoteProfileActorByUri({
      actorUri: identity.actorUri,
      context,
      now,
    });
  } catch (error) {
    if (isExpectedRemoteActorRejection(error)) {
      observeMove({
        actorOrigin: identity.actorUri.origin,
        objectOrigin: identity.objectUri.origin,
        outcome: 'external_failure',
        phase: 'actor_lookup',
        reasonCode: 'move_source_materialization_rejected',
        error,
      });
      return;
    }
    throw error;
  }

  await startProfileMigration({
    sourceProfileId: source.profile.id,
    targetProfileId,
  });
};
