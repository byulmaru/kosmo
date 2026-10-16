import {
  ActivityPubActors,
  db,
  first,
  Hashtags,
  Instances,
  Media,
  PostContents,
  Posts,
  ProfileHashtags,
  ProfileMedia,
  Profiles,
} from '@kosmo/core/db';
import {
  InstanceKind,
  MediaState,
  PostState,
  PostVisibility,
  ProfileMediaKind,
} from '@kosmo/core/enums';
import {
  canonicalizePostContentDocument,
  postContentDocumentToText,
} from '@kosmo/core/post-content/server-document';
import { and, asc, count, desc, eq, gt, ilike, inArray, isNotNull, lt, max, or } from 'drizzle-orm';
import { z } from 'zod';

export const profileIdSchema = z.uuid();
export const profileOriginSchema = z.enum(['LOCAL', 'REMOTE']);
export const profileStateSchema = z.enum(['ACTIVE', 'DISABLED', 'SUSPENDED']);

export type ProfileOrigin = z.infer<typeof profileOriginSchema>;
export type ProfileReadState = z.infer<typeof profileStateSchema>;
export type ProfilePostKind = 'POST' | 'REPLY' | 'QUOTE' | 'REPOST' | 'REPLY_QUOTE';

export interface ProfileListOptions {
  cursor?: string;
  direction?: 'next' | 'previous';
  q?: string;
  origin?: ProfileOrigin;
  state?: ProfileReadState;
}

export interface ProfilePostsOptions {
  cursor?: string;
  direction?: 'next' | 'previous';
}

export interface ProfileListRow {
  id: string;
  handle: string;
  relativeHandle: string;
  displayName: string;
  avatarUrl: string | null;
  origin: ProfileOrigin;
  state: ProfileReadState;
  followersCount: number;
  followingCount: number;
  postCount: number;
  lastPostedAt: string | null;
}

export interface ProfileDetail extends ProfileListRow {
  qualifiedHandle: string;
  bio: string | null;
  headerUrl: string | null;
  remoteUrl: string | null;
  tags: string[];
  instanceDomain: string;
  createdAt: string;
}

export interface ProfileSummary {
  id: string;
  displayName: string;
  relativeHandle: string;
}

export interface ProfilePostRow {
  id: string;
  visibility: 'PUBLIC' | 'UNLISTED';
  createdAt: string;
  kind: ProfilePostKind;
  bodyText: string;
  summary: string | null;
  sensitive: boolean;
  mediaCount: number;
}

interface PageCursors {
  previousCursor: string | null;
  nextCursor: string | null;
}

const pageSize = 50;
const publicVisibilities = [PostVisibility.PUBLIC, PostVisibility.UNLISTED] as const;
const profileMediaKinds = [ProfileMediaKind.AVATAR, ProfileMediaKind.HEADER] as const;

const originToInstanceKind = (origin: ProfileOrigin) =>
  origin === 'LOCAL' ? InstanceKind.LOCAL : InstanceKind.ACTIVITYPUB;

const instanceKindToOrigin = (kind: (typeof Instances.$inferSelect)['kind']): ProfileOrigin =>
  kind === InstanceKind.LOCAL ? 'LOCAL' : 'REMOTE';

const relativeHandle = (handle: string, origin: ProfileOrigin, domain: string) =>
  origin === 'LOCAL' ? `@${handle}` : `@${handle}@${domain}`;

const qualifiedHandle = (handle: string, domain: string) => `@${handle}@${domain}`;

const serializeInstant = (value: Temporal.Instant | null | undefined) => value?.toString() ?? null;

const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, '\\$&');

const profileFiltersWhere = ({ q, origin, state }: ProfileListOptions) => {
  const search = q?.trim();
  const pattern = search ? `%${escapeLikePattern(search)}%` : undefined;

  return and(
    origin ? eq(Instances.kind, originToInstanceKind(origin)) : undefined,
    state ? eq(Profiles.state, state) : undefined,
    pattern ? or(ilike(Profiles.handle, pattern), ilike(Profiles.displayName, pattern)) : undefined,
  );
};

