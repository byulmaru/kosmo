import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { fraciBinary } from 'fraci';
import {
  db,
  first,
  Instances,
  isUniqueViolation,
  Posts,
  ProfilePinnedPosts,
  profilePinOrderKey,
  Profiles,
} from '../db';
import { InstanceKind, PostVisibility } from '../enums';
import { ConflictError, NotFoundError } from '../error';
import { postVisibilityCondition } from '../visibility/post';
import { visibleProfileWhere } from '../visibility/profile';
import { startProfileUpdateEffects } from './profile-update';
import type { FractionalIndexOf } from 'fraci';
import type { Transaction } from '../db';

const profilePinKeys = fraciBinary({ maxLength: 256, maxRetries: 8 });

export const generateProfilePinKey = (
  before: Uint8Array | null,
  after: Uint8Array | null,
  skip = 0,
): Buffer =>
  Buffer.from(
    profilePinKeys
      .generateKeyBetween(
        before ? (new Uint8Array(before) as FractionalIndexOf<typeof profilePinKeys>) : null,
        after ? (new Uint8Array(after) as FractionalIndexOf<typeof profilePinKeys>) : null,
        skip,
      )
      .next().value,
  );

type ProfilePinInput = {
  readonly profileId: string;
  readonly postId: string;
};

export type ProfilePinResult = {
  readonly changed: boolean;
};

const eligiblePostWhere = (profileId: string) =>
  and(
    eq(Posts.profileId, profileId),
    isNotNull(Posts.currentContentId),
    inArray(Posts.visibility, [
      PostVisibility.PUBLIC,
      PostVisibility.UNLISTED,
      PostVisibility.FOLLOWERS,
    ]),
    postVisibilityCondition({
      columns: {
        authorProfileId: Posts.profileId,
        authorVisible: visibleProfileWhere({ profile: Profiles, instance: Instances }),
        postContentId: Posts.currentContentId,
        postState: Posts.state,
        postVisibility: Posts.visibility,
      },
      viewerProfileId: profileId,
    }),
  );

const ensureLocalProfile = async (tx: Transaction, profileId: string) => {
  const profile = await tx
    .select({ id: Profiles.id })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(Profiles.id, profileId),
        eq(Instances.kind, InstanceKind.LOCAL),
        visibleProfileWhere({ profile: Profiles, instance: Instances }),
      ),
    )
    .limit(1)
    .then(first);

  if (!profile) {
    throw new NotFoundError('Profile not found');
  }
};

const ensureEligiblePost = async (tx: Transaction, { profileId, postId }: ProfilePinInput) => {
  const post = await tx
    .select({ id: Posts.id })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(and(eq(Posts.id, postId), eligiblePostWhere(profileId)))
    .limit(1)
    .then(first);

  if (!post) {
    throw new NotFoundError('Post not found');
  }
};

export const pinProfilePost = async ({
  profileId,
  postId,
}: ProfilePinInput): Promise<ProfilePinResult> => {
  const result = await retryPinWrite(async (tx, attempt) => {
    await ensureLocalProfile(tx, profileId);
    await ensureEligiblePost(tx, { profileId, postId });

    const existing = await tx
      .select({ id: ProfilePinnedPosts.id })
      .from(ProfilePinnedPosts)
      .where(
        and(eq(ProfilePinnedPosts.profileId, profileId), eq(ProfilePinnedPosts.postId, postId)),
      )
      .limit(1)
      .then(first);
    if (existing) {
      return { changed: false, updateId: undefined };
    }

    const last = await tx
      .select({ key: profilePinOrderKey })
      .from(ProfilePinnedPosts)
      .where(eq(ProfilePinnedPosts.profileId, profileId))
      .orderBy(desc(profilePinOrderKey), desc(ProfilePinnedPosts.id))
      .limit(1)
      .then(first);
    const inserted = await tx
      .insert(ProfilePinnedPosts)
      .values({
        profileId,
        postId,
        orderKey: generateProfilePinKey(last?.key ?? null, null, attempt),
      })
      .onConflictDoNothing({ target: [ProfilePinnedPosts.profileId, ProfilePinnedPosts.postId] })
      .returning()
      .then(first);

    return {
      changed: inserted !== undefined,
      updateId: inserted ? randomUUID() : undefined,
    };
  });

  if (result.updateId) {
    await startProfileUpdateEffects(profileId, result.updateId);
  }

  return { changed: result.changed };
};

