import '@kosmo/core/polyfill';

import { ActivityPubActors, db, first, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import {
  federation,
  findStoredRemoteProfileActorByUri,
  materializeRemoteProfileActor,
  RemoteActorMaterializationError,
} from '@kosmo/fedify';
import { ApplicationFailure } from '@temporalio/activity';
import { eq } from 'drizzle-orm';
import type { RemoteProfileMaterializationInput } from '@kosmo/core/temporal/remote-profile';

const remoteActorRefreshTtl = Temporal.Duration.from({ hours: 7 * 24 });

export const materializeRemoteProfileActorActivity = async (
  input: RemoteProfileMaterializationInput,
): Promise<string> => {
  const now = Temporal.Now.instant();

  try {
    const stored = await findStoredRemoteProfileActorByUri(input.actorUri);

    if (stored) {
      if (stored.profile.state !== ProfileState.ACTIVE) {
        throw new NotFoundError('Profile not found');
      }

      if (stored.instance.state === InstanceState.SUSPENDED) {
        throw new NotFoundError('Profile not found');
      }

      if (
        stored.instance.state === InstanceState.UNRESPONSIVE ||
        (stored.actor.lastFetchedAt !== null &&
          stored.actor.lastFetchedAt.add(remoteActorRefreshTtl).epochNanoseconds >
            now.epochNanoseconds)
      ) {
        return stored.profile.id;
      }
    }

    let origin: string;

    if (!input.profileId) {
      origin = (await resolveConfiguredLocalInstance()).canonicalOrigin;
    } else {
      const selected = await db
        .select({ actor: ActivityPubActors, instance: Instances })
        .from(Profiles)
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
        .where(eq(Profiles.id, input.profileId))
        .limit(1)
        .then(first);

      if (!selected) {
        throw new RemoteActorMaterializationError(
          'Unable to determine materialization origin: Profile was not found.',
        );
      }

      if (selected.instance.kind === InstanceKind.LOCAL) {
        const localOrigin = selected.instance.canonicalOrigin;
        if (!localOrigin) {
          throw new RemoteActorMaterializationError(
            'Unable to determine materialization origin: Local Profile instance has no canonical origin.',
          );
        }
        origin = localOrigin;
      } else {
        if (selected.instance.kind !== InstanceKind.ACTIVITYPUB || !selected.actor) {
          throw new RemoteActorMaterializationError(
            'Unable to determine materialization origin: Remote Profile actor metadata is missing.',
          );
        }

        let actorUri: URL;
        try {
          actorUri = new URL(selected.actor.uri);
        } catch {
          throw new RemoteActorMaterializationError(
            'Unable to determine materialization origin: Remote Profile actor URI is invalid.',
          );
        }

        if (
          (actorUri.protocol !== 'http:' && actorUri.protocol !== 'https:') ||
          !actorUri.hostname
        ) {
          throw new RemoteActorMaterializationError(
            'Unable to determine materialization origin: Remote Profile actor URI must use HTTP(S) with a hostname.',
          );
        }

        origin = actorUri.origin;
      }
    }

    const context = federation.createContext(new URL(origin), undefined);
    const profile = await materializeRemoteProfileActor({
      context,
      actorUri: new URL(input.actorUri),
      now,
    });

    return profile.id;
  } catch (error) {
    if (error instanceof RemoteActorMaterializationError) {
      throw ApplicationFailure.nonRetryable(error.message, 'RemoteActorMaterializationError');
    }

    if (error instanceof ConflictError) {
      throw ApplicationFailure.nonRetryable(error.message, 'ConflictError');
    }

    if (error instanceof NotFoundError) {
      throw ApplicationFailure.nonRetryable(error.message, 'NotFoundError');
    }

    throw error;
  }
};
