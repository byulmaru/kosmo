import '@kosmo/core/polyfill';

import { Collection, getActorTypeName, isActor } from '@fedify/vocab';
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
import { setRemoteProfileFollowCountBaseline } from '@kosmo/core/profile-follow';
import { normalizeHandle } from '@kosmo/core/utils';
import {
  profileBioSchema,
  profileDisplayNameSchema,
  profileHandleSchema,
} from '@kosmo/core/validation';
import { and, eq, getColumns } from 'drizzle-orm';
import type { Context } from '@fedify/fedify';
import type { Actor, Object as ActivityPubObject } from '@fedify/vocab';

const remoteActorRefreshTtl = Temporal.Duration.from({ hours: 7 * 24 });
const remoteActorLookupTimeoutMs = 10_000;

export class RemoteActorMaterializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemoteActorMaterializationError';
  }
}

type RemoteActorLookupContext = Pick<Context<void>, 'lookupObject'> &
  Partial<Pick<Context<void>, 'contextLoader' | 'documentLoader' | 'lookupWebFinger'>>;

type RemoteActorMaterializationOptions = {
  context: RemoteActorLookupContext;
  expectedActorUri?: URL;
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

type ActorCounts = {
  followersCount?: number;
  followingCount?: number;
};

type ActorWithKosmoFields = Actor & {
  endpoints?: { sharedInbox?: URL | null } | null;
  followersId?: URL | null;
  followingId?: URL | null;
  inboxId?: URL | null;
  manuallyApprovesFollowers?: boolean | null;
  name?: string | null;
  outboxId?: URL | null;
  preferredUsername?: string | null;
  published?: Temporal.Instant | null;
  summary?: string | null;
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
  const preferredUsername = actor.preferredUsername;

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

  const displayName = profileDisplayNameSchema.safeParse(actor.name);
  const bio = profileBioSchema.safeParse(actor.summary ?? null);

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

const ensureRemoteInstance = async (domain: string) => {
  const existing = await db
    .select()
    .from(Instances)
    .where(eq(Instances.domain, domain))
    .limit(1)
    .then(first);

  if (existing) {
    if (
      existing.state === InstanceState.SUSPENDED ||
      existing.state === InstanceState.UNRESPONSIVE
    ) {
      throw new RemoteActorMaterializationError('Remote instance is unavailable.');
    }

    return existing;
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

      if (
        concurrent.state === InstanceState.SUSPENDED ||
        concurrent.state === InstanceState.UNRESPONSIVE
      ) {
        throw new RemoteActorMaterializationError('Remote instance is unavailable.');
      }

      return concurrent;
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
  expectedActorUri?: URL,
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

  if (expectedActorUri && object.id.href !== expectedActorUri.href) {
    throw new RemoteActorMaterializationError('Remote actor canonical URI does not match.');
  }

  return object;
};

const lookupCollectionCount = async (
  context: RemoteActorLookupContext,
  collectionUri: URL | null | undefined,
): Promise<number | undefined> => {
  if (!collectionUri) {
    return undefined;
  }

  try {
    const signal = AbortSignal.timeout(remoteActorLookupTimeoutMs);
    const object = await context.lookupObject(collectionUri, {
      ...(context.contextLoader
        ? { contextLoader: withLookupSignal(context.contextLoader, signal) }
        : {}),
      ...(context.documentLoader
        ? { documentLoader: withLookupSignal(context.documentLoader, signal) }
        : {}),
      signal,
    });

    return object instanceof Collection && object.totalItems !== null
      ? object.totalItems
      : undefined;
  } catch {
    return undefined;
  }
};

const lookupActorCounts = async (
  context: RemoteActorLookupContext,
  actor: ActorWithKosmoFields,
): Promise<ActorCounts> => {
  const [followersCount, followingCount] = await Promise.all([
    lookupCollectionCount(context, actor.followersId),
    lookupCollectionCount(context, actor.followingId),
  ]);

  return {
    ...(followersCount === undefined ? {} : { followersCount }),
    ...(followingCount === undefined ? {} : { followingCount }),
  };
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

const findStoredRemoteProfileByActorUri = async (actorUri: URL) =>
  db
    .select({
      actor: getColumns(ActivityPubActors),
      instance: getColumns(Instances),
      profile: getColumns(Profiles),
    })
    .from(ActivityPubActors)
    .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(ActivityPubActors.uri, actorUri.href),
        eq(Instances.kind, InstanceKind.ACTIVITYPUB),
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
  expectedActorUri,
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
      scheduleRefresh(async () => {
        await materializeRemoteProfileActor({
          context,
          expectedActorUri,
          handle,
          now: getNow(),
        });
      });
    }

    return stored.profile;
  }

  return materializeRemoteProfileActor({ context, expectedActorUri, handle, now });
};

export const findOrMaterializeRemoteProfileActorByUri = async ({
  context,
  actorUri,
  now = getNow(),
  scheduleRefresh = defaultScheduleRefresh,
}: {
  context: RemoteActorLookupContext;
  actorUri: URL;
  now?: Temporal.Instant;
  scheduleRefresh?: (refresh: () => Promise<void>) => void;
}) => {
  const stored = await findStoredRemoteProfileByActorUri(actorUri);

  if (stored) {
    if (stored.instance.state !== InstanceState.ACTIVE) {
      return null;
    }

    if (isStale(stored.actor.lastFetchedAt, now)) {
      scheduleRefresh(async () => {
        await materializeRemoteProfileActor({
          context,
          expectedActorUri: actorUri,
          handle: `${stored.profile.handle}@${stored.instance.domain}`,
          now: getNow(),
        });
      });
    }

    return stored.profile;
  }

  if (!context.lookupWebFinger) {
    return null;
  }

  const descriptor = await context.lookupWebFinger(actorUri);
  const subject = descriptor?.subject;
  const hasActivityPubSelfLink = descriptor?.links?.some(
    (link) =>
      link.rel === 'self' &&
      link.href === actorUri.href &&
      (link.type === 'application/activity+json' || link.type?.startsWith('application/ld+json')),
  );

  if (!subject?.startsWith('acct:') || !hasActivityPubSelfLink) {
    return null;
  }

  try {
    return await materializeRemoteProfileActor({
      context,
      expectedActorUri: actorUri,
      handle: subject.slice('acct:'.length),
      now,
    });
  } catch (error) {
    if (error instanceof RemoteActorMaterializationError || error instanceof NotFoundError) {
      return null;
    }

    throw error;
  }
};

export const materializeRemoteProfileActor = async ({
  context,
  expectedActorUri,
  handle,
  now = getNow(),
}: RemoteActorMaterializationOptions) => {
  const localInstance = await resolveConfiguredLocalInstance();
  const parsed = parseProfileHandle(handle, { configuredLocalDomain: localInstance.domain });

  if (!parsed || parsed.kind !== 'remote') {
    throw new RemoteActorMaterializationError('Remote materialization requires a remote handle.');
  }

  const remoteInstance = await ensureRemoteInstance(parsed.domain);
  const actor = await lookupRemoteActor(
    context,
    `${parsed.normalizedHandle}@${parsed.domain}`,
    expectedActorUri,
  );
  const projection = projectActor(actor as ActorWithKosmoFields, parsed.normalizedHandle);
  const endpoints = getActorEndpoints(actor as ActorWithKosmoFields);
  const counts = await lookupActorCounts(context, actor as ActorWithKosmoFields);
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
        if (
          existingActor.profile.instanceId === null ||
          existingActor.profile.instanceId === localInstance.id ||
          existingActor.instance?.kind === InstanceKind.LOCAL
        ) {
          throw new ConflictError({ message: 'Remote actor collides with a local actor' });
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

        await setRemoteProfileFollowCountBaseline({
          executor: tx,
          profileId: profile.id,
          ...counts,
        });

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
          ...counts,
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