const loadPostStats = async (profileIds: string[]) => {
  if (profileIds.length === 0) {
    return new Map<string, { postCount: number; lastPostedAt: Temporal.Instant | null }>();
  }

  const rows = await db
    .select({
      lastPostedAt: max(Posts.createdAt),
      postCount: count(),
      profileId: Posts.profileId,
    })
    .from(Posts)
    .where(
      and(
        inArray(Posts.profileId, profileIds),
        eq(Posts.state, PostState.ACTIVE),
        inArray(Posts.visibility, publicVisibilities),
      ),
    )
    .groupBy(Posts.profileId);

  return new Map(rows.map(({ profileId, ...stats }) => [profileId, stats]));
};

const loadProfileMedia = async (
  profileIds: string[],
  kinds: readonly (typeof profileMediaKinds)[number][],
) => {
  const urls = new Map<string, { avatarUrl: string | null; headerUrl: string | null }>();
  if (profileIds.length === 0) {
    return urls;
  }

  const rows = await db
    .select({
      kind: ProfileMedia.kind,
      profileId: ProfileMedia.profileId,
      url: Media.url,
    })
    .from(ProfileMedia)
    .innerJoin(
      Media,
      and(
        eq(Media.id, ProfileMedia.mediaId),
        eq(Media.state, MediaState.READY),
        isNotNull(Media.url),
      ),
    )
    .where(and(inArray(ProfileMedia.profileId, profileIds), inArray(ProfileMedia.kind, kinds)));

  for (const { kind, profileId, url } of rows) {
    const current = urls.get(profileId) ?? { avatarUrl: null, headerUrl: null };
    if (kind === ProfileMediaKind.AVATAR) {
      current.avatarUrl = url;
    } else if (kind === ProfileMediaKind.HEADER) {
      current.headerUrl = url;
    }
    urls.set(profileId, current);
  }

  return urls;
};

const loadProfileTags = async (profileId: string) => {
  const rows = await db
    .select({ name: Hashtags.name })
    .from(ProfileHashtags)
    .innerJoin(Hashtags, eq(Hashtags.id, ProfileHashtags.hashtagId))
    .where(eq(ProfileHashtags.profileId, profileId))
    .orderBy(asc(Hashtags.name));

  return rows.map(({ name }) => name);
};

const toProfileListRow = (
  row: {
    id: string;
    handle: string;
    displayName: string;
    origin: ProfileOrigin;
    state: ProfileReadState;
    followersCount: number;
    followingCount: number;
    instanceDomain: string;
  },
  stats: { postCount: number; lastPostedAt: Temporal.Instant | null } | undefined,
  media: { avatarUrl: string | null; headerUrl: string | null } | undefined,
): ProfileListRow => ({
  id: row.id,
  handle: row.handle,
  relativeHandle: relativeHandle(row.handle, row.origin, row.instanceDomain),
  displayName: row.displayName,
  avatarUrl: media?.avatarUrl ?? null,
  origin: row.origin,
  state: row.state,
  followersCount: row.followersCount,
  followingCount: row.followingCount,
  postCount: stats?.postCount ?? 0,
  lastPostedAt: serializeInstant(stats?.lastPostedAt),
});

const hasPreviousCursor = async (cursor: string, filters: ProfileListOptions): Promise<boolean> => {
  const row = await db
    .select({ id: Profiles.id })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(and(profileFiltersWhere(filters), gt(Profiles.id, cursor)))
    .orderBy(asc(Profiles.id))
    .limit(1)
    .then(first);
  return Boolean(row);
};

const hasNextCursor = async (cursor: string, filters: ProfileListOptions): Promise<boolean> => {
  const row = await db
    .select({ id: Profiles.id })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(and(profileFiltersWhere(filters), lt(Profiles.id, cursor)))
    .orderBy(desc(Profiles.id))
    .limit(1)
    .then(first);
  return Boolean(row);
};

