import { and, eq, inArray, isNotNull, isNull, ne, or } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  ActivityPubPosts,
  db,
  first,
  firstOrThrow,
  getDatabaseConnection,
  Instances,
  isUniqueViolation,
  PostContents,
  Posts,
  ProfileFollows,
  Profiles,
} from '../db';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileState,
} from '../enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import type { Transaction } from '../db';
import type { PostContentDocumentV1 } from '../post-content';

type LocalPostInput = {
  document: PostContentDocumentV1;
  origin: 'LOCAL';
  profileId: string;
  visibility: PostVisibility;
};

type ActivityPubPostInput = {
  document: PostContentDocumentV1;
  objectUri: string;
  origin: 'ACTIVITYPUB';
  profileId: string;
  publishedAt: Temporal.Instant | null;
  receivedAt: Temporal.Instant;
  visibility: PostVisibility;
};

type CreatedPost = {
  content: typeof PostContents.$inferSelect;
  created: true;
  post: typeof Posts.$inferSelect;
};

type DuplicatePost = { created: false };

const isActivityPubPostUriConflict = (error: unknown): boolean => {
  if (!isUniqueViolation(error) || !error || typeof error !== 'object' || !('cause' in error)) {
    return false;
  }

  const { cause } = error;
  return (
    !!cause &&
    typeof cause === 'object' &&
    'constraint_name' in cause &&
    cause.constraint_name === 'activitypub_post_uri_key'
  );
};

