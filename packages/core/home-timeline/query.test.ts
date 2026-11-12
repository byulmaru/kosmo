import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { and, eq, inArray, or } from 'drizzle-orm';
import {
  db,
  firstOrThrow,
  Instances,
  pg,
  PostContents,
  PostMentions,
  Posts,
  ProfileBlocks,
  ProfileFollows,
  ProfileMutes,
  Profiles,
} from '../db';
import {
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { postContentDocumentFromText } from '../post-content/server';
import { queryHomeTimeline } from './query';

after(async () => pg.end());

test('Home query applies selected Profile candidate, mention, access, block, mute, and repost rules', async () => {
  const profileIds: string[] = [];
  const instanceIds: string[] = [];
  const postIds: string[] = [];
  const contentIds: string[] = [];

  const createProfile = async ({
    profileState = ProfileState.ACTIVE,
    instanceState = InstanceState.ACTIVE,
  }: {
    readonly profileState?: ProfileState;
    readonly instanceState?: InstanceState;
  } = {}) => {
    const suffix = crypto.randomUUID();
    const instance = await db
      .insert(Instances)
      .values({
        domain: `${suffix}.example`,
        kind: InstanceKind.LOCAL,
        state: instanceState,
      })
      .returning()
      .then(firstOrThrow);
    instanceIds.push(instance.id);

    const profile = await db
      .insert(Profiles)
      .values({
        displayName: suffix,
        followPolicy: ProfileFollowPolicy.OPEN,
        handle: suffix,
        instanceId: instance.id,
        normalizedHandle: suffix,
        state: profileState,
      })
      .returning()
      .then(firstOrThrow);
    profileIds.push(profile.id);
    return profile;
  };

  const createPost = async ({
    authorProfileId,
    bodyText,
    visibility = PostVisibility.PUBLIC,
    state = PostState.ACTIVE,
    replyParentId = null,
    repostSourceId = null,
    mentions = [],
  }: {
    readonly authorProfileId: string;
    readonly bodyText?: string;
    readonly visibility?: PostVisibility;
    readonly state?: PostState;
    readonly replyParentId?: string | null;
    readonly repostSourceId?: string | null;
    readonly mentions?: readonly string[];
  }) => {
    const post = await db
      .insert(Posts)
      .values({ profileId: authorProfileId, state, visibility, replyParentId, repostSourceId })
      .returning()
      .then(firstOrThrow);
    postIds.push(post.id);

    if (bodyText === undefined) {
      return post;
    }

    const content = await db
      .insert(PostContents)
      .values({ postId: post.id, document: postContentDocumentFromText(bodyText) })
      .returning()
      .then(firstOrThrow);
    contentIds.push(content.id);
    await db.update(Posts).set({ currentContentId: content.id }).where(eq(Posts.id, post.id));
    if (mentions.length > 0) {
      await db.insert(PostMentions).values(
        mentions.map((profileId) => ({
          postContentId: content.id,
          profileId,
        })),
      );
    }
    return post;
  };

  const follow = async (followerProfileId: string, followeeProfileId: string) => {
    await db.insert(ProfileFollows).values({ followerProfileId, followeeProfileId });
  };

  const viewer = await createProfile();
  const followedAuthor = await createProfile();
  const followedParentAuthor = await createProfile();
  const followedMentionTarget = await createProfile();
  const outsider = await createProfile();
  const mutedAuthor = await createProfile();
  const mutedSourceAuthor = await createProfile();
  const blockedAuthor = await createProfile();
  const viewerBlockedAuthor = await createProfile();
  const suspendedAuthor = await createProfile({ instanceState: InstanceState.SUSPENDED });

  await Promise.all([
    follow(viewer.id, followedAuthor.id),
    follow(viewer.id, followedParentAuthor.id),
    follow(viewer.id, followedMentionTarget.id),
    follow(viewer.id, mutedAuthor.id),
    follow(viewer.id, blockedAuthor.id),
    follow(viewer.id, viewerBlockedAuthor.id),
    follow(viewer.id, suspendedAuthor.id),
  ]);
  await db.insert(ProfileBlocks).values([
    { ownerProfileId: viewer.id, targetProfileId: blockedAuthor.id },
    { ownerProfileId: viewerBlockedAuthor.id, targetProfileId: viewer.id },
  ]);
  await db.insert(ProfileMutes).values([
    { ownerProfileId: viewer.id, targetProfileId: mutedAuthor.id },
    { ownerProfileId: viewer.id, targetProfileId: mutedSourceAuthor.id },
  ]);

  try {
    const ownPost = await createPost({ authorProfileId: viewer.id, bodyText: 'own post' });
    const ownReply = await createPost({
      authorProfileId: outsider.id,
      bodyText: 'reply to viewer',
      replyParentId: ownPost.id,
    });
    const followedRoot = await createPost({
      authorProfileId: followedAuthor.id,
      bodyText: 'followed root',
    });
    const followerOnlyRoot = await createPost({
      authorProfileId: followedAuthor.id,
      bodyText: 'follower only root',
      visibility: PostVisibility.FOLLOWERS,
    });
    const directMention = await createPost({
      authorProfileId: followedAuthor.id,
      bodyText: 'direct mention',
      visibility: PostVisibility.DIRECT,
      mentions: [viewer.id],
    });
    const followerOnlyOutsider = await createPost({
      authorProfileId: outsider.id,
      bodyText: 'private to another profile',
      visibility: PostVisibility.FOLLOWERS,
      replyParentId: ownPost.id,
    });
    const outsiderRoot = await createPost({
      authorProfileId: outsider.id,
      bodyText: 'not followed',
    });
    const parent = await createPost({
      authorProfileId: followedParentAuthor.id,
      bodyText: 'followed parent',
    });
    const noMentionReply = await createPost({
      authorProfileId: followedAuthor.id,
      bodyText: 'reply with no mentions',
      replyParentId: parent.id,
    });
    const viewerMentionReply = await createPost({
      authorProfileId: followedAuthor.id,
      bodyText: 'reply that mentions viewer',
      replyParentId: parent.id,
      mentions: [viewer.id],
    });
    const followedMentionReply = await createPost({
      authorProfileId: followedAuthor.id,
      bodyText: 'reply that mentions a followee',
      replyParentId: parent.id,
      mentions: [followedMentionTarget.id],
    });
    const hiddenMentionReply = await createPost({
      authorProfileId: followedAuthor.id,
      bodyText: 'reply that mentions an unseen profile',
      replyParentId: parent.id,
      mentions: [outsider.id],
    });
    const mutedRoot = await createPost({
      authorProfileId: mutedAuthor.id,
      bodyText: 'muted author',
    });
    const blockedRoot = await createPost({
      authorProfileId: blockedAuthor.id,
      bodyText: 'viewer blocked author',
    });
    const blocksViewerRoot = await createPost({
      authorProfileId: viewerBlockedAuthor.id,
      bodyText: 'author blocked viewer',
    });
    const suspendedRoot = await createPost({
      authorProfileId: suspendedAuthor.id,
      bodyText: 'suspended author',
    });
    const deletedRoot = await createPost({
      authorProfileId: followedAuthor.id,
      bodyText: 'deleted post',
      state: PostState.DELETED,
    });
    const visibleSource = await createPost({
      authorProfileId: outsider.id,
      bodyText: 'visible repost source',
    });
    const allowedRepost = await createPost({
      authorProfileId: followedAuthor.id,
      repostSourceId: visibleSource.id,
    });
    const mutedSource = await createPost({
      authorProfileId: mutedSourceAuthor.id,
      bodyText: 'muted repost source',
    });
    const mutedSourceRepost = await createPost({
      authorProfileId: followedAuthor.id,
      repostSourceId: mutedSource.id,
    });
    const directSource = await createPost({
      authorProfileId: outsider.id,
      bodyText: 'unmentioned direct source',
      visibility: PostVisibility.DIRECT,
    });
    const hiddenSourceRepost = await createPost({
      authorProfileId: followedAuthor.id,
      repostSourceId: directSource.id,
    });

    const results = await queryHomeTimeline({ profileId: viewer.id, limit: 100 });
    const visiblePostIds = new Set(results.map(({ id }) => id));
    assert.deepEqual(
      visiblePostIds,
      new Set([
        ownPost.id,
        ownReply.id,
        followedRoot.id,
        followerOnlyRoot.id,
        directMention.id,
        parent.id,
        noMentionReply.id,
        viewerMentionReply.id,
        followedMentionReply.id,
        allowedRepost.id,
      ]),
    );
    for (const excludedPost of [
      followerOnlyOutsider,
      outsiderRoot,
      hiddenMentionReply,
      mutedRoot,
      blockedRoot,
      blocksViewerRoot,
      suspendedRoot,
      deletedRoot,
      mutedSourceRepost,
      hiddenSourceRepost,
    ]) {
      assert.equal(visiblePostIds.has(excludedPost.id), false, excludedPost.id);
    }

    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, viewer.id));
    assert.equal(
      await db
        .select({ id: ProfileFollows.id })
        .from(ProfileFollows)
        .where(
          and(
            eq(ProfileFollows.followerProfileId, viewer.id),
            eq(ProfileFollows.followeeProfileId, followedAuthor.id),
          ),
        )
        .then((follows) => follows.length),
      1,
    );
    assert.deepEqual(await queryHomeTimeline({ profileId: viewer.id, limit: 100 }), []);
  } finally {
    if (postIds.length > 0) {
      await db
        .update(Posts)
        .set({ currentContentId: null, replyParentId: null, repostSourceId: null })
        .where(inArray(Posts.id, postIds));
    }
    if (contentIds.length > 0) {
      await db
        .update(PostContents)
        .set({ postId: null })
        .where(inArray(PostContents.id, contentIds));
    }
    if (postIds.length > 0) {
      await db.delete(Posts).where(inArray(Posts.id, postIds));
    }
    if (contentIds.length > 0) {
      await db.delete(PostContents).where(inArray(PostContents.id, contentIds));
    }
    if (profileIds.length > 0) {
      await db
        .delete(ProfileFollows)
        .where(
          or(
            inArray(ProfileFollows.followerProfileId, profileIds),
            inArray(ProfileFollows.followeeProfileId, profileIds),
          ),
        );
    }
    if (profileIds.length > 0) {
      await db.delete(Profiles).where(inArray(Profiles.id, profileIds));
    }
    if (instanceIds.length > 0) {
      await db.delete(Instances).where(inArray(Instances.id, instanceIds));
    }
  }
});
