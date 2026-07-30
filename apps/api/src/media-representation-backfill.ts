import { db, Media } from '@kosmo/core/db';
import { MediaSource, MediaState } from '@kosmo/core/enums';
import { and, eq, isNull, or } from 'drizzle-orm';
import { getMediaStorageRepresentation } from './media-storage';

export const backfillLocalMediaRepresentations = async (): Promise<{
  readonly failed: number;
  readonly found: number;
  readonly updated: number;
}> => {
  const rows = await db
    .select({ id: Media.id, storageReference: Media.storageReference })
    .from(Media)
    .where(
      and(
        eq(Media.source, MediaSource.LOCAL),
        eq(Media.state, MediaState.READY),
        or(isNull(Media.originalUrl), isNull(Media.originalMediaType)),
      ),
    );
  let failed = 0;
  let updated = 0;
  for (const row of rows) {
    try {
      const representation = await getMediaStorageRepresentation(row.storageReference);
      const result = await db
        .update(Media)
        .set({
          originalMediaType: representation.mediaType,
          originalUrl: representation.url,
        })
        .where(
          and(
            eq(Media.id, row.id),
            eq(Media.source, MediaSource.LOCAL),
            eq(Media.state, MediaState.READY),
            or(isNull(Media.originalUrl), isNull(Media.originalMediaType)),
          ),
        )
        .returning({ id: Media.id });
      updated += result.length;
    } catch (error) {
      failed += 1;
      console.error('Failed to backfill Local Media representation', { error, mediaId: row.id });
    }
  }
  return { failed, found: rows.length, updated };
};
