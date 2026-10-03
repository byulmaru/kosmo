import '@kosmo/core/polyfill';

import { db, first, Instances, Posts, ProfilePinnedPosts, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { and, asc, eq, gt } from 'drizzle-orm';
import { authorizeLocalPostNote, dispatchLocalPostNote } from './local-post-note';
import { isCanonicalLocalProfileId } from './local-profile-actor';
import type { CollectionDispatcher, RequestContext } from '@fedify/fedify';
import type { Note } from '@fedify/vocab';

const PAGE_SIZE = 50;
const FIRST_CURSOR = 'v1:first';
const CURSOR_PREFIX = 'v1:after:';

type FeaturedRow = {
  readonly id: string;
  readonly postId: string;
};

const isLocalProfile = async (
  context: Pick<RequestContext<void>, 'canonicalOrigin' | 'host'>,
  profileId: string,
): Promise<boolean> => {
  if (
    context.host !== new URL(context.canonicalOrigin).host ||
    !isCanonicalLocalProfileId(profileId)
  ) {
    return false;
  }

  return Boolean(
    await db
      .select({ id: Profiles.id })
      .from(Profiles)
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(
        and(
          eq(Profiles.id, profileId),
          eq(Profiles.state, ProfileState.ACTIVE),
          eq(Instances.kind, InstanceKind.LOCAL),
          eq(Instances.state, InstanceState.ACTIVE),
          eq(Instances.canonicalOrigin, context.canonicalOrigin),
        ),
      )
      .limit(1)
      .then(first),
  );
};

const loadFeaturedRows = async (profileId: string, afterId?: string): Promise<FeaturedRow[]> =>
  db
    .select({ id: ProfilePinnedPosts.id, postId: Posts.id })
    .from(ProfilePinnedPosts)
    .innerJoin(Posts, eq(Posts.id, ProfilePinnedPosts.postId))
    .where(
      and(
        eq(ProfilePinnedPosts.profileId, profileId),
        eq(Posts.profileId, profileId),
        afterId ? gt(ProfilePinnedPosts.id, afterId) : undefined,
      ),
    )
    .orderBy(asc(ProfilePinnedPosts.id))
    .limit(PAGE_SIZE + 1);

const parseCursor = (cursor: string | null): string | undefined | null => {
  if (cursor === null || cursor === FIRST_CURSOR) {
    return undefined;
  }
  if (!cursor.startsWith(CURSOR_PREFIX)) {
    return null;
  }
  const id = cursor.slice(CURSOR_PREFIX.length);
  return isCanonicalLocalProfileId(id) ? id : null;
};

const toCursor = (id: string): string => `${CURSOR_PREFIX}${id}`;

const visibleFeaturedItems = async (
  context: RequestContext<void>,
  rows: readonly FeaturedRow[],
): Promise<{ readonly id: string; readonly item: Note }[]> => {
  const items: { id: string; item: Note }[] = [];
  for (const row of rows) {
    if (!(await authorizeLocalPostNote(context, { id: row.postId }))) {
      continue;
    }
    const item = await dispatchLocalPostNote(context, { id: row.postId });
    if (item) {
      items.push({ id: row.id, item });
    }
  }
  return items;
};

export const dispatchLocalProfileFeatured: CollectionDispatcher<
  Note,
  RequestContext<void>,
  void,
  void
> = async (context, profileId, rawCursor) => {
  if (!(await isLocalProfile(context, profileId))) {
    return null;
  }

  const afterId = parseCursor(rawCursor);
  if (afterId === null) {
    return null;
  }

  const visible: { id: string; item: Note }[] = [];
  let nextAfterId = afterId;
  let hasMoreRaw = false;
  while (visible.length <= PAGE_SIZE) {
    const rows = await loadFeaturedRows(profileId, nextAfterId);
    if (rows.length === 0) {
      break;
    }
    hasMoreRaw = rows.length > PAGE_SIZE;
    const pageRows = hasMoreRaw ? rows.slice(0, PAGE_SIZE) : rows;
    visible.push(...(await visibleFeaturedItems(context, pageRows)));
    nextAfterId = pageRows.at(-1)?.id;
    if (!nextAfterId || !hasMoreRaw) {
      break;
    }
  }

  const items = visible.slice(0, PAGE_SIZE);
  const last = items.at(-1);
  return {
    items: items.map(({ item }) => item),
    ...(last && (visible.length > PAGE_SIZE || hasMoreRaw)
      ? { nextCursor: toCursor(last.id) }
      : {}),
  };
};

export const countLocalProfileFeatured = async (
  context: RequestContext<void>,
  profileId: string,
): Promise<number | null> => {
  if (!(await isLocalProfile(context, profileId))) {
    return null;
  }

  let count = 0;
  let afterId: string | undefined;
  while (true) {
    const rows = await loadFeaturedRows(profileId, afterId);
    if (rows.length === 0) {
      return count;
    }
    const visible = await visibleFeaturedItems(context, rows);
    count += visible.length;
    afterId = rows.at(-1)?.id;
    if (!afterId || rows.length <= PAGE_SIZE) {
      return count;
    }
  }
};

export const firstLocalProfileFeaturedCursor = async (
  context: RequestContext<void>,
  profileId: string,
): Promise<string | null> => ((await isLocalProfile(context, profileId)) ? FIRST_CURSOR : null);

export const authorizeLocalProfileFeatured = async (
  context: RequestContext<void>,
  profileId: string,
): Promise<boolean> => isLocalProfile(context, profileId);
