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
import { alias } from 'drizzle-orm/pg-core';
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

const AvatarProfileMedia = alias(ProfileMedia, 'avatar_profile_media');
const AvatarMedia = alias(Media, 'avatar_media');
const HeaderProfileMedia = alias(ProfileMedia, 'header_profile_media');
const HeaderMedia = alias(Media, 'header_media');

const toLocalProfileActorMedia = (
  media: { mediaType: string | null; url: string | null } | null,
): LocalProfileActorMedia | null =>
  media?.mediaType && media.url ? { mediaType: media.mediaType, url: media.url } : null;

const toLocalProfileActorProfile = (
  profile: typeof Profiles.$inferSelect,
  avatar: LocalProfileActorMedia | null,
  header: LocalProfileActorMedia | null,
): LocalProfileActorProfile => ({
  avatar,
  id: profile.id,
  handle: profile.handle,
  name: profile.displayName,
  bio: profile.bio,
  createdAt: profile.createdAt,
  followPolicy: profile.followPolicy,
  header,
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
    const row = await client
      .select({
        avatar: {
          mediaType: AvatarMedia.mediaType,
          url: AvatarMedia.url,
        },
        header: {
          mediaType: HeaderMedia.mediaType,
          url: HeaderMedia.url,
        },
        profile: Profiles,
      })
      .from(Profiles)
      .leftJoin(
        AvatarProfileMedia,
        and(
          eq(AvatarProfileMedia.profileId, Profiles.id),
          eq(AvatarProfileMedia.kind, ProfileMediaKind.AVATAR),
        ),
      )
      .leftJoin(
        AvatarMedia,
        and(
          eq(AvatarMedia.id, AvatarProfileMedia.mediaId),
          eq(AvatarMedia.profileId, Profiles.id),
          eq(AvatarMedia.source, MediaSource.LOCAL),
          eq(AvatarMedia.state, MediaState.READY),
          isNotNull(AvatarMedia.url),
          isNotNull(AvatarMedia.mediaType),
        ),
      )
      .leftJoin(
        HeaderProfileMedia,
        and(
          eq(HeaderProfileMedia.profileId, Profiles.id),
          eq(HeaderProfileMedia.kind, ProfileMediaKind.HEADER),
        ),
      )
      .leftJoin(
        HeaderMedia,
        and(
          eq(HeaderMedia.id, HeaderProfileMedia.mediaId),
          eq(HeaderMedia.profileId, Profiles.id),
          eq(HeaderMedia.source, MediaSource.LOCAL),
          eq(HeaderMedia.state, MediaState.READY),
          isNotNull(HeaderMedia.url),
          isNotNull(HeaderMedia.mediaType),
        ),
      )
      .where(
        and(
          eq(Profiles.id, profileId),
          eq(Profiles.instanceId, localInstanceId),
          eq(Profiles.state, ProfileState.ACTIVE),
        ),
      )
      .limit(1)
      .then(first);

    if (!row) {
      return undefined;
    }

    return toLocalProfileActorProfile(
      row.profile,
      toLocalProfileActorMedia(row.avatar),
      toLocalProfileActorMedia(row.header),
    );
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
