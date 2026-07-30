import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  first,
  getDatabaseConnection,
  Hashtags,
  Instances,
  Media,
  ProfileHashtags,
  ProfileMedia,
  Profiles,
} from '../db';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  ProfileMediaKind,
  ProfileState,
} from '../enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import { profileBioSchema, profileTagsSchema } from '../validation';
import type { Transaction } from '../db';
import type { ProfileFollowPolicy } from '../enums';

export type UpdateProfileInput = {
  readonly accountId: string;
  readonly profileId: string;
  readonly avatarMediaId?: string | null;
  readonly displayName?: string;
  readonly bio?: string | null;
  readonly followPolicy?: ProfileFollowPolicy;
  readonly headerMediaId?: string | null;
  readonly tags?: readonly string[] | null;
};

const normalizeDisplayName = (next: string | undefined, current: string) => {
  if (next === undefined) {
    return undefined;
  }
  if (next === current) {
    return current;
  }

  const normalized = next.trim();
  if ([...normalized].length < 1 || [...normalized].length > 40) {
    throw new ValidationError('표시 이름은 40자 이하로 입력해 주세요.', {
      field: 'displayName',
    });
  }

  return normalized;
};

const normalizeBio = (bio: UpdateProfileInput['bio']) => {
  if (bio === undefined) {
    return undefined;
  }

  const result = profileBioSchema.safeParse(bio);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? 'Invalid profile bio', {
      field: 'bio',
    });
  }

  return result.data;
};

const normalizeTags = (tags: UpdateProfileInput['tags']) => {
  if (tags === undefined || tags === null) {
    return tags;
  }

  const result = profileTagsSchema.safeParse(tags);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? 'Invalid profile tags', {
      field: 'tags',
    });
  }

  return result.data;
};

export const updateProfile = async (input: UpdateProfileInput, tx?: Transaction) =>
  getDatabaseConnection(tx).transaction(async (tx) => {
    const profile = await tx
      .select({ profile: Profiles, actorRole: AccountProfiles.role })
      .from(Profiles)
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .innerJoin(AccountProfiles, eq(AccountProfiles.profileId, Profiles.id))
      .innerJoin(Accounts, eq(Accounts.id, AccountProfiles.accountId))
      .where(
        and(
          eq(Profiles.id, input.profileId),
          eq(AccountProfiles.accountId, input.accountId),
          eq(Accounts.state, AccountState.ACTIVE),
          eq(Instances.kind, InstanceKind.LOCAL),
          eq(Profiles.state, ProfileState.ACTIVE),
          ne(Instances.state, InstanceState.SUSPENDED),
        ),
      )
      .limit(1)
      .for('update', { of: [Profiles, Instances, AccountProfiles, Accounts] })
      .then(first);

    if (!profile) {
      throw new NotFoundError('Profile not found');
    }

    if (profile.actorRole !== AccountProfileRole.OWNER) {
      throw new PermissionDeniedError('Profile owner permission is required');
    }

    const displayName = normalizeDisplayName(input.displayName, profile.profile.displayName);
    const bio = normalizeBio(input.bio);
    const normalizedTags = normalizeTags(input.tags);

    const requestedMedia = [
      { field: 'avatarMediaId', id: input.avatarMediaId },
      { field: 'headerMediaId', id: input.headerMediaId },
    ] as const;
    const requestedMediaIds = [
      ...new Set(requestedMedia.flatMap(({ id }) => (typeof id === 'string' ? [id] : []))),
    ];
    const validMediaIds = new Set(
      requestedMediaIds.length === 0
        ? []
        : await tx
            .select({ id: Media.id })
            .from(Media)
            .where(
              and(
                inArray(Media.id, requestedMediaIds),
                eq(Media.profileId, input.profileId),
                eq(Media.source, MediaSource.LOCAL),
                eq(Media.state, MediaState.READY),
                isNotNull(Media.url),
              ),
            )
            .then((rows) => rows.map(({ id }) => id)),
    );

    for (const { field, id } of requestedMedia) {
      if (typeof id === 'string' && !validMediaIds.has(id)) {
        throw new ValidationError('프로필 이미지로 사용할 수 없는 Media예요.', { field });
      }
    }

    const scalarChanges: {
      displayName?: string;
      bio?: string | null;
      followPolicy?: ProfileFollowPolicy;
    } = {};
    if (displayName !== undefined) {
      scalarChanges.displayName = displayName;
    }
    if (bio !== undefined) {
      scalarChanges.bio = bio;
    }
    if (input.followPolicy !== undefined) {
      scalarChanges.followPolicy = input.followPolicy;
    }

    const updatedProfile =
      Object.keys(scalarChanges).length > 0
        ? await tx
            .update(Profiles)
            .set(scalarChanges)
            .where(eq(Profiles.id, input.profileId))
            .returning()
            .then((profiles) => profiles[0]!)
        : profile.profile;

    if (normalizedTags !== undefined && normalizedTags !== null) {
      await tx.delete(ProfileHashtags).where(eq(ProfileHashtags.profileId, input.profileId));

      if (normalizedTags.length > 0) {
        await tx
          .insert(Hashtags)
          .values(
            normalizedTags.toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
          )
          .onConflictDoNothing({ target: Hashtags.name });

        const names = normalizedTags.map(({ name }) => name);
        const hashtags = await tx
          .select({ id: Hashtags.id, name: Hashtags.name })
          .from(Hashtags)
          .where(inArray(Hashtags.name, names));
        const hashtagIds = new Map(hashtags.map((hashtag) => [hashtag.name, hashtag.id]));

        await tx.insert(ProfileHashtags).values(
          normalizedTags.map(({ name }) => ({
            profileId: input.profileId,
            hashtagId: hashtagIds.get(name)!,
          })),
        );
      }
    }

    for (const [kind, mediaId] of [
      [ProfileMediaKind.AVATAR, input.avatarMediaId],
      [ProfileMediaKind.HEADER, input.headerMediaId],
    ] as const) {
      if (mediaId === undefined) {
        continue;
      }
      if (mediaId === null) {
        await tx
          .delete(ProfileMedia)
          .where(and(eq(ProfileMedia.profileId, input.profileId), eq(ProfileMedia.kind, kind)));
        continue;
      }

      await tx
        .insert(ProfileMedia)
        .values({ kind, mediaId, profileId: input.profileId })
        .onConflictDoUpdate({
          target: [ProfileMedia.profileId, ProfileMedia.kind],
          set: { mediaId },
        });
    }

    return updatedProfile;
  });
