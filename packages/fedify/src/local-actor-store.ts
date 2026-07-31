import '@kosmo/core/polyfill';

import {
  ActivityPubActorKeys,
  ActivityPubActors,
  db,
  first,
  Media,
  ProfileMedia,
  Profiles,
} from '@kosmo/core/db';
import {
  ActivityPubActorType,
  MediaSource,
  MediaState,
  ProfileMediaKind,
  ProfileState,
} from '@kosmo/core/enums';
import { and, eq, isNotNull } from 'drizzle-orm';
import { ensureLocalProfileActor } from './local-profile-actor';
import type { Database } from '@kosmo/core/db';
import type {
  CreateLocalActorKeyInput,
  CreateLocalActorRowInput,
  EnsureLocalProfileActorOptions,
  LocalActorStore,
  LocalProfileActorMedia,
  LocalProfileActorProfile,
  LocalProfileActorResult,
  StoredLocalActorKey,
  StoredLocalActorRow,
} from './local-profile-actor';

type LocalActorDbClient = Pick<Database, 'insert' | 'select'>;

const toLocalProfileActorProfile = (
  profile: typeof Profiles.$inferSelect,
  mediaByKind: ReadonlyMap<string, LocalProfileActorMedia>,
): LocalProfileActorProfile => ({
  avatar: mediaByKind.get(ProfileMediaKind.AVATAR) ?? null,
  id: profile.id,
  handle: profile.handle,
  name: profile.displayName,
  bio: profile.bio,
  createdAt: profile.createdAt,
  followPolicy: profile.followPolicy,
  header: mediaByKind.get(ProfileMediaKind.HEADER) ?? null,
});

const findActorByProfileId = async (
  client: LocalActorDbClient,
  profileId: string,
): Promise<StoredLocalActorRow | undefined> =>
  client
    .select()
    .from(ActivityPubActors)
    .where(eq(ActivityPubActors.profileId, profileId))
    .limit(1)
    .then(first);

const findActorKey = async (
  client: LocalActorDbClient,
  input: Pick<CreateLocalActorKeyInput, 'activityPubActorId' | 'kind'>,
): Promise<StoredLocalActorKey | undefined> =>
  client
    .select()
    .from(ActivityPubActorKeys)
    .where(
      and(
        eq(ActivityPubActorKeys.activityPubActorId, input.activityPubActorId),
        eq(ActivityPubActorKeys.kind, input.kind),
      ),
    )
    .limit(1)
    .then(first);

const requireExistingActor = async (
  client: LocalActorDbClient,
  input: CreateLocalActorRowInput,
) => {
  const existingActor = await findActorByProfileId(client, input.profileId);

  if (!existingActor) {
    throw new Error(`Local ActivityPub actor for profile ${input.profileId} was not created.`);
  }

  return existingActor;
};

const requireExistingActorKey = async (
  client: LocalActorDbClient,
  input: CreateLocalActorKeyInput,
) => {
  const existingKey = await findActorKey(client, input);

  if (!existingKey) {
    throw new Error(
      `Local ActivityPub actor key ${input.kind} for actor ${input.activityPubActorId} was not created.`,
    );
  }

  return existingKey;
};

export const createDrizzleLocalActorStore = (client: LocalActorDbClient = db): LocalActorStore => ({
  async findActiveLocalProfile({ localInstanceId, profileId }) {
    const profile = await client
      .select()
      .from(Profiles)
      .where(
        and(
          eq(Profiles.id, profileId),
          eq(Profiles.instanceId, localInstanceId),
          eq(Profiles.state, ProfileState.ACTIVE),
        ),
      )
      .limit(1)
      .then(first);

    if (!profile) {
      return undefined;
    }

    const media = await client
      .select({
        kind: ProfileMedia.kind,
        mediaType: Media.mediaType,
        url: Media.url,
      })
      .from(ProfileMedia)
      .innerJoin(
        Media,
        and(eq(Media.id, ProfileMedia.mediaId), eq(Media.profileId, ProfileMedia.profileId)),
      )
      .where(
        and(
          eq(ProfileMedia.profileId, profile.id),
          eq(Media.source, MediaSource.LOCAL),
          eq(Media.state, MediaState.READY),
          isNotNull(Media.url),
          isNotNull(Media.mediaType),
        ),
      );
    const mediaByKind = new Map<string, LocalProfileActorMedia>();
    for (const item of media) {
      if (item.url && item.mediaType) {
        mediaByKind.set(item.kind, { mediaType: item.mediaType, url: item.url });
      }
    }

    return toLocalProfileActorProfile(profile, mediaByKind);
  },

  findActorByProfileId(profileId) {
    return findActorByProfileId(client, profileId);
  },

  async createActor(input: CreateLocalActorRowInput) {
    const insertedActor = await client
      .insert(ActivityPubActors)
      .values({
        profileId: input.profileId,
        uri: input.uri,
        type: ActivityPubActorType.PERSON,
      })
      .onConflictDoNothing({ target: [ActivityPubActors.profileId] })
      .returning()
      .then(first);

    return insertedActor ?? requireExistingActor(client, input);
  },

  findActorKeys(activityPubActorId) {
    return client
      .select()
      .from(ActivityPubActorKeys)
      .where(eq(ActivityPubActorKeys.activityPubActorId, activityPubActorId));
  },

  async createActorKey(input: CreateLocalActorKeyInput) {
    const insertedKey = await client
      .insert(ActivityPubActorKeys)
      .values(input)
      .onConflictDoNothing({
        target: [ActivityPubActorKeys.activityPubActorId, ActivityPubActorKeys.kind],
      })
      .returning()
      .then(first);

    return insertedKey ?? requireExistingActorKey(client, input);
  },
});

export const ensureDrizzleLocalProfileActor = async (
  options: Omit<EnsureLocalProfileActorOptions, 'store'>,
): Promise<LocalProfileActorResult | null> =>
  db.transaction((tx) =>
    ensureLocalProfileActor({
      ...options,
      store: createDrizzleLocalActorStore(tx),
    }),
  );
