import '@kosmo/core/polyfill';

import { getActorTypeName, isActor } from '@fedify/vocab';
import {
  ActivityPubActors,
  db,
  first,
  firstOrThrow,
  Instances,
  isUniqueViolation,
  Profiles,
} from '@kosmo/core/db';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { parseProfileHandle } from '@kosmo/core/profile';
import { normalizeHandle } from '@kosmo/core/utils';
import {
  profileBioSchema,
  profileDisplayNameSchema,
  profileHandleSchema,
} from '@kosmo/core/validation';
import { and, eq, getColumns, ne } from 'drizzle-orm';
import type { Context } from '@fedify/fedify';
import type { Actor, LanguageString, Object as ActivityPubObject } from '@fedify/vocab';

const remoteActorRefreshTtl = Temporal.Duration.from({ hours: 7 * 24 });
const remoteActorLookupTimeoutMs = 10_000;

export class RemoteActorMaterializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemoteActorMaterializationError';
  }
}

type RemoteActorLookupContext = Pick<Context<void>, 'lookupObject'> &
  Partial<Pick<Context<void>, 'contextLoader' | 'documentLoader'>>;

type RemoteActorMaterializationOptions = {
  context: RemoteActorLookupContext;
  handle: string;
  now?: Temporal.Instant;
};

type FindOrMaterializeRemoteActorOptions = RemoteActorMaterializationOptions & {
  scheduleRefresh?: (refresh: () => Promise<void>) => void;
};

type ActorProjection = {
  bio: string | null;
  displayName: string;
  followPolicy: ProfileFollowPolicy;
  handle: string;
  normalizedHandle: string;
  published: Temporal.Instant | null;
};

type ActorEndpoints = {
  followersUri: string | null;
  followingUri: string | null;
  inboxUri: string | null;
  outboxUri: string | null;
  sharedInboxUri: string | null;
};

type ActorWithKosmoFields = Actor & {
  endpoints?: { sharedInbox?: URL | null } | null;
  followersId?: URL | null;
  followingId?: URL | null;
  inboxId?: URL | null;
  manuallyApprovesFollowers?: boolean | null;
  name?: string | LanguageString | null;
  outboxId?: URL | null;
  preferredUsername?: string | LanguageString | null;
  published?: Temporal.Instant | null;
  summary?: string | LanguageString | null;
};

const getNow = () => Temporal.Now.instant();

const toActorType = (actor: Actor): ActivityPubActorType => {
  switch (getActorTypeName(actor)) {
    case 'Application':
      return ActivityPubActorType.APPLICATION;
    case 'Group':
      return ActivityPubActorType.GROUP;
    case 'Organization':
      return ActivityPubActorType.ORGANIZATION;
    case 'Person':
      return ActivityPubActorType.PERSON;
    case 'Service':
      return ActivityPubActorType.SERVICE;
  }
};

const getActorEndpoints = (actor: ActorWithKosmoFields): ActorEndpoints => ({
  followersUri: actor.followersId?.href ?? null,
  followingUri: actor.followingId?.href ?? null,
  inboxUri: actor.inboxId?.href ?? null,
  outboxUri: actor.outboxId?.href ?? null,
  sharedInboxUri: actor.endpoints?.sharedInbox?.href ?? null,
});

const projectActor = (actor: ActorWithKosmoFields, requestedNormalizedHandle: string) => {
  const preferredUsername = actor.preferredUsername?.toString();

  if (!preferredUsername) {
    throw new RemoteActorMaterializationError('Remote actor is missing preferredUsername.');
  }

  const normalizedHandle = normalizeHandle(preferredUsername);

  if (normalizedHandle !== requestedNormalizedHandle) {
    throw new RemoteActorMaterializationError('Remote actor preferredUsername does not match.');
  }

  const handle = profileHandleSchema.safeParse(preferredUsername);

  if (!handle.success) {
    throw new RemoteActorMaterializationError('Remote actor preferredUsername is unsupported.');
  }

  const displayName = profileDisplayNameSchema.safeParse(actor.name?.toString());
  const bio = profileBioSchema.safeParse(actor.summary?.toString() ?? null);

  return {
    bio: bio.success ? bio.data : null,
    displayName: displayName.success ? displayName.data : handle.data,
    followPolicy: actor.manuallyApprovesFollowers
      ? ProfileFollowPolicy.APPROVAL_REQUIRED
      : ProfileFollowPolicy.OPEN,
    handle: handle.data,
    normalizedHandle,
    published: actor.published ?? null,
  } satisfies ActorProjection;
};

