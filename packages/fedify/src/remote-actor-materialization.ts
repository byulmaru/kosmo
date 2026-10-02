import '@kosmo/core/polyfill';

import { getActorTypeName, isActor, Link, Object as ActivityPubObject } from '@fedify/vocab';
import { projectRemoteActivityPubHtmlToPlainText } from '@kosmo/core/activitypub-note-content/server';
import {
  ActivityPubActors,
  db,
  first,
  firstOrThrow,
  Instances,
  isUniqueViolation,
  Media,
  ProfileMedia,
  Profiles,
} from '@kosmo/core/db';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  ProfileFollowPolicy,
  ProfileMediaKind,
  ProfileState,
} from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { runWorkflow } from '@kosmo/core/temporal/client';
import { remoteProfileLookupWorkflow } from '@kosmo/core/temporal/workflows';
import { normalizeHandle } from '@kosmo/core/utils';
import {
  profileBioSchema,
  profileDisplayNameSchema,
  remoteProfileHandleSchema,
} from '@kosmo/core/validation';
import { and, eq, getColumns, inArray, ne } from 'drizzle-orm';
import { isHttpUri } from './activitypub-uri';
import type { Context, DocumentLoader } from '@fedify/fedify';
import type { Actor, Image, LanguageString } from '@fedify/vocab';
import type { RemoteProfileActorLookupInput } from '@kosmo/core/temporal/workflows';

export class RemoteActorMaterializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemoteActorMaterializationError';
  }
}

type RemoteActorLookupContext = Pick<Context<void>, 'lookupObject'>;
export type RemoteActorMaterializationOptions = {
  actorJsonLd?: unknown;
  context: RemoteActorLookupContext;
  actorUri: URL;
  documentLoader?: DocumentLoader;
  now?: Temporal.Instant;
  reactivateUnresponsive?: boolean;
};

type ActorProjection = {
  avatar: RemoteProfileMediaCandidate | null;
  bio: string | null;
  displayName: string;
  followPolicy: ProfileFollowPolicy;
  handle: string;
  header: RemoteProfileMediaCandidate | null;
  normalizedHandle: string;
  profileUrl: string | null;
  published: Temporal.Instant | null;
};

type RemoteProfileMediaCandidate = {
  altText: string | null;
  mediaType: string | null;
  url: string;
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

const noNetworkDocumentLoader = async (): Promise<never> => {
  throw new TypeError('Remote actor representation lookup is disabled');
};

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

const projectActorImage = async (
  images: AsyncIterable<Image>,
): Promise<RemoteProfileMediaCandidate | null> => {
  const projected: Image[] = [];

  for await (const image of images) {
    projected.push(image);
    if (projected.length > 1) {
      return null;
    }
  }

  const image = projected[0];
  if (!image || image.urls.length !== 1) {
    return null;
  }

  const representation = image.urls[0];
  const url = representation instanceof Link ? representation.href : representation;
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) {
    return null;
  }

  return {
    altText: image.name?.toString() ?? null,
    mediaType: image.mediaType,
    url: new URL(url.href).href,
  };
};

const projectActorProfileUrl = (actor: ActorWithKosmoFields): string | null => {
  const representation = actor.url;
  const url = representation instanceof Link ? representation.href : representation;

  if (!url || !isHttpUri(url) || !url.hostname) {
    return null;
  }

  return url.href;
};

const projectActor = async (actor: ActorWithKosmoFields) => {
  const preferredUsername = actor.preferredUsername?.toString();

  if (!preferredUsername) {
    throw new RemoteActorMaterializationError('Remote actor is missing preferredUsername.');
  }

  const normalizedHandle = normalizeHandle(preferredUsername);

  const handle = remoteProfileHandleSchema.safeParse(preferredUsername);

  if (!handle.success) {
    throw new RemoteActorMaterializationError('Remote actor preferredUsername is unsupported.');
  }

  const displayName = profileDisplayNameSchema.safeParse(actor.name?.toString());
  const representationOptions = {
    contextLoader: noNetworkDocumentLoader,
    crossOrigin: 'trust' as const,
    documentLoader: noNetworkDocumentLoader,
    suppressError: true,
  };
  const [avatar, header] = await Promise.all([
    projectActorImage(actor.getIcons(representationOptions)),
    projectActorImage(actor.getImages(representationOptions)),
  ]);
  const value = actor.summary?.toString();
  const plainText = value === undefined ? null : projectRemoteActivityPubHtmlToPlainText(value);
  const bio = profileBioSchema.safeParse(plainText || null);

  return {
    avatar,
    bio: bio.success ? bio.data : null,
    displayName: displayName.success ? displayName.data : handle.data,
    followPolicy: actor.manuallyApprovesFollowers
      ? ProfileFollowPolicy.APPROVAL_REQUIRED
      : ProfileFollowPolicy.OPEN,
    handle: handle.data,
    header,
    normalizedHandle,
    profileUrl: projectActorProfileUrl(actor),
    published: actor.published ?? null,
  } satisfies ActorProjection;
};

