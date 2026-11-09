import '@kosmo/core/polyfill';

import { db, first, firstOrThrow, LinkPreviews, withPrimaryDatabase } from '@kosmo/core/db';
import { fetchLinkPreview, normalizeLinkPreviewUrl } from '@kosmo/core/link-preview';
import { getLinkPreviewUrlHash } from '@kosmo/core/temporal/link-preview';
import { eq, sql } from 'drizzle-orm';
import type { LinkPreview } from '@kosmo/core/link-preview';
import type { LinkPreviewRefreshInput } from '@kosmo/core/temporal/link-preview';

const refreshTtl = Temporal.Duration.from({ hours: 168 });
const failureBackoff = Temporal.Duration.from({ minutes: 10 });

const linkPreviewValue = (row: typeof LinkPreviews.$inferSelect | undefined): LinkPreview | null =>
  row?.title == null
    ? null
    : {
        url: row.url,
        title: row.title,
        description: row.description,
        imageUrl: row.imageUrl,
      };

const isWithin = (
  instant: Temporal.Instant | null,
  duration: Temporal.Duration,
  now: Temporal.Instant,
) => instant !== null && instant.add(duration).epochNanoseconds > now.epochNanoseconds;

export const refreshLinkPreviewActivity = async (
  input: LinkPreviewRefreshInput,
): Promise<LinkPreview | null> => {
  const url = normalizeLinkPreviewUrl(input.url);
  if (url === null) {
    return null;
  }

  const urlHash = getLinkPreviewUrlHash(url);
  const current = await withPrimaryDatabase(() =>
    db.select().from(LinkPreviews).where(eq(LinkPreviews.urlHash, urlHash)).limit(1).then(first),
  );
  const now = Temporal.Now.instant();

  if (isWithin(current?.lastSuccessfulFetchAt ?? null, refreshTtl, now)) {
    return linkPreviewValue(current);
  }
  if (isWithin(current?.lastFailureAt ?? null, failureBackoff, now)) {
    return linkPreviewValue(current);
  }

  const fetched = await fetchLinkPreview(url);
  const fetchedAt = Temporal.Now.instant();

  if (fetched === null) {
    const updated = await db
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
      })
      .returning()
      .then(firstOrThrow);
    return linkPreviewValue(updated);
  }

  const updated = await db
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
    })
    .returning()
    .then(firstOrThrow);
  return linkPreviewValue(updated);
};
