import { createHash } from 'node:crypto';
import { WorkflowExecutionAlreadyStartedError, WorkflowNotFoundError } from '@temporalio/client';
import { and, eq, inArray, isNotNull, isNull, ne, notExists, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  ActivityPubPosts,
  db,
  first,
  firstOrThrow,
  getDatabaseConnection,
  Hashtags,
  Instances,
  isUniqueViolation,
  Media,
  PostContentHashtags,
  PostContents,
  PostMentions,
  Posts,
  ProfileBlocks,
  ProfileFollows,
  Profiles,
} from '../db';
import {
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  PostQuoteConsentStatus,
  PostState,
  PostVisibility,
  ProfileState,
} from '../enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import { normalizePostContentPlainText } from '../post-content';
import {
  applyRemotePostContentHashtags,
  canonicalizePostContentDocument,
  findRemotePostContentHashtags,
  postContentDocumentFromTextAndMedia,
  postContentDocumentToText,
  postContentHashtagCandidatesFromText,
  validateLocalPostContentDocument,
} from '../post-content/server';
import { runWorkflow, temporalClient } from '../temporal/client';
import {
  postCreateInputKey,
  postCreateWorkflow,
  postDeleteMutationWorkflow,
  unwrapPostTransition,
} from '../temporal/post';
import { quotePostCreateInput } from '../temporal/post-admission';
import { KOSMO_TASK_QUEUE } from '../temporal/task-queue';
import { normalizeHashtag } from '../validation/hashtag';
import { postVisibilityCondition } from '../visibility/post';
import { revokePostQuoteConsentsForSource } from './post-quote-consent';
import { validatePostStructure } from './post-structure';
import { assertProfilePairIsNotBlocked } from './profile-block-policy';
import type { DatabaseHandle, Transaction } from '../db';
import type { PostContentDocumentV1 } from '../post-content';
import type {
  PostContentHashtagReference,
  PostContentMentionReference,
} from '../post-content/server';

export type LegacyLocalPostInput = {
  admissionId?: string;
  accountId?: string;
  /**
   * Normalized authored body paired with `document`, supplied by the API after validating the
   * selected mention ranges. GraphQL clients send body text and ranges, never this value or a doc.
   */
  authoredBodyText?: string;
  document: PostContentDocumentV1;
  media?: readonly {
    altText: string | null;
    mediaId: string;
  }[];
  origin: 'LOCAL';
  profileId: string;
  replyParentId?: string;
  repostSourceId?: string;
  visibility: PostVisibility;
};

export type LocalPostInput = {
  admissionId?: string;
  accountId?: string;
  bodyText: string;
  contentWarning?: string | null;
  media?: readonly {
    altText: string | null;
    mediaId: string;
  }[];
  mentions?: readonly PostContentMentionReference[];
  origin: 'LOCAL';
  profileId: string;
  replyParentId?: string;
  repostSourceId?: string;
  sensitiveMedia?: boolean;
  visibility: PostVisibility;
};

export type ActivityPubPostInput = {
  document: PostContentDocumentV1;
  hashtagNames?: readonly string[];
  media?: readonly RemoteMediaCandidate[];
  mentionProfileIds: readonly string[];
  objectUri: string;
  origin: 'ACTIVITYPUB';
  profileId: string;
  publishedAt: Temporal.Instant | null;
  receivedAt: Temporal.Instant;
  replyParentId?: string;
  visibility: PostVisibility;
};

export type RemoteMediaCandidate = {
  altText: string | null;
  mediaType: string | null;
  url: string;
};

export type PostCreateInput = LocalPostInput | ActivityPubPostInput;

type PostOrigin = 'LOCAL' | 'ACTIVITYPUB';

type LocalRepostInput = {
  actorAccountId?: string;
  actorProfileId: string;
  origin: 'LOCAL';
  sourcePostId: string;
};

type ActivityPubRepostInput = {
  activityUri: string;
  actorProfileId: string;
  origin: 'ACTIVITYPUB';
  publishedAt: Temporal.Instant | null;
  receivedAt: Temporal.Instant;
  sourcePostId: string;
};

type RepostInput = LocalRepostInput | ActivityPubRepostInput;

