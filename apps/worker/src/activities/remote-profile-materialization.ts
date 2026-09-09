import '@kosmo/core/polyfill';

import { ActivityPubActors, db, first, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { parseProfileHandle } from '@kosmo/core/profile';
import {
  federation,
  findStoredRemoteProfileActorByHandle,
  materializeRemoteProfileActor,
  RemoteActorMaterializationError,
} from '@kosmo/fedify';
import { ApplicationFailure } from '@temporalio/activity';
import { eq } from 'drizzle-orm';
import type { RemoteProfileMaterializationInput } from '@kosmo/core/temporal/remote-profile-contract';

const remoteActorRefreshTtl = Temporal.Duration.from({ hours: 7 * 24 });

const isStale = (lastFetchedAt: Temporal.Instant | null, now: Temporal.Instant) =>
  lastFetchedAt === null ||
  lastFetchedAt.add(remoteActorRefreshTtl).epochNanoseconds <= now.epochNanoseconds;

const profileOriginError = (message: string) =>
  new RemoteActorMaterializationError(`Unable to determine materialization origin: ${message}`);

const resolveRemoteProfileMaterializationOrigin = async (profileId?: string) => {
  if (!profileId) {
    return (await resolveConfiguredLocalInstance()).canonicalOrigin;
  }

  const selected = await db
    .select({ actor: ActivityPubActors, instance: Instances })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .where(eq(Profiles.id, profileId))
    .limit(1)
    .then(first);

  if (!selected) {
    throw profileOriginError('Profile was not found.');
  }

  if (selected.instance.kind === InstanceKind.LOCAL) {
    const origin = selected.instance.canonicalOrigin;
    if (!origin) {
      throw profileOriginError('Local Profile instance has no canonical origin.');
    }
    return origin;
  }

  if (selected.instance.kind !== InstanceKind.ACTIVITYPUB || !selected.actor) {
    throw profileOriginError('Remote Profile actor metadata is missing.');
  }

  let actorUri: URL;
  try {
    actorUri = new URL(selected.actor.uri);
  } catch {
    throw profileOriginError('Remote Profile actor URI is invalid.');
  }

  if ((actorUri.protocol !== 'http:' && actorUri.protocol !== 'https:') || !actorUri.hostname) {
    throw profileOriginError('Remote Profile actor URI must use HTTP(S) with a hostname.');
  }

  return actorUri.origin;
};

const skipRemoteLookupIfCurrent = async (
  input: RemoteProfileMaterializationInput,
  now: Temporal.Instant,
) => {
  const configuredLocalInstance = await resolveConfiguredLocalInstance();
  const parsed = parseProfileHandle(input.handle, {
    configuredLocalDomain: configuredLocalInstance.domain,
  });

  if (!parsed || parsed.kind !== 'remote') {
    return undefined;
  }

  const stored = await findStoredRemoteProfileActorByHandle(parsed.domain, parsed.normalizedHandle);
  if (!stored) {
    return undefined;
  }

  if (stored.profile.state !== ProfileState.ACTIVE) {
    throw new NotFoundError('Profile not found');
  }

  if (stored.instance.state === InstanceState.SUSPENDED) {
    throw new NotFoundError('Profile not found');
  }

  if (
    stored.instance.state === InstanceState.UNRESPONSIVE ||
    !isStale(stored.actor.lastFetchedAt, now)
  ) {
    return stored.profile.id;
  }

  return undefined;
};

const expectedFailureType = (error: unknown): string | undefined => {
  if (error instanceof RemoteActorMaterializationError) {
    return 'RemoteActorMaterializationError';
  }
  if (error instanceof ConflictError) {
    return 'ConflictError';
  }
  if (error instanceof NotFoundError) {
    return 'NotFoundError';
  }
  return undefined;
};

export const materializeRemoteProfileActorActivity = async (
  input: RemoteProfileMaterializationInput,
): Promise<string> => {
  const now = Temporal.Now.instant();

  try {
    const existingProfileId = await skipRemoteLookupIfCurrent(input, now);
    if (existingProfileId) {
      return existingProfileId;
    }

    const origin = await resolveRemoteProfileMaterializationOrigin(input.profileId);
    const context = federation.createContext(new URL(origin), undefined);
    const profile = await materializeRemoteProfileActor({
      context,
      handle: input.handle,
      now,
    });

    return profile.id;
  } catch (error) {
    const type = expectedFailureType(error);
    if (type) {
      throw ApplicationFailure.nonRetryable(
        error instanceof Error ? error.message : String(error),
        type,
      );
    }

    throw error;
  }
};
