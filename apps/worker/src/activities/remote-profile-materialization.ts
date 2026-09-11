import '@kosmo/core/polyfill';

import { ActivityPubActors, db, first, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { normalizeHandle } from '@kosmo/core/utils';
import {
  federation,
  findStoredRemoteProfileActorByUri,
  materializeRemoteProfileActor,
  RemoteActorMaterializationError,
} from '@kosmo/fedify';
import { ApplicationFailure } from '@temporalio/activity';
import { and, eq } from 'drizzle-orm';
import type {
  RemoteProfileLookupInput,
  RemoteProfileMaterializationInput,
} from '@kosmo/core/temporal/remote-profile';

const remoteActorRefreshTtl = Temporal.Duration.from({ hours: 7 * 24 });

export type RemoteProfileMaterializationState = {
  readonly profileId: string;
  readonly needsRefresh: boolean;
};

const findStoredRemoteProfileActorState = async (
  input: RemoteProfileMaterializationInput,
): Promise<RemoteProfileMaterializationState | null> => {
  const stored = await findStoredRemoteProfileActorByUri(input.actorUri);

  if (!stored) {
    return null;
  }

  if (
    stored.profile.state !== ProfileState.ACTIVE ||
    stored.instance.state === InstanceState.SUSPENDED
  ) {
    throw ApplicationFailure.nonRetryable('Profile not found', 'NotFoundError');
  }

  return {
    profileId: stored.profile.id,
    needsRefresh:
      stored.instance.state !== InstanceState.UNRESPONSIVE &&
      (stored.actor.lastFetchedAt === null ||
        stored.actor.lastFetchedAt.add(remoteActorRefreshTtl).epochNanoseconds <=
          Temporal.Now.instant().epochNanoseconds),
  };
};

export const lookupRemoteActorUriActivity = async (
  input: RemoteProfileLookupInput,
): Promise<string> => {
  const stored = await db
    .select({ actorUri: ActivityPubActors.uri })
    .from(ActivityPubActors)
    .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(Instances.domain, input.domain),
        eq(Instances.kind, InstanceKind.ACTIVITYPUB),
        eq(Profiles.normalizedHandle, normalizeHandle(input.handle)),
      ),
    )
    .limit(1)
    .then(first);

  if (stored) {
    return stored.actorUri;
  }

  const localInstance = await resolveConfiguredLocalInstance();
  const context = federation.createContext(new URL(localInstance.canonicalOrigin), undefined);
  const descriptor = await context.lookupWebFinger(`acct:${input.handle}@${input.domain}`);

  for (const link of descriptor?.links ?? []) {
    if (
      link.rel !== 'self' ||
      (link.type !== 'application/activity+json' &&
        !link.type?.match(
          /application\/ld\+json;\s*profile="https:\/\/www\.w3\.org\/ns\/activitystreams"/,
        )) ||
      link.href == null
    ) {
      continue;
    }

    try {
      const candidate = new URL(link.href);
      if (
        (candidate.protocol === 'http:' || candidate.protocol === 'https:') &&
        candidate.hostname
      ) {
        return candidate.href;
      }
    } catch {
      // Try another ActivityPub self link before reporting an invalid response.
    }
  }

  throw ApplicationFailure.nonRetryable(
    'Remote WebFinger response is missing a valid ActivityPub self link.',
    'RemoteActorMaterializationError',
  );
};

export const refreshRemoteProfileActorActivity = async (
  input: RemoteProfileMaterializationInput,
): Promise<string> => {
  const now = Temporal.Now.instant();

  try {
    const stored = await findStoredRemoteProfileActorState(input);

    if (stored && !stored.needsRefresh) {
      return stored.profileId;
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

export const materializeRemoteProfileActorActivity = async (
  input: RemoteProfileMaterializationInput,
): Promise<RemoteProfileMaterializationState> => {
  const stored = await findStoredRemoteProfileActorState(input);

  if (stored) {
    return stored;
  }

  const profileId = await refreshRemoteProfileActorActivity(input);
  return { needsRefresh: false, profileId };
};