type RepostResult = {
  readonly created: boolean;
  readonly repost: typeof Posts.$inferSelect;
};

type CreatedPost = {
  content: typeof PostContents.$inferSelect;
  created: true;
  post: typeof Posts.$inferSelect;
};

type DuplicatePost = { created: false };

const upsertHashtags = async (
  tx: Transaction,
  namesAndDisplayNames: ReadonlyMap<string, string>,
) => {
  if (namesAndDisplayNames.size === 0) {
    return new Map<string, string>();
  }

  const names = [...namesAndDisplayNames.keys()];
  await tx
    .insert(Hashtags)
    .values(
      [...namesAndDisplayNames]
        .map(([name, displayName]) => ({ displayName, name }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    )
    .onConflictDoNothing({ target: Hashtags.name });

  const hashtagRows = await tx
    .select({ id: Hashtags.id, name: Hashtags.name })
    .from(Hashtags)
    .where(inArray(Hashtags.name, names));
  return new Map(hashtagRows.map(({ id, name }) => [name, id]));
};

const resolveLocalPostHashtags = async (
  tx: Transaction,
  bodyText: string,
  mentions: readonly PostContentMentionReference[],
) => {
  const candidates = postContentHashtagCandidatesFromText(bodyText, mentions);
  if (candidates.length === 0) {
    return { hashtagIds: [], references: [] as PostContentHashtagReference[] };
  }

  const namesAndDisplayNames = new Map<string, string>();
  for (const { end, start } of candidates) {
    const { displayName, name } = normalizeHashtag(bodyText.slice(start, end));
    if (!namesAndDisplayNames.has(name)) {
      namesAndDisplayNames.set(name, displayName);
    }
  }
  const hashtagIdsByName = await upsertHashtags(tx, namesAndDisplayNames);
  const references = candidates.map(({ end, start }) => {
    const { name } = normalizeHashtag(bodyText.slice(start, end));
    return { end, hashtagId: hashtagIdsByName.get(name)!, start };
  });

  return {
    hashtagIds: [...new Set(references.map(({ hashtagId }) => hashtagId))],
    references,
  };
};

const resolveRemotePostHashtags = async (
  tx: Transaction,
  document: PostContentDocumentV1,
  hashtagNames: readonly string[],
) => {
  const matches = findRemotePostContentHashtags(document, hashtagNames);
  if (matches.length === 0) {
    return { document, hashtagIds: [] as string[] };
  }

  const namesAndDisplayNames = new Map<string, string>();
  for (const { name: typedName } of matches) {
    const { displayName, name } = normalizeHashtag(typedName);
    if (!namesAndDisplayNames.has(name)) {
      namesAndDisplayNames.set(name, displayName);
    }
  }
  const hashtagIdsByName = await upsertHashtags(tx, namesAndDisplayNames);
  const matchesWithIds = matches.map((match) => ({
    ...match,
    hashtagId: hashtagIdsByName.get(normalizeHashtag(match.name).name)!,
  }));

  return {
    document: applyRemotePostContentHashtags(document, matchesWithIds),
    hashtagIds: [...new Set(matchesWithIds.map(({ hashtagId }) => hashtagId))],
  };
};

export const isActivityPubPostUriConflict = (error: unknown): boolean => {
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
        postVisibilityCondition({
          columns: {
            authorProfileId: Posts.profileId,
            authorVisible: and(
              eq(Profiles.state, ProfileState.ACTIVE),
              ne(Instances.state, InstanceState.SUSPENDED),
            )!,
            postContentId: Posts.currentContentId,
            postState: Posts.state,
            postVisibility: Posts.visibility,
          },
          viewerFollowsAuthor: isNotNull(ProfileFollows.id),
          viewerProfileId: actorProfileId,
        }),
      ),
    )
    .limit(1)
    .then(first);

const findVisibleQuoteSource = async (
  tx: Transaction,
  { actorProfileId, postId }: { actorProfileId: string; postId: string },
) =>
  tx
    .select({
      currentContentId: Posts.currentContentId,
      id: Posts.id,
      instanceKind: Instances.kind,
      profileId: Posts.profileId,
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
        notExists(
          tx
            .select({ id: ProfileBlocks.id })
            .from(ProfileBlocks)
            .where(
              or(
                and(
                  eq(ProfileBlocks.ownerProfileId, actorProfileId),
                  eq(ProfileBlocks.targetProfileId, Posts.profileId),
                ),
                and(
                  eq(ProfileBlocks.ownerProfileId, Posts.profileId),
                  eq(ProfileBlocks.targetProfileId, actorProfileId),
                ),
              ),
            ),
        ),
        postVisibilityCondition({
          columns: {
            authorProfileId: Posts.profileId,
            authorVisible: and(
              eq(Profiles.state, ProfileState.ACTIVE),
              ne(Instances.state, InstanceState.SUSPENDED),
            )!,
            postContentId: Posts.currentContentId,
            postState: Posts.state,
            postVisibility: Posts.visibility,
          },
          viewerFollowsAuthor: isNotNull(ProfileFollows.id),
          viewerProfileId: actorProfileId,
        }),
      ),
    )
    .limit(1)
    .for('share', { of: Posts })
    .then(first);

const validateQuoteSource = async (
  tx: Transaction,
  { actorProfileId, postId }: { actorProfileId: string; postId: string },
) => {
  const source = await findVisibleQuoteSource(tx, { actorProfileId, postId });
  if (!source) {
    throw new NotFoundError('Post not found');
  }
  if (source.currentContentId === null) {
    throw new ValidationError('Post cannot be quoted', { field: 'repostSourceId' });
  }
  if (source.profileId !== actorProfileId && source.visibility === PostVisibility.FOLLOWERS) {
    throw new ValidationError('Post cannot be quoted', { field: 'repostSourceId' });
  }
  if (source.visibility === PostVisibility.DIRECT) {
    throw new ValidationError('Post cannot be quoted', { field: 'repostSourceId' });
  }
  if (source.instanceKind === InstanceKind.ACTIVITYPUB) {
    throw new ValidationError('Quote approval is not available', { field: 'repostSourceId' });
  }
  return source;
};

const resolveRepostVisibility = (
  source: {
    readonly profileId: string;
    readonly visibility: PostVisibility;
  },
  actorProfileId: string,
): PostVisibility => {
  if (
    source.visibility === PostVisibility.PUBLIC ||
    source.visibility === PostVisibility.UNLISTED
  ) {
    return PostVisibility.UNLISTED;
  }
  if (source.visibility === PostVisibility.FOLLOWERS && source.profileId === actorProfileId) {
    return PostVisibility.FOLLOWERS;
  }
  throw new ValidationError('Post cannot be reposted', { field: 'sourceId' });
};

const createOrFindRepost = async (
  tx: Transaction,
  {
    actorAccountId,
    actorProfileId,
    sourcePostId,
  }: {
    readonly actorAccountId: string | null;
    readonly actorProfileId: string;
    readonly sourcePostId: string;
  },
) => {
  const source = await findVisiblePost(tx, {
    actorProfileId,
    postId: sourcePostId,
  });
  if (!source) {
    throw new NotFoundError('Post not found');
  }
  await assertProfilePairIsNotBlocked(tx, {
    notFoundMessage: 'Post not found',
    firstProfileId: actorProfileId,
    secondProfileId: source.profileId,
  });
  if (source.currentContentId === null) {
    throw new ValidationError('Post cannot be reposted', { field: 'sourceId' });
  }

  const visibility = resolveRepostVisibility(source, actorProfileId);
  const inserted = await tx
    .insert(Posts)
    .values({
      actorAccountId,
      profileId: actorProfileId,
      repostSourceId: source.id,
      state: PostState.ACTIVE,
      visibility,
    })
    .onConflictDoNothing()
    .returning()
    .then(first);
  if (inserted) {
    return { created: true as const, repost: inserted };
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

  return { created: false as const, repost: existing };
};

const saveCurrentAnnounce = async (
  tx: Transaction,
  {
    activityUri,
    actorProfileId,
    postId,
    publishedAt,
    receivedAt,
    sourcePostId,
  }: {
    readonly activityUri: string;
    readonly actorProfileId: string;
    readonly postId: string;
    readonly publishedAt: Temporal.Instant | null;
    readonly receivedAt: Temporal.Instant;
    readonly sourcePostId: string;
  },
): Promise<boolean> => {
  const existing = await tx
    .select({
      currentContentId: Posts.currentContentId,
      mappingId: ActivityPubPosts.id,
      postId: ActivityPubPosts.postId,
      postProfileId: Posts.profileId,
      postRepostSourceId: Posts.repostSourceId,
      postState: Posts.state,
      replyParentId: Posts.replyParentId,
      uri: ActivityPubPosts.uri,
    })
    .from(ActivityPubPosts)
    .innerJoin(Posts, eq(Posts.id, ActivityPubPosts.postId))
    .where(or(eq(ActivityPubPosts.postId, postId), eq(ActivityPubPosts.uri, activityUri)));

  const current = existing.find((row) => row.postId === postId);
  const collision = existing.find((row) => row.uri === activityUri && row.postId !== postId);
  if (collision) {
    const isPriorDeletedGeneration =
      collision.postProfileId === actorProfileId &&
      collision.postRepostSourceId === sourcePostId &&
      collision.currentContentId === null &&
      collision.replyParentId === null &&
      collision.postState === PostState.DELETED;
    if (!isPriorDeletedGeneration) {
      throw new ValidationError('Announce id is already assigned', { field: 'id' });
    }

    await tx.delete(ActivityPubPosts).where(eq(ActivityPubPosts.id, collision.mappingId));
  }

  if (!current) {
    await tx.insert(ActivityPubPosts).values({
      postId,
      publishedAt,
      receivedAt,
      uri: activityUri,
    });
    return true;
  }

  if (
    current.postState !== PostState.ACTIVE ||
    current.currentContentId !== null ||
    current.replyParentId !== null ||
    current.postRepostSourceId !== sourcePostId
  ) {
    return false;
  }

  await tx
    .update(ActivityPubPosts)
    .set({ publishedAt, receivedAt, uri: activityUri })
    .where(eq(ActivityPubPosts.id, current.mappingId));
  return true;
};

const materializeRemoteMedia = async (
  tx: Transaction,
  {
    candidates,
    profileId,
  }: {
    candidates: readonly RemoteMediaCandidate[];
    profileId: string;
  },
) => {
  if (candidates.length > 4) {
    throw new ValidationError('Remote Media cannot be attached', { field: 'media' });
  }

  const materialized: { mediaId: string }[] = [];
  for (const candidate of candidates) {
    const media = await tx
      .insert(Media)
      .values({
        ...candidate,
        profileId,
        source: MediaSource.REMOTE,
        state: MediaState.READY,
      })
      .returning({ id: Media.id })
      .then(firstOrThrow);
    materialized.push({ mediaId: media.id });
  }
  return materialized;
};

export const deletePostPersisted = async ({
  actorProfileId,
  postId,
}: {
  readonly actorProfileId: string;
  readonly origin: PostOrigin;
  readonly postId: string;
}) => {
  return db.transaction(async (tx) => {
    const post = await tx
      .select({
        currentContentId: Posts.currentContentId,
        state: Posts.state,
        profileId: Posts.profileId,
        replyParentId: Posts.replyParentId,
        repostSourceId: Posts.repostSourceId,
      })
      .from(Posts)
      .where(eq(Posts.id, postId))
      .limit(1)
      .for('update')
      .then(first);
    if (!post) {
      throw new NotFoundError('Post not found');
    }

    if (post.profileId !== actorProfileId) {
      throw new PermissionDeniedError('Post author permission is required');
    }

    const deleted = await tx
      .update(Posts)
      .set({ deletedAt: sql`now()`, state: PostState.DELETED })
      .where(
        and(
          eq(Posts.id, postId),
          eq(Posts.profileId, actorProfileId),
          eq(Posts.state, PostState.ACTIVE),
        ),
      )
      .returning({
        id: Posts.id,
      })
      .then(first);

    const revokedQuoteIds =
      (deleted || post.state === PostState.DELETED) && post.currentContentId !== null
        ? (await revokePostQuoteConsentsForSource(tx, postId)).map(({ id }) => id).sort()
        : [];

    const sourcePostId =
      post.currentContentId === null && post.replyParentId === null ? post.repostSourceId : null;
    return {
      deleted,
      revokedQuoteIds,
      result: { postId, replyParentId: post.replyParentId, sourcePostId },
    };
  });
};

export const deletePost = async ({
  actorProfileId,
  origin,
  postId,
}: {
  readonly actorProfileId: string;
  readonly origin: PostOrigin;
  readonly postId: string;
}): Promise<{
  readonly postId: string;
  readonly replyParentId: string | null;
  readonly sourcePostId: string | null;
}> => {
  const result = unwrapPostTransition(
    await runWorkflow(postDeleteMutationWorkflow, {
      args: [{ actorProfileId, origin, postId }],
      mode: 'update-with-start',
      updateId: 'delete',
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowIdReusePolicy: 'ALLOW_DUPLICATE',
    }),
  );
  return { ...result, replyParentId: result.replyParentId ?? null };
};

export function repostPost(input: LocalRepostInput): Promise<RepostResult>;
export function repostPost(input: ActivityPubRepostInput): Promise<RepostResult>;
export async function repostPost(input: RepostInput): Promise<RepostResult> {
  const result = await db.transaction(async (tx) => {
    let materialized = await createOrFindRepost(tx, {
      actorAccountId: input.origin === 'LOCAL' ? (input.actorAccountId ?? null) : null,
      actorProfileId: input.actorProfileId,
      sourcePostId: input.sourcePostId,
    });

    if (input.origin === 'ACTIVITYPUB') {
      const save = (postId: string) =>
        saveCurrentAnnounce(tx, {
          activityUri: input.activityUri,
          actorProfileId: input.actorProfileId,
          postId,
          publishedAt: input.publishedAt,
          receivedAt: input.receivedAt,
          sourcePostId: input.sourcePostId,
        });

      if (!(await save(materialized.repost.id))) {
        materialized = await createOrFindRepost(tx, {
          actorAccountId: null,
          actorProfileId: input.actorProfileId,
          sourcePostId: input.sourcePostId,
        });
        if (!(await save(materialized.repost.id))) {
          throw new Error('Active Repost not found after current Announce materialization');
        }
      }
    }

    return materialized;
  });

  if (result.created) {
    const workflowInput = { origin: input.origin, postId: result.repost.id };
    try {
      await temporalClient.withDeadline(Date.now() + 5_000, () =>
        temporalClient.workflow.start('postRepostWorkflow', {
          args: [workflowInput],
          taskQueue: KOSMO_TASK_QUEUE,
          workflowId: `post-repost:${workflowInput.postId}`,
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'REJECT_DUPLICATE',
        }),
      );
    } catch (error) {
      console.error('Post Repost Workflow start failed', {
        error,
        origin: input.origin,
        postId: result.repost.id,
      });
    }
  }

  return result;
}
export const createPostInTransaction = async (
  tx: Transaction,
  input: PostCreateInput | LegacyLocalPostInput,
  postId?: string,
  initialContentId?: string,
): Promise<CreatedPost> => {
  let document: PostContentDocumentV1;
  let postContentHashtagIds: string[] = [];
  if (input.origin === 'LOCAL' && 'document' in input) {
    const canonical = validateLocalPostContentDocument(input.document, input.authoredBodyText);
    const bodyText = postContentDocumentToText(canonical);
    const resolved = await resolveRemotePostHashtags(
      tx,
      canonical,
      postContentHashtagCandidatesFromText(bodyText, []).map(({ start, end }) =>
        bodyText.slice(start, end),
      ),
    );
    document = resolved.document;
    postContentHashtagIds = resolved.hashtagIds;
  } else if (input.origin === 'LOCAL') {
    const bodyText = normalizePostContentPlainText(input.bodyText);
    const mentions = input.mentions ?? [];
    const { hashtagIds, references } = await resolveLocalPostHashtags(tx, bodyText, mentions);
    postContentHashtagIds = hashtagIds;
    document = validateLocalPostContentDocument(
      postContentDocumentFromTextAndMedia(
        bodyText,
        (input.media ?? []).map(({ mediaId }) => ({ mediaId })),
        input.sensitiveMedia ?? false,
        input.contentWarning ?? null,
        mentions,
        references,
      ),
      bodyText,
    );
  } else {
    const resolved = await resolveRemotePostHashtags(tx, input.document, input.hashtagNames ?? []);
    document = resolved.document;
    postContentHashtagIds = resolved.hashtagIds;
  }
  const mentionProfileIds = new Set(
    input.origin === 'ACTIVITYPUB'
      ? input.mentionProfileIds
      : 'document' in input
        ? document.body.content.flatMap((block) =>
            block.type === 'paragraph'
              ? (block.content ?? []).flatMap((node) =>
                  node.type === 'mention' ? [node.attrs.profileId] : [],
                )
              : [],
          )
        : (input.mentions ?? []).map(({ profileId }) => profileId),
  );
  if (
    input.origin === 'LOCAL' &&
    input.replyParentId !== undefined &&
    input.repostSourceId !== undefined
  ) {
    throw new ValidationError('Post cannot have a Reply Parent and Quote Source', {
      field: 'repostSourceId',
    });
  }

  if (input.origin === 'LOCAL') {
    const media = input.media ?? [];
    const mediaIds = media.map(({ mediaId }) => mediaId);
    if (new Set(mediaIds).size !== mediaIds.length) {
      throw new ValidationError('Media cannot be attached', { field: 'media' });
    }
    if (mediaIds.length > 0) {
      if (!input.accountId) {
        throw new ValidationError('Media cannot be attached', { field: 'media' });
      }
      const attachableMedia = await tx
        .select({ id: Media.id })
        .from(Media)
        .where(
          and(
            inArray(Media.id, mediaIds),
            eq(Media.accountId, input.accountId),
            eq(Media.source, MediaSource.LOCAL),
            eq(Media.state, MediaState.READY),
          ),
        );
      if (attachableMedia.length !== mediaIds.length) {
        throw new ValidationError('Media cannot be attached', { field: 'media' });
      }
      for (const { altText, mediaId } of media) {
        await tx.update(Media).set({ altText }).where(eq(Media.id, mediaId));
      }
    }
  }

  if (input.replyParentId !== undefined) {
    const parent =
      input.origin === 'LOCAL'
        ? await findVisiblePost(tx, {
            actorProfileId: input.profileId,
            postId: input.replyParentId,
          })
        : await tx
            .select({
              currentContentId: Posts.currentContentId,
              id: Posts.id,
              profileId: Posts.profileId,
            })
            .from(Posts)
            .where(and(eq(Posts.id, input.replyParentId), eq(Posts.state, PostState.ACTIVE)))
            .limit(1)
            .then(first);
    if (!parent) {
      throw new NotFoundError('Post not found');
    }
    await assertProfilePairIsNotBlocked(tx, {
      notFoundMessage: 'Post not found',
      firstProfileId: input.profileId,
      secondProfileId: parent.profileId,
    });
    if (parent.currentContentId === null) {
      throw new ValidationError('Reply Parent must have content', {
        field: 'replyParentId',
      });
    }
  }

  if (input.origin === 'LOCAL' && input.repostSourceId !== undefined) {
    await validateQuoteSource(tx, {
      actorProfileId: input.profileId,
      postId: input.repostSourceId,
    });
  }

  const createdAt =
    input.origin === 'ACTIVITYPUB' &&
    input.publishedAt &&
    Temporal.Instant.compare(input.publishedAt, input.receivedAt) < 0
      ? input.publishedAt
      : input.origin === 'ACTIVITYPUB'
        ? input.receivedAt
        : undefined;
  if (input.origin === 'ACTIVITYPUB') {
    const media = await materializeRemoteMedia(tx, {
      candidates: input.media ?? [],
      profileId: input.profileId,
    });
    if (media.length > 0) {
      document = canonicalizePostContentDocument({
        ...document,
        body: {
          ...document.body,
          content: [
            ...document.body.content,
            ...media.map(({ mediaId }) => ({
              attrs: { mediaId },
              type: 'media' as const,
            })),
          ],
        },
      });
    }
  }

  const content = await tx
    .insert(PostContents)
    .values({
      id: initialContentId,
      createdAt: input.origin === 'ACTIVITYPUB' ? input.receivedAt : undefined,
      document,
      postId: null,
    })
    .returning()
    .then(firstOrThrow);

  if (postContentHashtagIds.length > 0) {
    await tx.insert(PostContentHashtags).values(
      postContentHashtagIds.map((hashtagId) => ({
        hashtagId,
        postContentId: content.id,
      })),
    );
  }

  const reserved =
    postId === undefined
      ? undefined
      : await tx.select({ id: Posts.id }).from(Posts).where(eq(Posts.id, postId)).then(first);
  const post =
    reserved === undefined
      ? await tx
          .insert(Posts)
          .values({
            id: postId,
            actorAccountId: input.origin === 'LOCAL' ? (input.accountId ?? null) : null,
            createdAt,
            currentContentId: content.id,
            profileId: input.profileId,
            repostSourceId: input.origin === 'LOCAL' ? (input.repostSourceId ?? null) : undefined,
            quoteConsentStatus:
              input.origin === 'LOCAL' && input.repostSourceId !== undefined
                ? PostQuoteConsentStatus.APPROVED
                : undefined,
            state: PostState.ACTIVE,
            visibility: input.visibility,
          })
          .returning()
          .then(firstOrThrow)
      : await tx
          .update(Posts)
          .set({
            currentContentId: content.id,
            ...(createdAt === undefined ? {} : { createdAt }),
            quoteConsentStatus:
              input.origin === 'LOCAL' && input.repostSourceId !== undefined
                ? PostQuoteConsentStatus.APPROVED
                : null,
            repostSourceId: input.origin === 'LOCAL' ? (input.repostSourceId ?? null) : null,
          })
          .where(eq(Posts.id, reserved.id))
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

  if (mentionProfileIds.size > 0) {
    await tx.insert(PostMentions).values(
      [...mentionProfileIds].map((profileId) => ({
        postContentId: content.id,
        profileId,
      })),
    );
  }

  validatePostStructure({
    currentContentId: post.currentContentId,
    id: post.id,
    replyParentId: input.replyParentId ?? null,
    repostSourceId: post.repostSourceId,
  });

  const linkedPost =
    input.replyParentId === undefined
      ? post
      : await tx
          .update(Posts)
          .set({ replyParentId: input.replyParentId })
          .where(eq(Posts.id, post.id))
          .returning()
          .then(firstOrThrow);
  const linkedContent = await tx
    .update(PostContents)
    .set({ postId: post.id })
    .where(eq(PostContents.id, content.id))
    .returning()
    .then(firstOrThrow);

  return { content: linkedContent, created: true, post: linkedPost };
};

export function createPostPersisted(
  input: LocalPostInput | LegacyLocalPostInput,
  postId?: string,
  handle?: DatabaseHandle,
  initialContentId?: string,
): Promise<CreatedPost>;
export function createPostPersisted(
  input: ActivityPubPostInput,
  postId?: string,
  handle?: DatabaseHandle,
  initialContentId?: string,
): Promise<CreatedPost | DuplicatePost>;
export function createPostPersisted(
  input: PostCreateInput | LegacyLocalPostInput,
  postId?: string,
  handle?: DatabaseHandle,
  initialContentId?: string,
): Promise<CreatedPost | DuplicatePost>;
export async function createPostPersisted(
  input: PostCreateInput | LegacyLocalPostInput,
  postId?: string,
  handle?: DatabaseHandle,
  initialContentId?: string,
): Promise<CreatedPost | DuplicatePost> {
  try {
    return await getDatabaseConnection(handle).transaction(async (tx) => {
      if (postId) {
        const existing = await tx.select().from(Posts).where(eq(Posts.id, postId)).then(first);
        if (existing) {
          if (initialContentId && existing.currentContentId !== initialContentId) {
            throw new ValidationError(
              'Quote admission payload does not match its original submission',
              { field: 'admissionId' },
            );
          }
          if (existing.profileId !== input.profileId || !existing.currentContentId) {
            throw new PermissionDeniedError('Post create identity does not match');
          }
          const content = await tx
            .select()
            .from(PostContents)
            .where(eq(PostContents.id, existing.currentContentId))
            .then(firstOrThrow);
          return { created: true as const, post: existing, content };
        }
      }
      return createPostInTransaction(tx, input, postId, initialContentId);
    });
  } catch (error) {
    if (input.origin !== 'ACTIVITYPUB' || !isActivityPubPostUriConflict(error)) {
      throw error;
    }
    return { created: false };
  }
}

export function createPost(input: LocalPostInput | LegacyLocalPostInput): Promise<CreatedPost>;
export function createPost(input: ActivityPubPostInput): Promise<CreatedPost | DuplicatePost>;
export async function createPost(
  input: LocalPostInput | LegacyLocalPostInput | ActivityPubPostInput,
): Promise<CreatedPost | DuplicatePost> {
  if (
    input.origin === 'LOCAL' &&
    input.repostSourceId === undefined &&
    input.admissionId !== undefined
  ) {
    throw new ValidationError('Quote admission requires its original Source', {
      field: 'admissionId',
    });
  }
  if (input.origin === 'LOCAL' && input.repostSourceId !== undefined) {
    const admission = /^(\d{13}):(.+)$/.exec(input.admissionId ?? '');
    if (!admission || !z.uuid().safeParse(admission[2]).success) {
      throw new ValidationError('Quote creation requires its original admission identity', {
        field: 'admissionId',
      });
    }
    const issuedAt = Number(admission[1]);
    // Only recent first submissions may start. Older attempts can recover retained results,
    // but missing history (including a later retention increase) must never create a new Post.
    const firstStartWindow = 5 * 60_000;
    if (issuedAt > Date.now() + 30_000) {
      throw new ValidationError('Quote admission timestamp is in the future', {
        field: 'admissionId',
      });
    }
    const command = quotePostCreateInput(input);

    const updateId = createHash('sha256').update(postCreateInputKey(command)).digest('hex');
    const recover = () =>
      runWorkflow(postCreateWorkflow, {
        args: [command],
        updateId,
        mode: 'update-result',
      });
    let postId: string;
    try {
      let outcome: Awaited<ReturnType<typeof recover>>;
      try {
        // Closed Runs cannot receive a new Update-with-Start, but their Update results remain readable.
        outcome = await recover();
      } catch (error) {
        if (!(error instanceof WorkflowNotFoundError)) {
          throw error;
        }
        if (Date.now() - issuedAt > firstStartWindow) {
          throw new ValidationError(
            'Quote admission expired; its result cannot be safely recreated',
            {
              field: 'admissionId',
            },
          );
        }
        try {
          outcome = await runWorkflow(postCreateWorkflow, {
            args: [command],
            updateArgs: [command],
            // A different payload must reach validation rather than replay a cached Update result.
            updateId,
            mode: 'update-with-start',
            workflowIdConflictPolicy: 'USE_EXISTING',
            workflowIdReusePolicy: 'REJECT_DUPLICATE',
          });
        } catch (startError) {
          if (!(startError instanceof WorkflowExecutionAlreadyStartedError)) {
            throw startError;
          }
          // Another caller may have started and completed between the lookup and start.
          outcome = await recover();
        }
      }
      ({ postId } = unwrapPostTransition(outcome));
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        throw new ValidationError(
          'Quote admission payload does not match its original submission',
          {
            field: 'admissionId',
          },
        );
      }
      throw error;
    }
    const post = await db.select().from(Posts).where(eq(Posts.id, postId)).then(firstOrThrow);
    const content = await db
      .select()
      .from(PostContents)
      .where(eq(PostContents.id, post.currentContentId!))
      .then(firstOrThrow);
    return { created: true, post, content };
  }
  const result = await createPostPersisted(input);
  if (!result.created) {
    return result;
  }
  try {
    const workflowInput = { postId: result.post.id, origin: input.origin };
    await temporalClient.withDeadline(Date.now() + 5_000, () =>
      temporalClient.workflow.start('postCreateEffectsWorkflow', {
        args: [workflowInput],
        taskQueue: KOSMO_TASK_QUEUE,
        workflowId: `post-create-effects:${workflowInput.postId}`,
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'REJECT_DUPLICATE',
      }),
    );
  } catch (error) {
    console.error('Post Create effects Workflow start failed', {
      error,
      origin: input.origin,
      postId: result.post.id,
    });
  }

  return { content: result.content, created: true, post: result.post };
}
