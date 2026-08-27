import '@kosmo/core/polyfill';

import { db, Instances, Media, PostContents, Posts, Profiles } from '@kosmo/core/db';
import {
  InstanceKind,
  InstanceState,
  MediaState,
  PostVisibility,
  ProfileState,
} from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { postVisibilityCondition } from '@kosmo/core/visibility/post';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { buildSitemapUrl, serializeSitemap } from './sitemap-xml';
import type { PostContentDocumentV1 } from '@kosmo/core/post-content';
import type { SitemapEntry } from './sitemap-xml';

const STATIC_PATHS = ['/', '/privacy'] as const;

const resolveCanonicalHttpOrigin = (origin: string) => {
  const url = new URL(origin);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Sitemap URLs must use HTTP or HTTPS');
  }

  return url.origin;
};

type PostRow = {
  contentCreatedAt: Temporal.Instant;
  document: PostContentDocumentV1;
  handle: string;
  id: string;
};

const mediaIdsFromDocument = (document: PostContentDocumentV1) =>
  document.body.content.flatMap((block) => (block.type === 'media' ? [block.attrs.mediaId] : []));

const loadLocalProfiles = async (localInstanceId: string) =>
  db
    .select({ handle: Profiles.handle })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(Profiles.instanceId, localInstanceId),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
      ),
    )
    .orderBy(asc(Profiles.id));

const loadLocalPosts = async (localInstanceId: string): Promise<PostRow[]> => {
  const authorVisible = and(
    eq(Profiles.state, ProfileState.ACTIVE),
    eq(Instances.kind, InstanceKind.LOCAL),
    eq(Instances.state, InstanceState.ACTIVE),
  );
  const visibleToAnonymous = postVisibilityCondition({
    columns: {
      authorProfileId: Posts.profileId,
      authorVisible: authorVisible!,
      postState: Posts.state,
      postVisibility: Posts.visibility,
    },
  });

  return db
    .select({
      contentCreatedAt: PostContents.createdAt,
      document: PostContents.document,
      handle: Profiles.handle,
      id: Posts.id,
    })
    .from(Posts)
    .innerJoin(PostContents, eq(PostContents.id, Posts.currentContentId))
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(Profiles.instanceId, localInstanceId),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        eq(Posts.visibility, PostVisibility.PUBLIC),
        isNotNull(Posts.currentContentId),
        visibleToAnonymous,
      ),
    )
    .orderBy(asc(Posts.id));
};

const filterPostsWithEligibleMedia = async (posts: PostRow[]) => {
  const mediaIds = [...new Set(posts.flatMap(({ document }) => mediaIdsFromDocument(document)))];
  if (mediaIds.length === 0) {
    return posts;
  }

  const mediaRows = await db
    .select({ id: Media.id })
    .from(Media)
    .where(
      and(inArray(Media.id, mediaIds), eq(Media.state, MediaState.READY), isNotNull(Media.url)),
    );
  const eligibleMediaIds = new Set(mediaRows.map(({ id }) => id));

  return posts.filter(({ document }) =>
    mediaIdsFromDocument(document).every((mediaId) => eligibleMediaIds.has(mediaId)),
  );
};

export const loadSitemapEntries = async (): Promise<SitemapEntry[]> => {
  const localInstance = await resolveConfiguredLocalInstance();
  const canonicalOrigin = resolveCanonicalHttpOrigin(localInstance.canonicalOrigin);
  const [profiles, posts] = await Promise.all([
    loadLocalProfiles(localInstance.id),
    loadLocalPosts(localInstance.id),
  ]);
  const eligiblePosts = await filterPostsWithEligibleMedia(posts);

  return [
    ...STATIC_PATHS.map((path) => ({
      url: new URL(path, canonicalOrigin).href,
    })),
    ...profiles.map(({ handle }) => ({
      url: buildSitemapUrl(canonicalOrigin, `@${handle}`),
    })),
    ...eligiblePosts.map(({ contentCreatedAt, handle, id }) => ({
      lastmod: contentCreatedAt,
      url: buildSitemapUrl(canonicalOrigin, `@${handle}`, encodeGlobalId('Post', id)),
    })),
  ];
};

export const createSitemapXml = async () => serializeSitemap(await loadSitemapEntries());
