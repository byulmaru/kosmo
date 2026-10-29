import crypto from 'node:crypto';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { fraciBinary } from 'fraci';
import { defineDrizzleFraci, drizzleFraci } from 'fraci/drizzle';
import { db, first, Instances, Posts, ProfilePinnedPosts, Profiles } from '../db';
import { InstanceKind, PostVisibility } from '../enums';
import { ConflictError, NotFoundError } from '../error';
import { postVisibilityCondition } from '../visibility/post';
import { visibleProfileWhere } from '../visibility/profile';
import { startProfileUpdateEffects } from './profile-update';
import type { FractionalIndexOf } from 'fraci';
import type { Transaction } from '../db';

const profilePinKeys = fraciBinary();
const profilePinFraci = defineDrizzleFraci(
  profilePinKeys,
  ProfilePinnedPosts,
  ProfilePinnedPosts.orderKey,
  { profileId: ProfilePinnedPosts.profileId },
  { postId: ProfilePinnedPosts.postId },
);

export const generateProfilePinKey = (
  before: Uint8Array | null,
  after: Uint8Array | null,
): (typeof ProfilePinnedPosts.$inferSelect)['orderKey'] => {
  const key = profilePinKeys
    .generateKeyBetween(
      before ? (new Uint8Array(before) as FractionalIndexOf<typeof profilePinKeys>) : null,
      after ? (new Uint8Array(after) as FractionalIndexOf<typeof profilePinKeys>) : null,
      crypto.randomInt(256),
    )
    .next().value;
  return Buffer.from(key) as (typeof ProfilePinnedPosts.$inferSelect)['orderKey'];
};

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
  const result = await db.transaction(async (tx) => {
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

    const keys = drizzleFraci(tx, profilePinFraci);
    const [last] = await keys.indicesForLast({ profileId });
    const inserted = await tx
      .insert(ProfilePinnedPosts)
      .values({
        profileId,
        postId,
        orderKey: generateProfilePinKey(last, null),
      })
      .onConflictDoNothing({ target: [ProfilePinnedPosts.profileId, ProfilePinnedPosts.postId] })
      .returning()
      .then(first);

    return {
      changed: inserted !== undefined,
      updateId: inserted ? crypto.randomUUID() : undefined,
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
      updateId: deleted ? crypto.randomUUID() : undefined,
    };
  });

  if (result.updateId) {
    await startProfileUpdateEffects(profileId, result.updateId);
  }

  return { changed: result.changed };
};

export const reorderProfilePost = async ({
  profileId,
  postId,
  beforePostId,
}: ProfilePinInput & { readonly beforePostId?: string | null }): Promise<ProfilePinResult> => {
  const changed = await db.transaction(async (tx) => {
    await ensureLocalProfile(tx, profileId);
    await ensureEligiblePost(tx, { profileId, postId });
    if (beforePostId) {
      await ensureEligiblePost(tx, { profileId, postId: beforePostId });
    }

    const keys = drizzleFraci(tx, profilePinFraci);
    const targetKeys = await keys.indicesForAfter({ profileId }, { postId });
    if (!targetKeys) {
      throw new NotFoundError('Pinned post not found');
    }
    let destinationKeys: [Uint8Array | null, Uint8Array | null];

    if (beforePostId) {
      const beforeKeys = await keys.indicesForBefore({ profileId }, { postId: beforePostId });
      if (!beforeKeys) {
        throw new NotFoundError('Pinned post not found');
      }
      if (beforePostId === postId) {
        throw new ConflictError({ message: 'A post cannot be moved before itself' });
      }
      if (targetKeys[1] && Buffer.compare(targetKeys[1], beforeKeys[1]) === 0) {
        return false;
      }
      destinationKeys = beforeKeys;
    } else {
      if (!targetKeys[1]) {
        return false;
      }
      destinationKeys = await keys.indicesForLast({ profileId });
    }

    const key = generateProfilePinKey(destinationKeys[0], destinationKeys[1]);
    await tx
      .update(ProfilePinnedPosts)
      .set({ orderKey: key })
      .where(
        and(eq(ProfilePinnedPosts.profileId, profileId), eq(ProfilePinnedPosts.postId, postId)),
      );
    return true;
  });
  if (changed) {
    await startProfileUpdateEffects(profileId, crypto.randomUUID());
  }
  return { changed };
};