export const listProfiles = async ({
  cursor,
  direction = 'next',
  q,
  origin,
  state,
}: ProfileListOptions = {}) => {
  const filters = { q, origin, state };
  const rows = await db
    .select({
      id: Profiles.id,
      handle: Profiles.handle,
      displayName: Profiles.displayName,
      originKind: Instances.kind,
      instanceDomain: Instances.domain,
      state: Profiles.state,
      followersCount: Profiles.followersCount,
      followingCount: Profiles.followingCount,
    })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        profileFiltersWhere(filters),
        cursor
          ? direction === 'previous'
            ? gt(Profiles.id, cursor)
            : lt(Profiles.id, cursor)
          : undefined,
      ),
    )
    .orderBy(direction === 'previous' ? asc(Profiles.id) : desc(Profiles.id))
    .limit(pageSize + 1);

  const hasMoreInDirection = rows.length > pageSize;
  const profiles = (
    direction === 'previous' ? rows.slice(0, pageSize).reverse() : rows.slice(0, pageSize)
  ).map(({ originKind, ...row }) => ({ ...row, origin: instanceKindToOrigin(originKind) }));
  const firstProfile = profiles.at(0);
  const lastProfile = profiles.at(-1);
  const [stats, media] = await Promise.all([
    loadPostStats(profiles.map(({ id }) => id)),
    loadProfileMedia(
      profiles.map(({ id }) => id),
      [ProfileMediaKind.AVATAR],
    ),
  ]);
  const projectedProfiles = profiles.map((profile) =>
    toProfileListRow(profile, stats.get(profile.id), media.get(profile.id)),
  );

  const previousPageExists =
    direction === 'next' && cursor && firstProfile
      ? await hasPreviousCursor(cursor, filters)
      : direction === 'previous' && hasMoreInDirection;
  const nextPageExists =
    direction === 'previous' && lastProfile
      ? await hasNextCursor(lastProfile.id, filters)
      : direction === 'next' && hasMoreInDirection;

  return {
    profiles: projectedProfiles,
    previousCursor: previousPageExists ? (firstProfile?.id ?? null) : null,
    nextCursor: nextPageExists ? (lastProfile?.id ?? null) : null,
  } satisfies PageCursors & { profiles: ProfileListRow[] };
};

export const getProfile = async (id: string): Promise<ProfileDetail | undefined> => {
  const row = await db
    .select({
      id: Profiles.id,
      handle: Profiles.handle,
      displayName: Profiles.displayName,
      bio: Profiles.bio,
      originKind: Instances.kind,
      instanceDomain: Instances.domain,
      state: Profiles.state,
      followersCount: Profiles.followersCount,
      followingCount: Profiles.followingCount,
      createdAt: Profiles.createdAt,
      actorProfileUrl: ActivityPubActors.profileUrl,
      actorUri: ActivityPubActors.uri,
    })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .where(eq(Profiles.id, id))
    .limit(1)
    .then(first);

  if (!row) {
    return undefined;
  }

  const origin = instanceKindToOrigin(row.originKind);
  const [stats, media, tags] = await Promise.all([
    loadPostStats([id]),
    loadProfileMedia([id], profileMediaKinds),
    loadProfileTags(id),
  ]);
  const profile = toProfileListRow({ ...row, origin }, stats.get(id), media.get(id));

  return {
    ...profile,
    qualifiedHandle: qualifiedHandle(row.handle, row.instanceDomain),
    bio: row.bio,
    headerUrl: media.get(id)?.headerUrl ?? null,
    remoteUrl: origin === 'REMOTE' ? (row.actorProfileUrl ?? row.actorUri) : null,
    tags,
    instanceDomain: row.instanceDomain,
    createdAt: row.createdAt.toString(),
  };
};

export const getProfileSummary = async (id: string): Promise<ProfileSummary | undefined> => {
  const row = await db
    .select({
      id: Profiles.id,
      handle: Profiles.handle,
      displayName: Profiles.displayName,
      originKind: Instances.kind,
      instanceDomain: Instances.domain,
    })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(eq(Profiles.id, id))
    .limit(1)
    .then(first);

  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    displayName: row.displayName,
    relativeHandle: relativeHandle(
      row.handle,
      instanceKindToOrigin(row.originKind),
      row.instanceDomain,
    ),
  };
};

const classifyPost = (row: {
  replyParentId: string | null;
  repostSourceId: string | null;
  document: unknown | null;
}): ProfilePostKind => {
  const hasContent = row.document !== null;
  if (row.replyParentId && row.repostSourceId && hasContent) {
    return 'REPLY_QUOTE';
  }
  if (row.replyParentId) {
    return 'REPLY';
  }
  if (row.repostSourceId && hasContent) {
    return 'QUOTE';
  }
  if (row.repostSourceId) {
    return 'REPOST';
  }
  return 'POST';
};

