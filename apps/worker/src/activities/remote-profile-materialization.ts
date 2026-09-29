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
  RemoteProfileActorLookupInput,
  RemoteProfileHandleLookupInput,
  RemoteProfileMaterializationInput,
} from '@kosmo/core/temporal/workflows';

const remoteActorRefreshTtl = Temporal.Duration.from({ hours: 7 * 24 });
const needsRefresh = (lastFetchedAt: Temporal.Instant | null, now: Temporal.Instant) =>
  lastFetchedAt === null ||
  lastFetchedAt.add(remoteActorRefreshTtl).epochNanoseconds <= now.epochNanoseconds;

export type RemoteProfileMaterializationState = {
  readonly profileId: string;
  readonly needsRefresh: boolean;
};

const rethrowRemoteProfileMaterializationError = (error: unknown): never => {
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
};

type StoredRemoteProfileActor = NonNullable<
  Awaited<ReturnType<typeof findStoredRemoteProfileActorByUri>>
>;

const requireUsableStoredRemoteProfileActor = (stored: StoredRemoteProfileActor) => {
  if (
    stored.profile.state !== ProfileState.ACTIVE ||
    stored.instance.state === InstanceState.SUSPENDED
  ) {
    throw ApplicationFailure.nonRetryable('Profile not found', 'NotFoundError');
  }

  return stored;
};

const ensureMissingRemoteProfileLookupAllowed = async (actorUri: URL) => {
  const localInstance = await resolveConfiguredLocalInstance();
  if (actorUri.origin === localInstance.canonicalOrigin) {
    throw new ConflictError({ message: 'Remote actor URI uses the local origin' });
  }

  const domain = `${actorUri.hostname.toLowerCase().replace(/\.$/, '')}${
    actorUri.port ? `:${actorUri.port}` : ''
  }`;
  const instance = await db
    .select()
    .from(Instances)
    .where(eq(Instances.domain, domain))
    .limit(1)
    .then(first);

  if (
    instance &&
    (instance.kind !== InstanceKind.ACTIVITYPUB || instance.state === InstanceState.SUSPENDED)
  ) {
    throw new NotFoundError('Profile not found');
  }
};

export const lookupRemoteActorUriActivity = async (
  input: RemoteProfileHandleLookupInput,
): Promise<string | null> => {
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

  if (descriptor === null) {
    return null;
  }

  let hasInvalidQualifyingLink = false;
  for (const link of descriptor.links ?? []) {
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

    let candidate: URL;
    try {
      candidate = new URL(link.href);
    } catch {
      hasInvalidQualifyingLink = true;
      continue;
    }

    if ((candidate.protocol === 'http:' || candidate.protocol === 'https:') && candidate.hostname) {
      return candidate.href;
    }

    hasInvalidQualifyingLink = true;
  }

  if (hasInvalidQualifyingLink) {
    throw ApplicationFailure.nonRetryable(
      'Remote WebFinger response contains an invalid ActivityPub self link.',
      'RemoteActorMaterializationError',
    );
  }

  return null;
};

export const refreshRemoteProfileActorActivity = async (
  input: RemoteProfileMaterializationInput,
): Promise<string> => {
  const now = Temporal.Now.instant();

  try {
    const stored = await findStoredRemoteProfileActorByUri(input.actorUri);

    if (stored) {
      const usable = requireUsableStoredRemoteProfileActor(stored);
      if (!needsRefresh(usable.actor.lastFetchedAt, now)) {
        return usable.profile.id;
      }
    }

    let origin: string;
    let signingProfileId: string | undefined;

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
        signingProfileId = input.profileId;
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
    const documentLoader = signingProfileId
      ? await context.getDocumentLoader({ identifier: signingProfileId })
      : undefined;
    const profile = await materializeRemoteProfileActor({
      context,
      actorUri: new URL(input.actorUri),
      documentLoader,
      now,
      reactivateUnresponsive: true,
    });

    return profile.id;
  } catch (error) {
    return rethrowRemoteProfileMaterializationError(error);
  }
};

export const materializeRemoteProfileActorActivity = async (
  input: RemoteProfileActorLookupInput,
): Promise<RemoteProfileMaterializationState | null> => {
  try {
    if (!input.actorDocument) {
      const now = Temporal.Now.instant();
      const stored = await findStoredRemoteProfileActorByUri(input.actorUri);
      if (!stored) {
        await ensureMissingRemoteProfileLookupAllowed(new URL(input.actorUri));
        return null;
      }

      const usable = requireUsableStoredRemoteProfileActor(stored);
      const actor = input.receipt ? await reactivateStoredRemoteProfileActor(usable) : usable;
      return {
        needsRefresh: needsRefresh(actor.actor.lastFetchedAt, now),
        profileId: actor.profile.id,
      };
    }

    if (input.receipt) {
      const stored = await findStoredRemoteProfileActorByUri(input.actorUri);
      if (!stored) {
        return null;
      }

      requireUsableStoredRemoteProfileActor(stored);
    }

    const context = federation.createContext(new URL(input.actorDocument.contextOrigin), undefined);
    const profile = await materializeRemoteProfileActor({
      actorJsonLd: input.actorDocument.jsonLd,
      actorUri: new URL(input.actorUri),
      context,
      now: Temporal.Instant.from(input.actorDocument.receivedAt),
      reactivateUnresponsive: true,
    });
    return { needsRefresh: false, profileId: profile.id };
  } catch (error) {
    return rethrowRemoteProfileMaterializationError(error);
  }
};

const reactivateStoredRemoteProfileActor = async (stored: StoredRemoteProfileActor) => {
  if (stored.instance.state !== InstanceState.UNRESPONSIVE) {
    return stored;
  }

  const reactivated = await db
    .update(Instances)
    .set({ state: InstanceState.ACTIVE })
    .where(
      and(eq(Instances.id, stored.instance.id), eq(Instances.state, InstanceState.UNRESPONSIVE)),
    )
    .returning()
    .then(first);

  if (reactivated) {
    return { ...stored, instance: reactivated };
  }

  const current = await db
    .select()
    .from(Instances)
    .where(eq(Instances.id, stored.instance.id))
    .limit(1)
    .then(first);

  if (!current || current.state !== InstanceState.ACTIVE) {
    throw ApplicationFailure.nonRetryable('Profile not found', 'NotFoundError');
  }

  return { ...stored, instance: current };
};
