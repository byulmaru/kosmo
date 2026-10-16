import '@kosmo/core/polyfill';

import {
  ActivityPubActors,
  db,
  Hashtags,
  Instances,
  Media,
  pg,
  PostContents,
  Posts,
  ProfileHashtags,
  ProfileMedia,
  Profiles,
} from '@kosmo/core/db';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileMediaKind,
  ProfileState,
} from '@kosmo/core/enums';
import { postContentDocumentFromTextAndMedia } from '@kosmo/core/post-content/server';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { load as loadProfile } from '../../routes/profiles/[id]/+page.server';
import { load as loadProfilePosts } from '../../routes/profiles/[id]/posts/+page.server';
import { load as loadProfiles } from '../../routes/profiles/+page.server';
import { getProfile, getProfileSummary, listProfilePosts, listProfiles } from './profiles';

const profileIds = Array.from(
  { length: 55 },
  (_, index) => `dddddddd-dddd-7000-8000-${String(index + 1).padStart(12, '0')}`,
);
const paginationProfileIds = Array.from({ length: 51 }, (_, index) => profileIds[index]!);
const targetProfileId = profileIds[51]!;
const disabledProfileId = profileIds[52]!;
const suspendedProfileId = profileIds[53]!;
const sourceProfileId = profileIds[54]!;

const localInstanceId = 'eeeeeeee-eeee-7000-8000-000000000001';
const remoteInstanceId = 'eeeeeeee-eeee-7000-8000-000000000002';
const sourcePostId = '99999999-9999-7000-8000-000000000001';
const targetPostIds = Array.from(
  { length: 8 },
  (_, index) => `cccccccc-cccc-7000-8000-${String(index + 1).padStart(12, '0')}`,
);
const paginationPostIds = Array.from(
  { length: 54 },
  (_, index) => `bbbbbbbb-bbbb-7000-8000-${String(index + 1).padStart(12, '0')}`,
);
const disabledAuthorPostId = '99999999-9999-7000-8000-000000000002';
const allPostIds = [sourcePostId, ...targetPostIds, ...paginationPostIds, disabledAuthorPostId];
const token = 'admin-profile-read';
const contentIds: string[] = [];
const hashtagIds: string[] = [];
const postedAt = (minute: number) =>
  Temporal.Instant.fromEpochMilliseconds(Date.parse('2026-01-01T00:00:00Z') + minute * 60_000);

const makeProfile = ({
  id,
  handle,
  displayName,
  instanceId = localInstanceId,
  state = ProfileState.ACTIVE,
  followersCount = 12,
  followingCount = 34,
}: {
  id: string;
  handle: string;
  displayName: string;
  instanceId?: string;
  state?: ProfileState;
  followersCount?: number;
  followingCount?: number;
}) => ({
  id,
  instanceId,
  state,
  handle,
  normalizedHandle: handle,
  displayName,
  bio: `${displayName} bio`,
  followPolicy: ProfileFollowPolicy.OPEN,
  followersCount,
  followingCount,
});

const makePost = ({
  id,
  profileId,
  visibility = PostVisibility.PUBLIC,
  state = PostState.ACTIVE,
  createdAt,
  replyParentId = null,
  repostSourceId = null,
}: {
  id: string;
  profileId: string;
  visibility?: PostVisibility;
  state?: PostState;
  createdAt: Temporal.Instant;
  replyParentId?: string | null;
  repostSourceId?: string | null;
}) => ({
  id,
  profileId,
  visibility,
  state,
  createdAt,
  replyParentId,
  repostSourceId,
});

const addPostContent = async (
  postId: string,
  document: ReturnType<typeof postContentDocumentFromTextAndMedia>,
) => {
  const content = await db
    .insert(PostContents)
    .values({ postId, document })
    .returning({ id: PostContents.id })
    .then((rows) => rows[0]!);
  contentIds.push(content.id);
  await db.update(Posts).set({ currentContentId: content.id }).where(eq(Posts.id, postId));
};