const requireAvailableRemoteInstance = (instance: typeof Instances.$inferSelect) => {
  if (instance.kind !== InstanceKind.ACTIVITYPUB) {
    throw new RemoteActorMaterializationError('Remote instance is not an ActivityPub instance.');
  }

  if (instance.state === InstanceState.SUSPENDED || instance.state === InstanceState.UNRESPONSIVE) {
    throw new RemoteActorMaterializationError('Remote instance is unavailable.');
  }

  return instance;
};

const ensureRemoteInstance = async (domain: string) => {
  const existing = await db
    .select()
    .from(Instances)
    .where(eq(Instances.domain, domain))
    .limit(1)
    .then(first);

  if (existing) {
    return requireAvailableRemoteInstance(existing);
  }

  return db
    .insert(Instances)
    .values({
      domain,
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow)
    .catch(async (error) => {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      const concurrent = await db
        .select()
        .from(Instances)
        .where(eq(Instances.domain, domain))
        .limit(1)
        .then(first);

      if (!concurrent) {
        throw error;
      }

      return requireAvailableRemoteInstance(concurrent);
    });
};

const withLookupSignal =
  (loader: Context<void>['documentLoader'], signal: AbortSignal): Context<void>['documentLoader'] =>
  (url, options) =>
    loader(url, {
      ...options,
      signal: options?.signal ? AbortSignal.any([options.signal, signal]) : signal,
    });

const lookupRemoteActor = async (
  context: RemoteActorLookupContext,
  handle: string,
): Promise<Actor> => {
  const signal = AbortSignal.timeout(remoteActorLookupTimeoutMs);
  const object = (await context.lookupObject(`acct:${handle}`, {
    ...(context.contextLoader
      ? { contextLoader: withLookupSignal(context.contextLoader, signal) }
      : {}),
    ...(context.documentLoader
      ? { documentLoader: withLookupSignal(context.documentLoader, signal) }
      : {}),
    signal,
  })) as ActivityPubObject | null;

  if (!isActor(object)) {
    throw new RemoteActorMaterializationError('Remote lookup did not return an actor.');
  }

  if (!object.id) {
    throw new RemoteActorMaterializationError('Remote actor is missing canonical URI.');
  }

  return object;
};

const findStoredRemoteProfile = async (domain: string, normalizedHandle: string) =>
  db
    .select({
      actor: getColumns(ActivityPubActors),
      instance: getColumns(Instances),
      profile: getColumns(Profiles),
    })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .where(
      and(
        eq(Instances.domain, domain),
        eq(Instances.kind, InstanceKind.ACTIVITYPUB),
        eq(Profiles.normalizedHandle, normalizedHandle),
        eq(Profiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);

const isStale = (lastFetchedAt: Temporal.Instant | null, now: Temporal.Instant) =>
  lastFetchedAt === null ||
  lastFetchedAt.add(remoteActorRefreshTtl).epochNanoseconds <= now.epochNanoseconds;

const defaultScheduleRefresh = (refresh: () => Promise<void>) => {
  void refresh().catch(() => undefined);
};

export const findOrMaterializeRemoteProfileActor = async ({
  context,
  handle,
  now = getNow(),
  scheduleRefresh = defaultScheduleRefresh,
}: FindOrMaterializeRemoteActorOptions) => {
  const localInstance = await resolveConfiguredLocalInstance();
  const parsed = parseProfileHandle(handle, { configuredLocalDomain: localInstance.domain });

  if (!parsed || parsed.kind !== 'remote') {
    throw new RemoteActorMaterializationError('Remote materialization requires a remote handle.');
  }

  const stored = await findStoredRemoteProfile(parsed.domain, parsed.normalizedHandle);

  if (stored) {
    if (stored.instance.state === InstanceState.SUSPENDED) {
      throw new NotFoundError('Profile not found');
    }

    if (
      stored.instance.state !== InstanceState.UNRESPONSIVE &&
      isStale(stored.actor.lastFetchedAt, now)
    ) {
      try {
        scheduleRefresh(async () => {
          await materializeRemoteProfileActor({ context, handle, now: getNow() });
        });
      } catch {
        return stored.profile;
      }
    }

    return stored.profile;
  }

  return materializeRemoteProfileActor({ context, handle, now });
};

export const materializeRemoteProfileActor = async ({
  context,
  handle,
  now = getNow(),
}: RemoteActorMaterializationOptions) => {
  const localInstance = await resolveConfiguredLocalInstance();
  const parsed = parseProfileHandle(handle, { configuredLocalDomain: localInstance.domain });

  if (!parsed || parsed.kind !== 'remote') {
    throw new RemoteActorMaterializationError('Remote materialization requires a remote handle.');
  }

  const remoteInstance = await ensureRemoteInstance(parsed.domain);
  const actor = await lookupRemoteActor(context, `${parsed.normalizedHandle}@${parsed.domain}`);

  if (actor.id!.origin === localInstance.canonicalOrigin) {
    throw new ConflictError({ message: 'Remote actor URI uses the local origin' });
  }

  const projection = projectActor(actor as ActorWithKosmoFields, parsed.normalizedHandle);
  const endpoints = getActorEndpoints(actor as ActorWithKosmoFields);
  const actorUri = actor.id!.href;
  const actorType = toActorType(actor);

  const persistActor = () =>
    db.transaction(async (tx) => {
      const existingActor = await tx
        .select({
          instance: getColumns(Instances),
          profile: getColumns(Profiles),
        })
        .from(ActivityPubActors)
        .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
        .leftJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(eq(ActivityPubActors.uri, actorUri))
        .limit(1)
        .then(first);

      if (existingActor) {
        const existingInstance = existingActor.instance;

        if (
          existingActor.profile.instanceId === null ||
          existingActor.profile.instanceId === localInstance.id ||
          !existingInstance ||
          existingInstance.kind === InstanceKind.LOCAL
        ) {
          throw new ConflictError({ message: 'Remote actor collides with a local actor' });
        }

        requireAvailableRemoteInstance(existingInstance);

        if (existingActor.profile.state !== ProfileState.ACTIVE) {
          throw new RemoteActorMaterializationError('Remote profile is unavailable.');
        }

        const handleCollision = await tx
          .select({ id: Profiles.id })
          .from(Profiles)
          .where(
            and(
              eq(Profiles.instanceId, existingActor.profile.instanceId),
              eq(Profiles.normalizedHandle, projection.normalizedHandle),
              ne(Profiles.id, existingActor.profile.id),
            ),
          )
          .limit(1)
          .then(first);

        if (handleCollision) {
          throw new ConflictError({ message: 'Remote actor handle collides with another actor' });
        }

        const profile = await tx
          .update(Profiles)
          .set({
            bio: projection.bio,
            createdAt: projection.published ?? existingActor.profile.createdAt,
            displayName: projection.displayName,
            followPolicy: projection.followPolicy,
            handle: projection.handle,
            normalizedHandle: projection.normalizedHandle,
          })
          .where(eq(Profiles.id, existingActor.profile.id))
          .returning()
          .then(firstOrThrow);

        await tx
          .update(ActivityPubActors)
          .set({
            ...endpoints,
            lastFetchedAt: now,
            type: actorType,
            updatedAt: now,
          })
          .where(eq(ActivityPubActors.uri, actorUri));

        return profile;
      }

      const handleCollision = await tx
        .select({ id: Profiles.id })
        .from(Profiles)
        .where(
          and(
            eq(Profiles.instanceId, remoteInstance.id),
            eq(Profiles.normalizedHandle, projection.normalizedHandle),
          ),
        )
        .limit(1)
        .then(first);

      if (handleCollision) {
        throw new ConflictError({ message: 'Remote actor handle collides with another actor' });
      }

      const profile = await tx
        .insert(Profiles)
        .values({
          bio: projection.bio,
          createdAt: projection.published ?? now,
          displayName: projection.displayName,
          followPolicy: projection.followPolicy,
          handle: projection.handle,
          instanceId: remoteInstance.id,
          normalizedHandle: projection.normalizedHandle,
        })
        .returning()
        .then(firstOrThrow);

      await tx
        .insert(ActivityPubActors)
        .values({
          ...endpoints,
          lastFetchedAt: now,
          profileId: profile.id,
          type: actorType,
          uri: actorUri,
        })
        .returning()
        .then(firstOrThrow);

      return profile;
    });

  try {
    return await persistActor();
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    return persistActor();
  }
};