const requireAvailableRemoteInstance = (
  instance: typeof Instances.$inferSelect,
  { allowUnresponsive = false }: { allowUnresponsive?: boolean } = {},
) => {
  if (instance.kind !== InstanceKind.ACTIVITYPUB) {
    throw new RemoteActorMaterializationError('Remote instance is not an ActivityPub instance.');
  }

  if (
    instance.state === InstanceState.SUSPENDED ||
    (!allowUnresponsive && instance.state === InstanceState.UNRESPONSIVE)
  ) {
    throw new RemoteActorMaterializationError('Remote instance is unavailable.');
  }

  return instance;
};

const findAvailableRemoteInstance = async (
  domain: string,
  { allowUnresponsive = false }: { allowUnresponsive?: boolean } = {},
) => {
  const existing = await db
    .select()
    .from(Instances)
    .where(eq(Instances.domain, domain))
    .limit(1)
    .then(first);

  if (existing) {
    return requireAvailableRemoteInstance(existing, { allowUnresponsive });
  }

  return undefined;
};

const ensureRemoteInstance = async (
  domain: string,
  { allowUnresponsive = false }: { allowUnresponsive?: boolean } = {},
) => {
  const existing = await findAvailableRemoteInstance(domain, { allowUnresponsive });

  if (existing) {
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

      return requireAvailableRemoteInstance(concurrent, { allowUnresponsive });
    });
};

export const findStoredRemoteProfileActorByUri = async (actorUri: URL | string) =>
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
        eq(ActivityPubActors.uri, actorUri.toString()),
        eq(Instances.kind, InstanceKind.ACTIVITYPUB),
      ),
    )
    .limit(1)
    .then(first);

type RemoteActorReceipt = {
  activityUri?: URL | string | null;
  receivedAt: Temporal.Instant;
};

type RemoteActorLookupOptions = {
  actorUri: URL;
  contextOrigin?: string;
  receipt?: RemoteActorReceipt;
};

export const serializeReceipt = (receipt: RemoteActorReceipt) => {
  let activityUri: string | undefined;
  if (receipt.activityUri) {
    try {
      const uri = new URL(receipt.activityUri.toString());
      if (isHttpUri(uri) && uri.hostname) {
        activityUri = uri.href;
      }
    } catch {
      // Activity IDs are optional evidence; receivedAt remains the stable fallback.
    }
  }

  return {
    receivedAt: receipt.receivedAt.toString(),
    ...(activityUri ? { activityUri } : {}),
  };
};

export const rethrowRemoteActorWorkflowError = (error: unknown): never => {
  const failure = error as (Error & { type?: unknown }) | null;
  if (failure?.name === 'ApplicationFailure' && typeof failure.type === 'string') {
    switch (failure.type) {
      case 'ConflictError':
        throw new ConflictError({ message: failure.message });
      case 'NotFoundError':
        throw new NotFoundError(failure.message);
      case 'RemoteActorMaterializationError':
        throw new RemoteActorMaterializationError(failure.message);
    }
  }
  throw error;
};

const lookupRemoteProfileActor = async (input: RemoteProfileActorLookupInput) => {
  try {
    return await runWorkflow(remoteProfileLookupWorkflow, {
      args: [input],
      mode: 'execute',
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowIdReusePolicy: 'ALLOW_DUPLICATE',
    });
  } catch (error) {
    return rethrowRemoteActorWorkflowError(error);
  }
};

const requireRemoteActor = (actor: ActivityPubObject | null, actorUri: URL): Actor => {
  if (!isActor(actor)) {
    throw new RemoteActorMaterializationError('Remote lookup did not return an actor.');
  }

  if (!actor.id) {
    throw new RemoteActorMaterializationError('Remote actor is missing canonical URI.');
  }

  const actorId = actor.id;

  if ((actorId.protocol !== 'http:' && actorId.protocol !== 'https:') || !actorId.hostname) {
    throw new RemoteActorMaterializationError('Remote actor URI must use HTTP(S) with a hostname.');
  }

  if (actorId.href !== actorUri.href) {
    throw new RemoteActorMaterializationError('Remote lookup returned a different actor URI.');
  }

  return actor;
};

