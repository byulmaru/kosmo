import { db, LinkPreviews } from '@kosmo/core/db';
import { inArray } from 'drizzle-orm';
import type { UserContext } from '@/context';

type LinkPreviewRow = Pick<
  typeof LinkPreviews.$inferSelect,
  'description' | 'imageHeight' | 'imageUrl' | 'imageWidth' | 'title' | 'url' | 'urlHash'
>;

export const linkPreviewLoader = (ctx: UserContext) =>
  ctx.loader<string, LinkPreviewRow, string, true>({
    name: 'postContent.linkPreview',
    nullable: true,
    load: (urlHashes) => {
      const uniqueUrlHashes = [...new Set(urlHashes)];
      return db
        .select({
          urlHash: LinkPreviews.urlHash,
          url: LinkPreviews.url,
          title: LinkPreviews.title,
          description: LinkPreviews.description,
          imageUrl: LinkPreviews.imageUrl,
          imageWidth: LinkPreviews.imageWidth,
          imageHeight: LinkPreviews.imageHeight,
        })
        .from(LinkPreviews)
        .where(inArray(LinkPreviews.urlHash, uniqueUrlHashes));
    },
    key: (row) => row?.urlHash ?? null,
  });
