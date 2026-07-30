import { and, eq, inArray, ne } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  first,
  getDatabaseConnection,
  Hashtags,
  Instances,
  ProfileHashtags,
  Profiles,
} from '../db';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  ProfileState,
} from '../enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import { profileTagsSchema } from '../validation';
import type { Transaction } from '../db';
import type { ProfileFollowPolicy } from '../enums';

export type UpdateProfileInput = {
  readonly accountId: string;
  readonly profileId: string;
  readonly displayName?: string;
  readonly bio?: string | null;
  readonly followPolicy?: ProfileFollowPolicy;
  readonly tags?: readonly string[] | null;
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
    const normalizedTags = normalizeTags(input.tags);
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
      .then(first);

    if (!profile) {
      throw new NotFoundError('Profile not found');
    }

    if (profile.actorRole !== AccountProfileRole.OWNER) {
      throw new PermissionDeniedError('Profile owner permission is required');
    }

    const scalarChanges: {
      displayName?: string;
      bio?: string | null;
      followPolicy?: ProfileFollowPolicy;
    } = {};
    if (input.displayName !== undefined) {
      scalarChanges.displayName = input.displayName;
    }
    if (input.bio !== undefined) {
      scalarChanges.bio = input.bio;
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

    return updatedProfile;
  });