export const fetchRemoteProfileActor = async (
  context: Pick<Context<void>, 'lookupObject'>,
  actorUri: URL,
  documentLoader?: DocumentLoader,
): Promise<Actor> => {
  const result = await (documentLoader
    ? context.lookupObject(actorUri, { documentLoader })
    : context.lookupObject(actorUri));

  if (result === null) {
    throw new Error('Remote lookup did not return an actor.');
  }

  return requireRemoteActor(result as ActivityPubObject, actorUri);
};

export const fetchRemoteProfileActorDocument = async (
  context: Pick<Context<void>, 'lookupObject'>,
  actorUri: URL,
  documentLoader?: DocumentLoader,
): Promise<unknown> => {
  const actor = await fetchRemoteProfileActor(context, actorUri, documentLoader);
  const actorJsonLd = await actor.toJsonLd({
    contextLoader: noNetworkDocumentLoader,
    format: 'expand',
  });
  if (actorJsonLd === undefined) {
    throw new RemoteActorMaterializationError('Remote actor JSON-LD could not be serialized.');
  }
  return actorJsonLd;
};

const parseRemoteProfileActorDocument = async (actorJsonLd: unknown, actorUri: URL) => {
  let parsed: ActivityPubObject;
  try {
    parsed = await ActivityPubObject.fromJsonLd(actorJsonLd, {
      contextLoader: noNetworkDocumentLoader,
      documentLoader: noNetworkDocumentLoader,
    });
  } catch {
    throw new RemoteActorMaterializationError('Remote actor JSON-LD could not be parsed.');
  }

  return requireRemoteActor(parsed, actorUri);
};

const findRequestedRemoteInstance = async (actorUri: URL, allowUnresponsive: boolean) => {
  const localInstance = await resolveConfiguredLocalInstance();

  if ((actorUri.protocol !== 'http:' && actorUri.protocol !== 'https:') || !actorUri.hostname) {
    throw new RemoteActorMaterializationError('Remote actor URI must use HTTP(S) with a hostname.');
  }

  if (actorUri.origin === localInstance.canonicalOrigin) {
    throw new ConflictError({ message: 'Remote actor URI uses the local origin' });
  }

  const targetActorDomain = `${actorUri.hostname.toLowerCase().replace(/\.$/, '')}${
    actorUri.port ? `:${actorUri.port}` : ''
  }`;

  return {
    localInstanceId: localInstance.id,
    requestedRemoteInstance: await findAvailableRemoteInstance(targetActorDomain, {
      allowUnresponsive,
    }),
  };
};

export const findOrMaterializeRemoteProfileActorByUri = async (
  options: RemoteActorLookupOptions,
) => {
  const profileId = await lookupRemoteProfileActor({
    actorUri: options.actorUri.href,
    ...(options.contextOrigin === undefined ? {} : { contextOrigin: options.contextOrigin }),
    ...(options.receipt ? { receipt: serializeReceipt(options.receipt) } : {}),
  });
  if (!profileId) {
    throw new RemoteActorMaterializationError('Remote actor URI did not materialize a profile.');
  }

  const materialized = await findStoredRemoteProfileActorByUri(options.actorUri);

  if (!materialized || materialized.profile.id !== profileId) {
    throw new RemoteActorMaterializationError('Materialized actor URI does not match.');
  }

  return materialized;
};