const toProfilePostRow = (row: {
  id: string;
  visibility: ProfilePostRow['visibility'];
  createdAt: Temporal.Instant;
  replyParentId: string | null;
  repostSourceId: string | null;
  document: unknown | null;
}): ProfilePostRow => {
  const document =
    row.document === null ? undefined : canonicalizePostContentDocument(row.document);

  return {
    id: row.id,
    visibility: row.visibility,
    createdAt: row.createdAt.toString(),
    kind: classifyPost(row),
    bodyText: document ? postContentDocumentToText(document) : '',
    summary: document?.summary ?? null,
    sensitive: document?.body.attrs?.sensitiveMedia ?? false,
    mediaCount: document?.body.content.filter(({ type }) => type === 'media').length ?? 0,
  };
};

const assertPublicVisibility = (
  visibility: (typeof Posts.$inferSelect)['visibility'],
): ProfilePostRow['visibility'] => {
  if (visibility === PostVisibility.PUBLIC || visibility === PostVisibility.UNLISTED) {
    return visibility;
  }
  throw new Error('Profile post query returned an ineligible visibility');
};

export const listProfilePosts = async (
  profileId: string,
  { cursor, direction = 'next' }: ProfilePostsOptions = {},
) => {
  const rows = await db
    .select({
      id: Posts.id,
      visibility: Posts.visibility,
      createdAt: Posts.createdAt,
      replyParentId: Posts.replyParentId,
      repostSourceId: Posts.repostSourceId,
      document: PostContents.document,
    })
    .from(Posts)
    .leftJoin(
      PostContents,
      and(eq(PostContents.id, Posts.currentContentId), eq(PostContents.postId, Posts.id)),
    )
    .where(
      and(
        eq(Posts.profileId, profileId),
        eq(Posts.state, PostState.ACTIVE),
        inArray(Posts.visibility, publicVisibilities),
        cursor
          ? direction === 'previous'
            ? gt(Posts.id, cursor)
            : lt(Posts.id, cursor)
          : undefined,
      ),
    )
    .orderBy(direction === 'previous' ? asc(Posts.id) : desc(Posts.id))
    .limit(pageSize + 1);

  const hasMoreInDirection = rows.length > pageSize;
  const pageRows =
    direction === 'previous' ? rows.slice(0, pageSize).reverse() : rows.slice(0, pageSize);
  const posts = pageRows.map((row) =>
    toProfilePostRow({ ...row, visibility: assertPublicVisibility(row.visibility) }),
  );
  const firstPost = posts.at(0);
  const lastPost = posts.at(-1);
  const profilePostsBefore =
    direction === 'next' && cursor && firstPost
      ? await db
          .select({ id: Posts.id })
          .from(Posts)
          .where(
            and(
              eq(Posts.profileId, profileId),
              eq(Posts.state, PostState.ACTIVE),
              inArray(Posts.visibility, publicVisibilities),
              gt(Posts.id, cursor),
            ),
          )
          .orderBy(asc(Posts.id))
          .limit(1)
          .then(first)
      : undefined;
  const profilePostsAfter =
    direction === 'previous' && lastPost
      ? await db
          .select({ id: Posts.id })
          .from(Posts)
          .where(
            and(
              eq(Posts.profileId, profileId),
              eq(Posts.state, PostState.ACTIVE),
              inArray(Posts.visibility, publicVisibilities),
              lt(Posts.id, lastPost.id),
            ),
          )
          .orderBy(desc(Posts.id))
          .limit(1)
          .then(first)
      : undefined;

  const previousPageExists =
    direction === 'next' && cursor && firstPost
      ? Boolean(profilePostsBefore)
      : direction === 'previous' && hasMoreInDirection;
  const nextPageExists =
    direction === 'previous' && lastPost
      ? Boolean(profilePostsAfter)
      : direction === 'next' && hasMoreInDirection;

  return {
    posts,
    previousCursor: previousPageExists ? (firstPost?.id ?? null) : null,
    nextCursor: nextPageExists ? (lastPost?.id ?? null) : null,
  } satisfies PageCursors & { posts: ProfilePostRow[] };
};
