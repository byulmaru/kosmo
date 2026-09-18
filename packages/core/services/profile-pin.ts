import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { db, first, Instances, isUniqueViolation, Posts, ProfilePins, Profiles } from '../db';
import { InstanceKind, PostVisibility } from '../enums';
import { ConflictError, NotFoundError } from '../error';
import { postVisibilityCondition } from '../visibility/post';
import { visibleProfileWhere } from '../visibility/profile';
import type { Transaction } from '../db';

type ProfilePinInput = {
  readonly profileId: string;
  readonly postId: string;
};

type ProfilePinReplacementInput = {
  readonly expectedCurrentPostId: string;
  readonly newPostId: string;
  readonly profileId: string;
};

export type ProfilePinResult = {
  readonly changed: boolean;
  readonly profilePins: readonly (typeof ProfilePins.$inferSelect)[];
};

const loadOrderedPins = (tx: Transaction, profileId: string) =>
  tx
    .select()
    .from(ProfilePins)
    .where(eq(ProfilePins.profileId, profileId))
    .orderBy(asc(ProfilePins.orderKey), asc(ProfilePins.id));

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

const loadFirstVisiblePin = (tx: Transaction, profileId: string) =>
  tx
    .select({
      id: ProfilePins.id,
      profileId: ProfilePins.profileId,
      postId: ProfilePins.postId,
      orderKey: ProfilePins.orderKey,
    })
    .from(ProfilePins)
    .innerJoin(Posts, eq(Posts.id, ProfilePins.postId))
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(and(eq(ProfilePins.profileId, profileId), eligiblePostWhere(profileId)))
    .orderBy(asc(ProfilePins.orderKey), asc(ProfilePins.id))
    .limit(1)
    .then(first);

const staleReplacementError = () =>
  new ConflictError({
    field: 'expectedCurrentPostId',
    message: 'Current profile pin changed',
  });

export const pinProfilePost = async ({
  profileId,
  postId,
}: ProfilePinInput): Promise<ProfilePinResult> =>
  db.transaction(async (tx) => {
    await ensureLocalProfile(tx, profileId);
    await ensureEligiblePost(tx, { profileId, postId });

    const inserted = await tx
      .insert(ProfilePins)
      .values({ profileId, postId })
      .onConflictDoNothing({ target: [ProfilePins.profileId, ProfilePins.postId] })
      .returning()
      .then(first);

    return {
      changed: inserted !== undefined,
      profilePins: await loadOrderedPins(tx, profileId),
    };
  });

export const unpinProfilePost = async ({
  profileId,
  postId,
}: ProfilePinInput): Promise<ProfilePinResult> =>
  db.transaction(async (tx) => {
    await ensureLocalProfile(tx, profileId);

    const deleted = await tx
      .delete(ProfilePins)
      .where(and(eq(ProfilePins.profileId, profileId), eq(ProfilePins.postId, postId)))
      .returning()
      .then(first);

    return {
      changed: deleted !== undefined,
      profilePins: await loadOrderedPins(tx, profileId),
    };
  });

export const replaceCurrentProfilePin = async ({
  expectedCurrentPostId,
  newPostId,
  profileId,
}: ProfilePinReplacementInput): Promise<ProfilePinResult> => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await db.transaction(async (tx) => {
        await ensureLocalProfile(tx, profileId);
        await ensureEligiblePost(tx, { profileId, postId: newPostId });

        const current = await loadFirstVisiblePin(tx, profileId);
        if (!current || current.postId !== expectedCurrentPostId) {
          throw staleReplacementError();
        }

        if (newPostId === expectedCurrentPostId) {
          return { changed: false, profilePins: await loadOrderedPins(tx, profileId) };
        }

        await tx
          .delete(ProfilePins)
          .where(and(eq(ProfilePins.profileId, profileId), eq(ProfilePins.postId, newPostId)));

        const replaced = await tx
          .update(ProfilePins)
          .set({ postId: newPostId })
          .where(
            and(
              eq(ProfilePins.id, current.id),
              eq(ProfilePins.profileId, profileId),
              eq(ProfilePins.postId, expectedCurrentPostId),
            ),
          )
          .returning()
          .then(first);
        if (!replaced) {
          throw staleReplacementError();
        }

        return { changed: true, profilePins: await loadOrderedPins(tx, profileId) };
      });
    } catch (error) {
      if (attempt === 0 && isUniqueViolation(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Unreachable');
};