export const unpinProfilePost = async ({
  profileId,
  postId,
}: ProfilePinInput): Promise<ProfilePinResult> => {
  const result = await db.transaction(async (tx) => {
    await ensureLocalProfile(tx, profileId);

    const deleted = await tx
      .delete(ProfilePinnedPosts)
      .where(
        and(eq(ProfilePinnedPosts.profileId, profileId), eq(ProfilePinnedPosts.postId, postId)),
      )
      .returning()
      .then(first);

    return {
      changed: deleted !== undefined,
      updateId: deleted ? randomUUID() : undefined,
    };
  });

  if (result.updateId) {
    await startProfileUpdateEffects(profileId, result.updateId);
  }

  return { changed: result.changed };
};

// A failed PostgreSQL transaction is discarded before retrying, never reused.
const retryPinWrite = async <T>(
  write: (tx: Transaction, attempt: number) => Promise<T>,
): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction((tx) => write(tx, attempt), { isolationLevel: 'serializable' });
    } catch (error) {
      // Query failures are wrapped by Drizzle; COMMIT failures come directly
      // from postgres-js. Both abort this attempt before a fresh transaction.
      const failure =
        error instanceof Error && 'cause' in error && error.cause ? error.cause : error;
      const code =
        failure && typeof failure === 'object' && 'code' in failure ? failure.code : undefined;
      if (
        attempt >= 7 ||
        (!isUniqueViolation(error) && code !== '23505' && code !== '40001' && code !== '40P01')
      ) {
        throw error;
      }
    }
  }
};

export const reorderProfilePost = async ({
  profileId,
  postId,
  beforePostId,
}: ProfilePinInput & { readonly beforePostId?: string | null }): Promise<ProfilePinResult> => {
  const changed = await retryPinWrite(async (tx, attempt) => {
    await ensureLocalProfile(tx, profileId);
    await ensureEligiblePost(tx, { profileId, postId });
    if (beforePostId) {
      await ensureEligiblePost(tx, { profileId, postId: beforePostId });
    }
    const rows = await tx
      .select({
        id: ProfilePinnedPosts.id,
        postId: ProfilePinnedPosts.postId,
        key: profilePinOrderKey,
      })
      .from(ProfilePinnedPosts)
      .where(eq(ProfilePinnedPosts.profileId, profileId))
      .orderBy(asc(profilePinOrderKey), asc(ProfilePinnedPosts.id));
    const index = rows.findIndex((row) => row.postId === postId);
    const target = rows[index];
    if (!target || (beforePostId && !rows.some((row) => row.postId === beforePostId))) {
      throw new NotFoundError('Pinned post not found');
    }
    if (beforePostId === postId) {
      throw new ConflictError({ message: 'A post cannot be moved before itself' });
    }
    if ((rows[index + 1]?.postId ?? null) === (beforePostId ?? null)) {
      return false;
    }
    const remaining = rows.filter((row) => row.id !== target.id);
    const destination = beforePostId
      ? remaining.findIndex((row) => row.postId === beforePostId)
      : remaining.length;
    const key = generateProfilePinKey(
      remaining[destination - 1]?.key ?? null,
      remaining[destination]?.key ?? null,
      attempt,
    );
    await tx
      .update(ProfilePinnedPosts)
      .set({ orderKey: key })
      .where(eq(ProfilePinnedPosts.id, target.id));
    return true;
  });
  if (changed) {
    await startProfileUpdateEffects(profileId, randomUUID());
  }
  return { changed };
};
