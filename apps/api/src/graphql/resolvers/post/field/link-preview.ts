import { getLinkPreviewUrlHash, normalizeLinkPreviewUrl } from '@kosmo/core/link-preview';
import { getPostContentLinkPreviewUrl } from '@kosmo/core/post-content';
import { builder } from '@/graphql/builder';
import { reportError } from '@/sentry';
import { linkPreviewLoader } from '../loader/link-preview';
import { PostContent } from '../ref';

const PostContentLinkPreview = builder.simpleObject('PostContentLinkPreview', {
  fields: (t) => ({
    url: t.string(),
    title: t.string(),
    description: t.string({ nullable: true }),
    imageUrl: t.string({ nullable: true }),
    imageWidth: t.int({ nullable: true }),
    imageHeight: t.int({ nullable: true }),
  }),
});

builder.objectField(PostContent, 'linkPreview', (t) =>
  t.field({
    type: PostContentLinkPreview,
    nullable: true,
    resolve: async (content, _, ctx) => {
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
        const current = await linkPreviewLoader(ctx).load(urlHash);
        return current?.title == null
          ? null
          : {
              url: current.url,
              title: current.title,
              description: current.description,
              imageUrl: current.imageUrl,
              imageWidth: current.imageUrl === null ? null : current.imageWidth,
              imageHeight: current.imageUrl === null ? null : current.imageHeight,
            };
      } catch (error) {
        reportError(error);
        return null;
      }
    },
  }),
);
