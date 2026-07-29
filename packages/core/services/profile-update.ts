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

const normalizeTags = (tags: UpdateProfileInput['tags']): string[] | null | undefined => {
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
      .for('update', { of: Profiles })
      .then(first);

    if (!profile) {
      throw new NotFoundError('Profile not found');
    }

    if (profile.actorRole !== AccountProfileRole.OWNER) {
      throw new PermissionDeniedError('Profile owner permission is required');
    }

    // The authorization SELECT locks the current Profile row before replacing scalar fields or
    // relations. This serializes concurrent partial updates without writing stale fallback values.
    const updatedProfile = await tx
      .update(Profiles)
      .set({
        displayName: input.displayName ?? profile.profile.displayName,
        bio: input.bio === undefined ? profile.profile.bio : input.bio,
        followPolicy: input.followPolicy ?? profile.profile.followPolicy,
      })
      .where(eq(Profiles.id, input.profileId))
      .returning()
      .then((profiles) => profiles[0]!);

    if (normalizedTags !== undefined && normalizedTags !== null) {
      await tx.delete(ProfileHashtags).where(eq(ProfileHashtags.profileId, input.profileId));

      if (normalizedTags.length > 0) {
        await tx
          .insert(Hashtags)
          .values(normalizedTags.map((name) => ({ name })))
          .onConflictDoNothing({ target: Hashtags.name });

        const hashtags = await tx
          .select({ id: Hashtags.id, name: Hashtags.name })
          .from(Hashtags)
          .where(inArray(Hashtags.name, normalizedTags));
        const hashtagIds = new Map(hashtags.map((hashtag) => [hashtag.name, hashtag.id]));

        await tx.insert(ProfileHashtags).values(
          normalizedTags.map((name) => ({
            profileId: input.profileId,
            hashtagId: hashtagIds.get(name)!,
          })),
        );
      }
    }

    return updatedProfile;
  });