const findVisiblePost = async (
  tx: Transaction,
  { actorProfileId, postId }: { actorProfileId: string; postId: string },
) =>
  tx
    .select({
      currentContentId: Posts.currentContentId,
      id: Posts.id,
      profileId: Posts.profileId,
      repostSourceId: Posts.repostSourceId,
      visibility: Posts.visibility,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(
      ProfileFollows,
      and(
        eq(ProfileFollows.followerProfileId, actorProfileId),
        eq(ProfileFollows.followeeProfileId, Posts.profileId),
      ),
    )
    .where(
      and(
        eq(Posts.id, postId),
        eq(Posts.state, PostState.ACTIVE),
        eq(Profiles.state, ProfileState.ACTIVE),
        ne(Instances.state, InstanceState.SUSPENDED),
        or(
          inArray(Posts.visibility, [PostVisibility.PUBLIC, PostVisibility.UNLISTED]),
          eq(Posts.profileId, actorProfileId),
          and(eq(Posts.visibility, PostVisibility.FOLLOWERS), isNotNull(ProfileFollows.id)),
        ),
      ),
    )
    .limit(1)
    .then(first);

export const repostPost = async (
  {
    accountId,
    actorProfileId,
    sourcePostId,
  }: {
    readonly accountId: string;
    readonly actorProfileId: string;
    readonly sourcePostId: string;
  },
  tx?: Transaction,
): Promise<typeof Posts.$inferSelect> =>
  getDatabaseConnection(tx).transaction(async (tx) => {
    const actor = await tx
      .select({ id: Profiles.id })
      .from(Profiles)
      .innerJoin(
        AccountProfiles,
        and(eq(AccountProfiles.profileId, Profiles.id), eq(AccountProfiles.accountId, accountId)),
      )
      .innerJoin(Accounts, eq(Accounts.id, AccountProfiles.accountId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(
        and(
          eq(Profiles.id, actorProfileId),
          eq(Profiles.state, ProfileState.ACTIVE),
          eq(Accounts.state, AccountState.ACTIVE),
          inArray(AccountProfiles.role, [AccountProfileRole.OWNER, AccountProfileRole.MEMBER]),
          eq(Instances.kind, InstanceKind.LOCAL),
          eq(Instances.state, InstanceState.ACTIVE),
        ),
      )
      .limit(1)
      .then(first);
    if (!actor) {
      throw new PermissionDeniedError();
    }

    const source = await findVisiblePost(tx, { actorProfileId, postId: sourcePostId });
    if (!source) {
      throw new NotFoundError('Post not found');
    }
    if (source.currentContentId === null) {
      throw new ValidationError('Post cannot be reposted', { field: 'sourceId' });
    }

    let visibility: PostVisibility;
    if (
      source.visibility === PostVisibility.PUBLIC ||
      source.visibility === PostVisibility.UNLISTED
    ) {
      visibility = PostVisibility.UNLISTED;
    } else if (
      source.visibility === PostVisibility.FOLLOWERS &&
      source.profileId === actorProfileId
    ) {
      visibility = PostVisibility.FOLLOWERS;
    } else {
      throw new ValidationError('Post cannot be reposted', { field: 'sourceId' });
    }

    const visited = new Set([source.id]);
    let nestedSourceId = source.repostSourceId;
    while (nestedSourceId !== null) {
      if (visited.has(nestedSourceId)) {
        throw new NotFoundError('Post not found');
      }
      visited.add(nestedSourceId);

      const nestedSource = await findVisiblePost(tx, {
        actorProfileId,
        postId: nestedSourceId,
      });
      if (!nestedSource || nestedSource.currentContentId === null) {
        throw new NotFoundError('Post not found');
      }
      nestedSourceId = nestedSource.repostSourceId;
    }

    const inserted = await tx
      .insert(Posts)
      .values({
        profileId: actorProfileId,
        repostSourceId: source.id,
        state: PostState.ACTIVE,
        visibility,
      })
      .onConflictDoNothing()
      .returning()
      .then(first);
    if (inserted) {
      return inserted;
    }

    const existing = await tx
      .select()
      .from(Posts)
      .where(
        and(
          eq(Posts.profileId, actorProfileId),
          eq(Posts.repostSourceId, source.id),
          eq(Posts.state, PostState.ACTIVE),
          isNull(Posts.currentContentId),
        ),
      )
      .limit(1)
      .then(first);
    if (!existing) {
      throw new Error('Repost not found after insert conflict');
    }

    return existing;
  });

export function createPost(input: LocalPostInput): Promise<CreatedPost>;
export function createPost(input: ActivityPubPostInput): Promise<CreatedPost | DuplicatePost>;
export async function createPost(
  input: LocalPostInput | ActivityPubPostInput,
): Promise<CreatedPost | DuplicatePost> {
  try {
    return await db.transaction(async (tx) => {
      const createdAt =
        input.origin === 'ACTIVITYPUB' &&
        input.publishedAt &&
        Temporal.Instant.compare(input.publishedAt, input.receivedAt) < 0
          ? input.publishedAt
          : input.origin === 'ACTIVITYPUB'
            ? input.receivedAt
            : undefined;
      const post = await tx
        .insert(Posts)
        .values({
          createdAt,
          profileId: input.profileId,
          state: PostState.ACTIVE,
          visibility: input.visibility,
        })
        .returning()
        .then(firstOrThrow);

      if (input.origin === 'ACTIVITYPUB') {
        await tx.insert(ActivityPubPosts).values({
          postId: post.id,
          publishedAt: input.publishedAt,
          receivedAt: input.receivedAt,
          uri: input.objectUri,
        });
      }

      const content = await tx
        .insert(PostContents)
        .values({
          createdAt: input.origin === 'ACTIVITYPUB' ? input.receivedAt : undefined,
          document: input.document,
          postId: post.id,
        })
        .returning()
        .then(firstOrThrow);
      const linkedPost = await tx
        .update(Posts)
        .set({ currentContentId: content.id })
        .where(eq(Posts.id, post.id))
        .returning()
        .then(firstOrThrow);

      return { content, created: true, post: linkedPost };
    });
  } catch (error) {
    if (input.origin !== 'ACTIVITYPUB' || !isActivityPubPostUriConflict(error)) {
      throw error;
    }

    return { created: false };
  }
}
