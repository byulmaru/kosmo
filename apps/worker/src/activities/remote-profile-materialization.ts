import '@kosmo/core/polyfill';

import { ActivityPubActors, db, first, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { normalizeHandle } from '@kosmo/core/utils';
import {
  applyRemoteProfileActorDocument,
  federation,
  fetchRemoteProfileActorDocument,
  findStoredRemoteProfileActorByUri,
  RemoteActorMaterializationError,
} from '@kosmo/fedify';
import { ApplicationFailure } from '@temporalio/activity';
import { and, eq } from 'drizzle-orm';
import type {
  RemoteProfileActorLookupInput,
  RemoteProfileHandleLookupInput,
  RemoteProfileMaterializationInput,
} from '@kosmo/core/temporal/workflows';

type RemoteProfileActorStateInput = { readonly actorUri: string };
type RemoteProfileActorState = { readonly profileId: string; readonly needsRefresh: boolean };
type RemoteProfileActorDocument = { readonly actorJsonLd: unknown; readonly observedAt: string };
type RemoteProfileActorDocumentInput = RemoteProfileActorStateInput & RemoteProfileActorDocument;

const remoteActorRefreshTtl = Temporal.Duration.from({ hours: 7 * 24 });
const needsRefresh = (lastFetchedAt: Temporal.Instant | null, now: Temporal.Instant) =>
  lastFetchedAt === null ||
  lastFetchedAt.add(remoteActorRefreshTtl).epochNanoseconds <= now.epochNanoseconds;

const remoteProfileFetchErrorNames = new Set([
  'AbortError',
  'FetchError',
  'WebFingerError',
  'UrlError',
]);

class InitiatorOriginMaterializationError extends RemoteActorMaterializationError {}

const wrapRemoteProfileFetchError = (error: unknown): never => {
  if (error instanceof Error && remoteProfileFetchErrorNames.has(error.name)) {
    throw ApplicationFailure.create({
      message: error.message,
      type: 'RemoteProfileFetchUnavailable',
      cause: error,
    });
  }
  throw error;
};
const rethrowRemoteProfileMaterializationError = (error: unknown): never => {
  if (error instanceof RemoteActorMaterializationError) {
    throw ApplicationFailure.create({
      message: error.message,
      type: 'RemoteActorMaterializationError',
      nonRetryable: true,
      ...(error instanceof InitiatorOriginMaterializationError
        ? { details: ['initiator-origin'] }
        : {}),
      cause: error,
    });
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

const ensureRemoteProfileLookupAllowed = async (actorUri: URL) => {
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
  const descriptor = await context
    .lookupWebFinger(`acct:${input.handle}@${input.domain}`)
    .catch(wrapRemoteProfileFetchError);

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

const readUsableRemoteProfileActor = async (actorUri: string) => {
  const stored = await findStoredRemoteProfileActorByUri(actorUri);
  return stored ? requireUsableStoredRemoteProfileActor(stored) : null;
};

export const getRemoteProfileActorStateActivity = async (
  input: RemoteProfileActorStateInput,
): Promise<RemoteProfileActorState | null> => {
  try {
    const now = Temporal.Now.instant();
    const stored = await readUsableRemoteProfileActor(input.actorUri);
    return stored
      ? {
          needsRefresh: needsRefresh(stored.actor.lastFetchedAt, now),
          profileId: stored.profile.id,
        }
      : null;
  } catch (error) {
    return rethrowRemoteProfileMaterializationError(error);
  }
};

export const fetchRemoteProfileActorActivity = async (
  input: RemoteProfileMaterializationInput,
): Promise<RemoteProfileActorDocument> => {
  const observedAt = Temporal.Now.instant();

  try {
    const actorUri = new URL(input.actorUri);
    await readUsableRemoteProfileActor(input.actorUri);
    await ensureRemoteProfileLookupAllowed(actorUri);

    let origin: string;
    let signingProfileId: string | undefined;

    if (!input.profileId) {
      origin = input.contextOrigin ?? (await resolveConfiguredLocalInstance()).canonicalOrigin;
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
        throw new InitiatorOriginMaterializationError(
          'Unable to determine materialization origin: Profile was not found.',
        );
      }

      if (selected.instance.kind === InstanceKind.LOCAL) {
        const localOrigin = selected.instance.canonicalOrigin;
        if (!localOrigin) {
          throw new InitiatorOriginMaterializationError(
            'Unable to determine materialization origin: Local Profile instance has no canonical origin.',
          );
        }
        origin = localOrigin;
        signingProfileId = input.profileId;
      } else {
        if (selected.instance.kind !== InstanceKind.ACTIVITYPUB || !selected.actor) {
          throw new InitiatorOriginMaterializationError(
            'Unable to determine materialization origin: Remote Profile actor metadata is missing.',
          );
        }

        let selectedActorUri: URL;
        try {
          selectedActorUri = new URL(selected.actor.uri);
        } catch {
          throw new InitiatorOriginMaterializationError(
            'Unable to determine materialization origin: Remote Profile actor URI is invalid.',
          );
        }

        if (
          (selectedActorUri.protocol !== 'http:' && selectedActorUri.protocol !== 'https:') ||
          !selectedActorUri.hostname
        ) {
          throw new InitiatorOriginMaterializationError(
            'Unable to determine materialization origin: Remote Profile actor URI must use HTTP(S) with a hostname.',
          );
        }

        origin = selectedActorUri.origin;
      }
    }

    const context = federation.createContext(new URL(origin), undefined);
    const documentLoader = signingProfileId
      ? await context.getDocumentLoader({ identifier: signingProfileId })
      : undefined;

    return {
      actorJsonLd: await fetchRemoteProfileActorDocument(context, actorUri, documentLoader).catch(
        wrapRemoteProfileFetchError,
      ),
      observedAt: observedAt.toString(),
    };
  } catch (error) {
    return rethrowRemoteProfileMaterializationError(error);
  }
};

export const applyRemoteProfileActorActivity = async (
  input: RemoteProfileActorDocumentInput,
): Promise<string> => {
  try {
    const profile = await applyRemoteProfileActorDocument({
      actorJsonLd: input.actorJsonLd,
      actorUri: new URL(input.actorUri),
      observedAt: Temporal.Instant.from(input.observedAt),
    });
    return profile.id;
  } catch (error) {
    return rethrowRemoteProfileMaterializationError(error);
  }
};

export const recoverRemoteProfileActorActivity = async (
  input: RemoteProfileActorStateInput,
): Promise<void> => {
  try {
    const stored = await readUsableRemoteProfileActor(input.actorUri);
    if (stored) {
      await reactivateStoredRemoteProfileActor(stored);
    }
  } catch (error) {
    return rethrowRemoteProfileMaterializationError(error);
  }
};

const fetchAndApplyRemoteProfileActor = async (input: RemoteProfileMaterializationInput) => {
  const document = await fetchRemoteProfileActorActivity(input);
  return applyRemoteProfileActorActivity({ actorUri: input.actorUri, ...document });
};

// Temporal histories record these Activity names. Keep them for histories without
// `remote-profile-activity-split-v1`; remove them after those histories drain.
export const refreshRemoteProfileActorActivity = async (
  input: RemoteProfileMaterializationInput,
): Promise<string> => {
  try {
    const stored = await getRemoteProfileActorStateActivity({ actorUri: input.actorUri });
    if (stored && !stored.needsRefresh) {
      return stored.profileId;
    }

    return await fetchAndApplyRemoteProfileActor(input);
  } catch (error) {
    return rethrowRemoteProfileMaterializationError(error);
  }
};

// Temporal histories record this Activity name. Keep it for lookup histories without
// `remote-profile-activity-split-v1`; remove it after those histories drain.
export const materializeRemoteProfileActorActivity = async (
  input: RemoteProfileActorLookupInput,
): Promise<RemoteProfileActorState | null> => {
  try {
    const stored = await getRemoteProfileActorStateActivity({ actorUri: input.actorUri });
    if (input.receipt && stored) {
      await recoverRemoteProfileActorActivity({ actorUri: input.actorUri });
    }
    if (stored) {
      return stored;
    }

    return {
      needsRefresh: false,
      profileId: await fetchAndApplyRemoteProfileActor(input),
    };
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
