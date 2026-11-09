import { db, first, LinkPreviews } from '@kosmo/core/db';
import { getLinkPreviewUrlHash, normalizeLinkPreviewUrl } from '@kosmo/core/link-preview';
import { getPostContentLinkPreviewUrl } from '@kosmo/core/post-content';
import { eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { reportError } from '@/sentry';
import { PostContent } from '../ref';

const PostContentLinkPreview = builder.simpleObject('PostContentLinkPreview', {
  fields: (t) => ({
    url: t.string(),
    title: t.string(),
    description: t.string({ nullable: true }),
    imageUrl: t.string({ nullable: true }),
  }),
});

builder.objectField(PostContent, 'linkPreview', (t) =>
  t.field({
    type: PostContentLinkPreview,
    nullable: true,
    resolve: async (content) => {
      try {
        const firstUrl = getPostContentLinkPreviewUrl(content.document);
        if (firstUrl === null) {
          return null;
        }

        const url = normalizeLinkPreviewUrl(firstUrl);
        if (url === null) {
          return null;
        }

        const urlHash = getLinkPreviewUrlHash(url);
        const current = await db
          .select({
            url: LinkPreviews.url,
            title: LinkPreviews.title,
            description: LinkPreviews.description,
            imageUrl: LinkPreviews.imageUrl,
          })
          .from(LinkPreviews)
          .where(eq(LinkPreviews.urlHash, urlHash))
          .limit(1)
          .then(first);
        return current?.title == null
          ? null
          : {
              url: current.url,
              title: current.title,
              description: current.description,
              imageUrl: current.imageUrl,
            };
      } catch (error) {
        reportError(error);
        return null;
      }
    },
  }),
);