const persistRemoteProfileActor = async (
  actor: Actor,
  localInstanceId: string,
  existingRequestedRemoteInstance: typeof Instances.$inferSelect | undefined,
  now: Temporal.Instant,
  reactivateUnresponsive: boolean,
) => {
  const actorId = actor.id!;

  let projection: ActorProjection;
  try {
    projection = await projectActor(actor as ActorWithKosmoFields);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new RemoteActorMaterializationError('Remote actor profile projection was rejected.');
    }
    throw error;
  }
  const endpoints = {
    followersUri: actor.followersId?.href ?? null,
    followingUri: actor.followingId?.href ?? null,
    inboxUri: actor.inboxId?.href ?? null,
    outboxUri: actor.outboxId?.href ?? null,
    sharedInboxUri: actor.endpoints?.sharedInbox?.href ?? null,
  };
  const actorUri = actorId.href;
  const actorType = toActorType(actor);
  const canonicalActorHostname = actorId.hostname.toLowerCase().replace(/\.$/, '');
  const canonicalRemoteInstance = await ensureRemoteInstance(
    actorId.port ? `${canonicalActorHostname}:${actorId.port}` : canonicalActorHostname,
    { allowUnresponsive: reactivateUnresponsive },
  );
  const requestedRemoteInstance = existingRequestedRemoteInstance ?? canonicalRemoteInstance;

  const persistActor = () =>
    db.transaction(async (tx) => {
      const findExistingActor = () =>
        tx
          .select({
            actor: getColumns(ActivityPubActors),
            instance: getColumns(Instances),
            profile: getColumns(Profiles),
          })
          .from(ActivityPubActors)
          .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
          .leftJoin(Instances, eq(Instances.id, Profiles.instanceId))
          .where(eq(ActivityPubActors.uri, actorUri))
          .limit(1)
          .for('update', { of: ActivityPubActors })
          .then(first);

      const lockRemoteInstance = (instanceId: string) =>
        tx
          .select()
          .from(Instances)
          .where(eq(Instances.id, instanceId))
          .limit(1)
          .for('update', { of: Instances })
          .then(firstOrThrow)
          .then((instance) =>
            requireAvailableRemoteInstance(instance, {
              allowUnresponsive: reactivateUnresponsive,
            }),
          );

      const lockRemoteInstances = async (instanceIds: readonly string[]) => {
        const lockedInstances = new Map<string, typeof Instances.$inferSelect>();

        for (const instanceId of [...new Set(instanceIds)].sort()) {
          const instance = await lockRemoteInstance(instanceId);
          lockedInstances.set(instance.id, instance);
        }

        return lockedInstances;
      };

      const reactivateLockedInstances = async (instanceIds: readonly string[]) => {
        if (!reactivateUnresponsive) {
          return;
        }

        await tx
          .update(Instances)
          .set({ state: InstanceState.ACTIVE })
          .where(
            and(
              inArray(Instances.id, instanceIds),
              eq(Instances.state, InstanceState.UNRESPONSIVE),
            ),
          );
      };

      const syncProfileMedia = async (profileId: string) => {
        for (const [kind, candidate] of [
          [ProfileMediaKind.AVATAR, projection.avatar],
          [ProfileMediaKind.HEADER, projection.header],
        ] as const) {
          const current = await tx
            .select({ media: Media })
            .from(ProfileMedia)
            .innerJoin(Media, eq(Media.id, ProfileMedia.mediaId))
            .where(and(eq(ProfileMedia.profileId, profileId), eq(ProfileMedia.kind, kind)))
            .limit(1)
            .then(first);
          const currentIsShared = current
            ? await tx
                .select({ mediaId: ProfileMedia.mediaId })
                .from(ProfileMedia)
                .where(and(eq(ProfileMedia.mediaId, current.media.id), ne(ProfileMedia.kind, kind)))
                .limit(1)
                .then(first)
                .then(Boolean)
            : false;

          if (!candidate) {
            await tx
              .delete(ProfileMedia)
              .where(and(eq(ProfileMedia.profileId, profileId), eq(ProfileMedia.kind, kind)));
            continue;
          }

          const media =
            current?.media.source === MediaSource.REMOTE &&
            current.media.profileId === profileId &&
            current.media.url === candidate.url &&
            !currentIsShared
              ? await tx
                  .update(Media)
                  .set({ altText: candidate.altText, mediaType: candidate.mediaType })
                  .where(eq(Media.id, current.media.id))
                  .returning({ id: Media.id })
                  .then(firstOrThrow)
              : await tx
                  .insert(Media)
                  .values({
                    ...candidate,
                    profileId,
                    source: MediaSource.REMOTE,
                    state: MediaState.READY,
                  })
                  .returning({ id: Media.id })
                  .then(firstOrThrow);

          await tx
            .insert(ProfileMedia)
            .values({ kind, mediaId: media.id, profileId })
            .onConflictDoUpdate({
              target: [ProfileMedia.profileId, ProfileMedia.kind],
              set: { mediaId: media.id },
            });
        }
      };

      let existingActor = await findExistingActor();
      let lockedCanonicalRemoteInstance: typeof Instances.$inferSelect | undefined;

      if (!existingActor) {
        const lockedInstances = await lockRemoteInstances([
          requestedRemoteInstance.id,
          canonicalRemoteInstance.id,
        ]);
        await reactivateLockedInstances([...lockedInstances.keys()]);
        lockedCanonicalRemoteInstance = lockedInstances.get(canonicalRemoteInstance.id);
        existingActor = await findExistingActor();
      }

      if (existingActor) {
        const existingInstanceId = existingActor.profile.instanceId;

        if (
          existingInstanceId === null ||
          existingInstanceId === localInstanceId ||
          !existingActor.instance ||
          existingActor.instance.kind === InstanceKind.LOCAL
        ) {
          throw new ConflictError({ message: 'Remote actor collides with a local actor' });
        }

        const lockedInstances = await lockRemoteInstances([
          existingInstanceId,
          requestedRemoteInstance.id,
          canonicalRemoteInstance.id,
        ]);
        await reactivateLockedInstances([...lockedInstances.keys()]);

        if (existingActor.profile.state !== ProfileState.ACTIVE) {
          throw new RemoteActorMaterializationError('Remote profile is unavailable.');
        }

        const handleCollision = await tx
          .select({ id: Profiles.id })
          .from(Profiles)
          .where(
            and(
              inArray(Profiles.instanceId, [
                requestedRemoteInstance.id,
                canonicalRemoteInstance.id,
              ]),
              eq(Profiles.normalizedHandle, projection.normalizedHandle),
              ne(Profiles.id, existingActor.profile.id),
            ),
          )
          .limit(1)
          .then(first);

        if (handleCollision) {
          throw new ConflictError({ message: 'Remote actor handle collides with another actor' });
        }

        if (
          existingActor.actor.lastFetchedAt !== null &&
          existingActor.actor.lastFetchedAt.epochNanoseconds >= now.epochNanoseconds
        ) {
          if (existingInstanceId === canonicalRemoteInstance.id) {
            return existingActor.profile;
          }

          return tx
            .update(Profiles)
            .set({ instanceId: canonicalRemoteInstance.id })
            .where(eq(Profiles.id, existingActor.profile.id))
            .returning()
            .then(firstOrThrow);
        }

        const profile = await tx
          .update(Profiles)
          .set({
            bio: projection.bio,
            createdAt: projection.published ?? existingActor.profile.createdAt,
            displayName: projection.displayName,
            followPolicy: projection.followPolicy,
            handle: projection.handle,
            instanceId: canonicalRemoteInstance.id,
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
            profileUrl: projection.profileUrl,
            type: actorType,
            updatedAt: now,
          })
          .where(eq(ActivityPubActors.uri, actorUri));

        await syncProfileMedia(profile.id);

        return profile;
      }

      const targetRemoteInstance =
        lockedCanonicalRemoteInstance ?? (await lockRemoteInstance(canonicalRemoteInstance.id));
      const handleCollision = await tx
        .select({ id: Profiles.id })
        .from(Profiles)
        .where(
          and(
            inArray(Profiles.instanceId, [requestedRemoteInstance.id, targetRemoteInstance.id]),
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
          instanceId: targetRemoteInstance.id,
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
          profileUrl: projection.profileUrl,
          type: actorType,
          uri: actorUri,
        })
        .returning()
        .then(firstOrThrow);

      await syncProfileMedia(profile.id);

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

export const applyRemoteProfileActorDocument = async (input: {
  actorUri: URL;
  actorJsonLd: unknown;
  observedAt: Temporal.Instant;
}) => {
  const { localInstanceId, requestedRemoteInstance } = await findRequestedRemoteInstance(
    input.actorUri,
    true,
  );
  const actor = await parseRemoteProfileActorDocument(input.actorJsonLd, input.actorUri);
  return persistRemoteProfileActor(
    actor,
    localInstanceId,
    requestedRemoteInstance,
    input.observedAt,
    true,
  );
};

export const materializeRemoteProfileActor = async (options: RemoteActorMaterializationOptions) => {
  const { context, now = getNow(), reactivateUnresponsive = false } = options;
  const { localInstanceId, requestedRemoteInstance } = await findRequestedRemoteInstance(
    options.actorUri,
    reactivateUnresponsive,
  );
  const actor =
    options.actorJsonLd === undefined
      ? await fetchRemoteProfileActor(context, options.actorUri, options.documentLoader)
      : await parseRemoteProfileActorDocument(options.actorJsonLd, options.actorUri);

  return persistRemoteProfileActor(
    actor,
    localInstanceId,
    requestedRemoteInstance,
    now,
    reactivateUnresponsive,
  );
};