describe('Admin Profile read projections', () => {
  beforeAll(async () => {
    await db.insert(Instances).values([
      {
        id: localInstanceId,
        domain: `local-${token}.example`,
        kind: InstanceKind.LOCAL,
        state: InstanceState.ACTIVE,
      },
      {
        id: remoteInstanceId,
        domain: `remote-${token}.example`,
        kind: InstanceKind.ACTIVITYPUB,
        state: InstanceState.ACTIVE,
      },
    ]);

    await db.insert(Profiles).values([
      ...paginationProfileIds.map((id, index) =>
        makeProfile({
          id,
          handle: `pagination-${token}-${index + 1}`,
          displayName: `Profile ${index + 1}`,
          followersCount: index,
          followingCount: index + 1,
        }),
      ),
      makeProfile({
        id: targetProfileId,
        handle: `state-group-${token}-active`,
        displayName: `Profile ${token}`,
      }),
      makeProfile({
        id: disabledProfileId,
        handle: `state-group-${token}-disabled`,
        displayName: `Disabled ${token}`,
        state: ProfileState.DISABLED,
      }),
      makeProfile({
        id: suspendedProfileId,
        handle: `state-group-${token}-remote-suspended`,
        displayName: `display-name-only-${token}`,
        instanceId: remoteInstanceId,
        state: ProfileState.SUSPENDED,
      }),
      makeProfile({
        id: sourceProfileId,
        handle: `source-${token}`,
        displayName: `Source ${token}`,
      }),
    ]);

    await db.insert(ActivityPubActors).values([
      {
        profileId: targetProfileId,
        uri: `https://local-${token}.example/@state-group-${token}-active`,
        profileUrl: `https://local-${token}.example/@state-group-${token}-active`,
        type: ActivityPubActorType.PERSON,
      },
      {
        profileId: suspendedProfileId,
        uri: `https://remote-${token}.example/users/suspended`,
        profileUrl: null,
        type: ActivityPubActorType.PERSON,
      },
    ]);

    const mediaRows = await db
      .insert(Media)
      .values([
        {
          source: MediaSource.REMOTE,
          state: MediaState.READY,
          profileId: targetProfileId,
          mediaType: 'image/jpeg',
          url: `https://media.example/${token}-avatar.jpg`,
        },
        {
          source: MediaSource.REMOTE,
          state: MediaState.READY,
          profileId: targetProfileId,
          mediaType: 'image/jpeg',
          url: `https://media.example/${token}-header.jpg`,
        },
      ])
      .returning({ id: Media.id });

    await db.insert(ProfileMedia).values([
      { profileId: targetProfileId, mediaId: mediaRows[0]!.id, kind: ProfileMediaKind.AVATAR },
      { profileId: targetProfileId, mediaId: mediaRows[1]!.id, kind: ProfileMediaKind.HEADER },
    ]);

    const hashtagRows = await db
      .insert(Hashtags)
      .values([
        { name: `${token}-alpha`, displayName: 'Alpha' },
        { name: `${token}-zebra`, displayName: 'Zebra' },
      ])
      .returning({ id: Hashtags.id, name: Hashtags.name });
    hashtagIds.push(...hashtagRows.map(({ id }) => id));
    await db
      .insert(ProfileHashtags)
      .values(hashtagRows.map(({ id }) => ({ profileId: targetProfileId, hashtagId: id })));

    await db.insert(Posts).values([
      makePost({
        id: sourcePostId,
        profileId: sourceProfileId,
        createdAt: postedAt(0),
      }),
      makePost({
        id: disabledAuthorPostId,
        profileId: disabledProfileId,
        createdAt: postedAt(1),
      }),
      ...targetPostIds.map((id, index) =>
        makePost({
          id,
          profileId: targetProfileId,
          createdAt: postedAt(index + 10),
          visibility:
            index === 1 || index === 4
              ? PostVisibility.UNLISTED
              : index === 5
                ? PostVisibility.FOLLOWERS
                : index === 6
                  ? PostVisibility.DIRECT
                  : PostVisibility.PUBLIC,
          state: index === 7 ? PostState.DELETED : PostState.ACTIVE,
          replyParentId: index === 1 || index === 4 ? sourcePostId : null,
          repostSourceId: index === 3 ? sourcePostId : null,
        }),
      ),
      ...paginationPostIds.slice(0, 51).map((id, index) =>
        makePost({
          id,
          profileId: paginationProfileIds[0]!,
          createdAt: postedAt(index + 100),
        }),
      ),
      makePost({
        id: paginationPostIds[51]!,
        profileId: paginationProfileIds[0]!,
        visibility: PostVisibility.FOLLOWERS,
        createdAt: postedAt(200),
      }),
      makePost({
        id: paginationPostIds[52]!,
        profileId: paginationProfileIds[0]!,
        visibility: PostVisibility.DIRECT,
        createdAt: postedAt(201),
      }),
      makePost({
        id: paginationPostIds[53]!,
        profileId: paginationProfileIds[0]!,
        state: PostState.DELETED,
        createdAt: postedAt(202),
      }),
    ]);

    const contentEntries = [
      {
        postId: sourcePostId,
        text: 'source-only-secret',
      },
      {
        postId: disabledAuthorPostId,
        text: 'disabled author remains visible',
      },
      ...targetPostIds.slice(0, 3).map((postId, index) => ({
        postId,
        text: `target-content-${index + 1}`,
      })),
      {
        postId: targetPostIds[4]!,
        text: 'target reply and quote content',
      },
      {
        postId: targetPostIds[5]!,
        text: 'followers-only-secret',
      },
      {
        postId: targetPostIds[6]!,
        text: 'direct-secret',
      },
      {
        postId: targetPostIds[7]!,
        text: 'deleted-secret',
      },
      ...paginationPostIds.map((postId, index) => ({
        postId,
        text: `page-content-${index + 1}`,
      })),
    ];

    for (const { postId, text } of contentEntries) {
      const document = postContentDocumentFromTextAndMedia(
        text,
        postId === targetPostIds[0]
          ? [
              { mediaId: '10000000-0000-7000-8000-000000000001' },
              { mediaId: '10000000-0000-7000-8000-000000000002' },
            ]
          : [],
        postId === targetPostIds[0],
        postId === targetPostIds[0] ? 'target summary' : null,
      );
      await addPostContent(postId, document);
    }
    await db
      .update(Posts)
      .set({ repostSourceId: sourcePostId })
      .where(inArray(Posts.id, [targetPostIds[2]!, targetPostIds[4]!]));
  });

  afterAll(async () => {
    await db
      .update(Posts)
      .set({ currentContentId: null, replyParentId: null, repostSourceId: null })
      .where(inArray(Posts.id, allPostIds));
    await db
      .update(PostContents)
      .set({ postId: null })
      .where(inArray(PostContents.postId, allPostIds));
    await db.delete(Posts).where(inArray(Posts.id, allPostIds));
    await db.delete(PostContents).where(inArray(PostContents.id, contentIds));
    await db.delete(ProfileHashtags).where(eq(ProfileHashtags.profileId, targetProfileId));
    await db.delete(Hashtags).where(inArray(Hashtags.id, hashtagIds));
    await db.delete(ProfileMedia).where(eq(ProfileMedia.profileId, targetProfileId));
    await db.delete(Media).where(inArray(Media.profileId, profileIds));
    await db.delete(Profiles).where(inArray(Profiles.id, profileIds));
    await db.delete(Instances).where(inArray(Instances.id, [localInstanceId, remoteInstanceId]));
    await pg.end();
  });

  test('filters Profiles and paginates after filtering in either direction', async () => {
    const filters = {
      q: `pagination-${token}`,
      origin: 'LOCAL' as const,
      state: 'ACTIVE' as const,
    };
    const firstPage = await listProfiles(filters);

    expect(firstPage.profiles).toHaveLength(50);
    expect(firstPage.profiles.map(({ id }) => id)).toEqual(
      paginationProfileIds.slice().reverse().slice(0, 50),
    );
    expect(firstPage.nextCursor).toBe(paginationProfileIds[1]);
    expect(firstPage.previousCursor).toBeNull();
    expect(firstPage.profiles[0]).toMatchObject({
      relativeHandle: `@pagination-${token}-51`,
      origin: 'LOCAL',
      state: 'ACTIVE',
      followersCount: 50,
      followingCount: 51,
    });
    expect(firstPage.profiles[0]).not.toHaveProperty('bio');
    const secondPage = await listProfiles({ ...filters, cursor: firstPage.nextCursor! });
    expect(secondPage.profiles.map(({ id }) => id)).toEqual([paginationProfileIds[0]]);
    expect(secondPage.profiles[0]).toMatchObject({
      postCount: 51,
      lastPostedAt: postedAt(150).toString(),
    });
    expect(secondPage.previousCursor).toBe(paginationProfileIds[0]);
    expect(secondPage.nextCursor).toBeNull();

    const previousPage = await listProfiles({
      ...filters,
      cursor: secondPage.previousCursor!,
      direction: 'previous',
    });
    expect(previousPage.profiles.map(({ id }) => id)).toEqual(
      paginationProfileIds.slice().reverse().slice(0, 50),
    );
    expect(previousPage.previousCursor).toBeNull();
    expect(previousPage.nextCursor).toBe(paginationProfileIds[1]);

    const allStates = await listProfiles({ q: `state-group-${token}` });
    expect(allStates.profiles.map(({ state }) => state).sort()).toEqual([
      'ACTIVE',
      'DISABLED',
      'SUSPENDED',
    ]);
    expect(allStates.profiles.map(({ origin }) => origin).sort()).toEqual([
      'LOCAL',
      'LOCAL',
      'REMOTE',
    ]);
    const displayNameMatch = await listProfiles({ q: `display-name-only-${token}` });
    expect(displayNameMatch.profiles.map(({ id }) => id)).toEqual([suspendedProfileId]);
    const remoteOnly = await listProfiles({ origin: 'REMOTE', state: 'SUSPENDED', q: token });
    expect(remoteOnly.profiles.map(({ id }) => id)).toEqual([suspendedProfileId]);

    const localProfiles = await loadProfiles({
      url: new URL(`http://admin.test/profiles?q=state-group-${token}&origin=LOCAL`),
    } as Parameters<typeof loadProfiles>[0]);
    if (!localProfiles) {
      throw new Error('Expected filtered Profile list loader data');
    }
    expect(localProfiles.profiles.map(({ id }: { id: string }) => id)).toEqual([
      disabledProfileId,
      targetProfileId,
    ]);
    expect(localProfiles.filters).toEqual({
      q: `state-group-${token}`,
      origin: 'LOCAL',
      state: '',
    });

    const activeProfiles = await loadProfiles({
      url: new URL(`http://admin.test/profiles?q=state-group-${token}&state=ACTIVE`),
    } as Parameters<typeof loadProfiles>[0]);
    if (!activeProfiles) {
      throw new Error('Expected filtered Profile list loader data');
    }
    expect(activeProfiles.profiles.map(({ id }: { id: string }) => id)).toEqual([targetProfileId]);
    expect(activeProfiles.filters).toEqual({
      q: `state-group-${token}`,
      origin: '',
      state: 'ACTIVE',
    });

    const loaded = await loadProfiles({
      url: new URL(`http://admin.test/profiles?q=${filters.q}&origin=LOCAL&state=ACTIVE`),
    } as Parameters<typeof loadProfiles>[0]);
    if (!loaded) {
      throw new Error('Expected Profile list loader data');
    }
    expect(loaded.profiles).toEqual(firstPage.profiles);
    expect(loaded.filters).toEqual(filters);

    const loadedNextPage = await loadProfiles({
      url: new URL(
        `http://admin.test/profiles?q=${filters.q}&origin=LOCAL&state=ACTIVE&cursor=${paginationProfileIds[1]}`,
      ),
    } as Parameters<typeof loadProfiles>[0]);
    if (!loadedNextPage) {
      throw new Error('Expected next Profile list loader data');
    }
    expect(loadedNextPage.profiles.map(({ id }: { id: string }) => id)).toEqual([
      paginationProfileIds[0],
    ]);
    expect(loadedNextPage.previousCursor).toBe(paginationProfileIds[0]);
    expect(loadedNextPage.nextCursor).toBeNull();
    expect(loadedNextPage.filters).toEqual(filters);

    const loadedPreviousPage = await loadProfiles({
      url: new URL(
        `http://admin.test/profiles?q=${filters.q}&origin=LOCAL&state=ACTIVE&cursor=${paginationProfileIds[0]}&direction=previous`,
      ),
    } as Parameters<typeof loadProfiles>[0]);
    if (!loadedPreviousPage) {
      throw new Error('Expected previous Profile list loader data');
    }
    expect(loadedPreviousPage.profiles.map(({ id }: { id: string }) => id)).toEqual(
      paginationProfileIds.slice().reverse().slice(0, 50),
    );
    expect(loadedPreviousPage.previousCursor).toBeNull();
    expect(loadedPreviousPage.nextCursor).toBe(paginationProfileIds[1]);
    expect(loadedPreviousPage.filters).toEqual(filters);
  });

  test('returns Profile detail fields and uses only stored remote actor URLs', async () => {
    const local = await getProfile(targetProfileId);
    expect(local).toMatchObject({
      id: targetProfileId,
      handle: `state-group-${token}-active`,
      relativeHandle: `@state-group-${token}-active`,
      qualifiedHandle: `@state-group-${token}-active@local-${token}.example`,
      origin: 'LOCAL',
      state: 'ACTIVE',
      bio: `Profile ${token} bio`,
      followersCount: 12,
      followingCount: 34,
      avatarUrl: `https://media.example/${token}-avatar.jpg`,
      headerUrl: `https://media.example/${token}-header.jpg`,
      remoteUrl: null,
      tags: [`${token}-alpha`, `${token}-zebra`],
      instanceDomain: `local-${token}.example`,
      createdAt: expect.any(String),
      postCount: 5,
    });

    const remote = await getProfile(suspendedProfileId);
    expect(remote).toMatchObject({
      id: suspendedProfileId,
      relativeHandle: `@state-group-${token}-remote-suspended@remote-${token}.example`,
      qualifiedHandle: `@state-group-${token}-remote-suspended@remote-${token}.example`,
      origin: 'REMOTE',
      state: 'SUSPENDED',
      remoteUrl: `https://remote-${token}.example/users/suspended`,
    });
    expect(remote).not.toHaveProperty('privateKey');

    const loaded = await loadProfile({
      params: { id: targetProfileId },
    } as Parameters<typeof loadProfile>[0]);
    if (!loaded) {
      throw new Error('Expected Profile detail loader data');
    }
    expect(loaded.profile).toMatchObject({ id: targetProfileId, postCount: 5 });
    await expect(
      loadProfile({
        params: { id: '00000000-0000-7000-8000-000000000000' },
      } as Parameters<typeof loadProfile>[0]),
    ).rejects.toMatchObject({ status: 404, body: { message: 'Not Found' } });
  });

  test('returns only eligible Posts with their own content and all Post kinds', async () => {
    const page = await listProfilePosts(targetProfileId);

    expect(page.posts).toHaveLength(5);
    expect(page.posts.map(({ id }) => id)).toEqual(targetPostIds.slice(0, 5).slice().reverse());
    expect(new Set(page.posts.map(({ kind }) => kind))).toEqual(
      new Set(['POST', 'REPLY', 'QUOTE', 'REPLY_QUOTE', 'REPOST']),
    );
    expect(page.posts[0]).toEqual({
      id: targetPostIds[4],
      visibility: 'UNLISTED',
      createdAt: postedAt(14).toString(),
      kind: 'REPLY_QUOTE',
      bodyText: 'target reply and quote content',
      summary: null,
      sensitive: false,
      mediaCount: 0,
    });
    const ownPost = page.posts.find(({ id }) => id === targetPostIds[0]);
    expect(ownPost).toMatchObject({
      bodyText: 'target-content-1',
      summary: 'target summary',
      sensitive: true,
      mediaCount: 2,
    });
    expect(page.posts.every(({ bodyText }) => !bodyText.includes('source-only-secret'))).toBe(true);
    expect(page.posts.every((post) => !('replyParentId' in post))).toBe(true);
    expect(page.posts.every((post) => !('repostSourceId' in post))).toBe(true);
    expect(page.previousCursor).toBeNull();
    expect(page.nextCursor).toBeNull();

    const profile = await getProfile(targetProfileId);
    expect(profile?.postCount).toBe(page.posts.length);
    expect(profile?.lastPostedAt).toBe(postedAt(14).toString());

    const disabledAuthorPosts = await listProfilePosts(disabledProfileId);
    expect(disabledAuthorPosts.posts).toMatchObject([
      { id: disabledAuthorPostId, bodyText: 'disabled author remains visible' },
    ]);

    const loaded = await loadProfilePosts({
      params: { id: targetProfileId },
      url: new URL(`http://admin.test/profiles/${targetProfileId}/posts`),
    } as Parameters<typeof loadProfilePosts>[0]);
    if (!loaded) {
      throw new Error('Expected Profile Posts loader data');
    }
    expect(loaded.posts).toEqual(page.posts);
    const profileSummary = await getProfileSummary(targetProfileId);
    expect(profileSummary).toEqual({
      id: targetProfileId,
      displayName: `Profile ${token}`,
      relativeHandle: `@state-group-${token}-active`,
    });
    expect(loaded.profile).toEqual(profileSummary);
    await expect(
      loadProfilePosts({
        params: { id: '00000000-0000-7000-8000-000000000000' },
        url: new URL('http://admin.test/profiles/00000000-0000-7000-8000-000000000000/posts'),
      } as Parameters<typeof loadProfilePosts>[0]),
    ).rejects.toMatchObject({ status: 404, body: { message: 'Not Found' } });
  });

  test('paginates Posts after state and visibility filters and counts the same set', async () => {
    const profileId = paginationProfileIds[0]!;
    const firstPage = await listProfilePosts(profileId);

    expect(firstPage.posts).toHaveLength(50);
    expect(firstPage.posts.map(({ id }) => id)).toEqual(
      paginationPostIds.slice(0, 51).reverse().slice(0, 50),
    );
    expect(firstPage.nextCursor).toBe(paginationPostIds[1]);
    expect(firstPage.previousCursor).toBeNull();

    const secondPage = await listProfilePosts(profileId, { cursor: firstPage.nextCursor! });
    expect(secondPage.posts.map(({ id }) => id)).toEqual([paginationPostIds[0]]);
    expect(secondPage.previousCursor).toBe(paginationPostIds[0]);
    expect(secondPage.nextCursor).toBeNull();

    const previousPage = await listProfilePosts(profileId, {
      cursor: secondPage.previousCursor!,
      direction: 'previous',
    });
    expect(previousPage.posts.map(({ id }) => id)).toEqual(
      paginationPostIds.slice(0, 51).reverse().slice(0, 50),
    );
    expect(previousPage.previousCursor).toBeNull();
    expect(previousPage.nextCursor).toBe(paginationPostIds[1]);

    const loadedNextPage = await loadProfilePosts({
      params: { id: profileId },
      url: new URL(`http://admin.test/profiles/${profileId}/posts?cursor=${paginationPostIds[1]}`),
    } as Parameters<typeof loadProfilePosts>[0]);
    if (!loadedNextPage) {
      throw new Error('Expected next Profile Posts loader data');
    }
    expect(loadedNextPage.posts.map(({ id }: { id: string }) => id)).toEqual([
      paginationPostIds[0],
    ]);
    expect(loadedNextPage.previousCursor).toBe(paginationPostIds[0]);
    expect(loadedNextPage.nextCursor).toBeNull();

    const loadedPreviousPage = await loadProfilePosts({
      params: { id: profileId },
      url: new URL(
        `http://admin.test/profiles/${profileId}/posts?cursor=${paginationPostIds[0]}&direction=previous`,
      ),
    } as Parameters<typeof loadProfilePosts>[0]);
    if (!loadedPreviousPage) {
      throw new Error('Expected previous Profile Posts loader data');
    }
    expect(loadedPreviousPage.posts.map(({ id }: { id: string }) => id)).toEqual(
      paginationPostIds.slice(0, 51).reverse().slice(0, 50),
    );
    expect(loadedPreviousPage.previousCursor).toBeNull();
    expect(loadedPreviousPage.nextCursor).toBe(paginationPostIds[1]);

    const profile = await getProfile(profileId);
    expect(profile?.postCount).toBe(51);
    expect(profile?.lastPostedAt).toBe(postedAt(150).toString());
  });
});
