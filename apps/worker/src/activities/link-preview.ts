import '@kosmo/core/polyfill';

import { db, first, LinkPreviews, PostContents, Posts, withPrimaryDatabase } from '@kosmo/core/db';
import { getLinkPreviewUrlHash, normalizeLinkPreviewUrl } from '@kosmo/core/link-preview';
import { getPostContentLinkPreviewUrl } from '@kosmo/core/post-content';
import { and, eq, sql } from 'drizzle-orm';
import { fetchLinkPreview } from './link-preview-client.js';
import type { LinkPreviewCollectionInput } from '../workflows/link-preview';

const refreshTtl = Temporal.Duration.from({ hours: 168 });
const failureBackoff = Temporal.Duration.from({ minutes: 10 });

const isWithin = (
  instant: Temporal.Instant | null,
  duration: Temporal.Duration,
  now: Temporal.Instant,
) => instant !== null && instant.add(duration).epochNanoseconds > now.epochNanoseconds;

const refreshLinkPreview = async (value: string): Promise<void> => {
  const url = normalizeLinkPreviewUrl(value);
  if (url === null) {
    return;
  }

  const urlHash = getLinkPreviewUrlHash(url);
  const current = await withPrimaryDatabase(() =>
    db
      .select({
        lastFailureAt: LinkPreviews.lastFailureAt,
        lastSuccessfulFetchAt: LinkPreviews.lastSuccessfulFetchAt,
      })
      .from(LinkPreviews)
      .where(eq(LinkPreviews.urlHash, urlHash))
      .limit(1)
      .then(first),
  );
  const now = Temporal.Now.instant();

  if (isWithin(current?.lastSuccessfulFetchAt ?? null, refreshTtl, now)) {
    return;
  }
  if (isWithin(current?.lastFailureAt ?? null, failureBackoff, now)) {
    return;
  }

  const fetched = await fetchLinkPreview(url);
  const fetchedAt = Temporal.Now.instant();

  if (fetched === null) {
    await db
      .insert(LinkPreviews)
      .values({
        url,
        urlHash,
        lastFailureAt: fetchedAt,
      })
      .onConflictDoUpdate({
        target: LinkPreviews.urlHash,
        set: {
          lastFailureAt: fetchedAt,
          updatedAt: sql`now()`,
        },
      });
    return;
  }

  await db
    .insert(LinkPreviews)
    .values({
      url,
      urlHash,
      title: fetched.title,
      description: fetched.description,
      imageUrl: fetched.imageUrl,
      lastSuccessfulFetchAt: fetchedAt,
    })
    .onConflictDoUpdate({
      target: LinkPreviews.urlHash,
      set: {
        url,
        title: fetched.title,
        description: fetched.description,
        imageUrl: fetched.imageUrl,
        lastSuccessfulFetchAt: fetchedAt,
        lastFailureAt: null,
        updatedAt: sql`now()`,
      },
    });
};

export const collectPostLinkPreviewActivity = async ({
  postId,
}: LinkPreviewCollectionInput): Promise<void> => {
  const post = await withPrimaryDatabase(() =>
    db
      .select({ document: PostContents.document })
      .from(Posts)
      .innerJoin(
        PostContents,
        and(eq(PostContents.id, Posts.currentContentId), eq(PostContents.postId, Posts.id)),
      )
      .where(eq(Posts.id, postId))
      .limit(1)
      .then(first),
  );
  if (!post) {
    return;
  }

  const url = getPostContentLinkPreviewUrl(post.document);
  if (url !== null) {
    await refreshLinkPreview(url);
  }
};
