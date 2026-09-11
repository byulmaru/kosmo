import { db, Instances, PostContents, Posts, Profiles } from '@kosmo/core/db';
import { MediaState, PostState, PostVisibility } from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { postContentDocumentToText } from '@kosmo/core/post-content/server';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { createObjectRef } from '@/graphql/utils';
import { mediaByIdLoader } from '../media/loader/by-id';
import { Media } from '../media/ref';
import { postAccessWhere } from './access';
import { postVisibilityAccessWhere } from './access/visibility';

export const Post = createObjectRef('Post', (ids, ctx) =>
  db
    .select(getColumns(Posts))
    .from(Posts)
    .innerJoin(Profiles, eq(Posts.profileId, Profiles.id))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(and(inArray(Posts.id, ids), postAccessWhere({ ctx, profileMute: 'ignore' }))),
);

Post.implement({
  fields: (t) => ({
    visibility: t.expose('visibility', { type: PostVisibility }),
    state: t.expose('state', { type: PostState }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

export const PostConnection = builder.connectionObject(
  {
    type: Post,
    name: 'PostConnection',
  },
  {
    name: 'PostConnectionEdge',
  },
);

export const PostContent = createObjectRef('PostContent', (ids, ctx) =>
  db
    .select(getColumns(PostContents))
    .from(PostContents)
    .innerJoin(Posts, eq(Posts.id, PostContents.postId))
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(and(inArray(PostContents.id, ids), postVisibilityAccessWhere({ ctx }))),
);

PostContent.implement({
  fields: (t) => ({
    document: t.field({
      type: 'PostContentDocument',
      resolve: (content) => projectPostContentDocument(content.document),
    }),
    bodyText: t.string({
      resolve: (content) => postContentDocumentToText(content.document),
    }),
    contentWarning: t.string({
      nullable: true,
      resolve: (content) => content.document.summary,
    }),
    media: t.field({
      type: [Media],
      nullable: true,
      grantScopes: ['readMedia'],
      resolve: async (content, _, ctx) => {
        const mediaNodes = content.document.body.content.filter((block) => block.type === 'media');
        if (mediaNodes.length === 0) {
          return [];
        }

        const mediaRows = await Promise.all(
          mediaNodes.map((node) => mediaByIdLoader(ctx).load(node.attrs.mediaId)),
        );
        const result: NonNullable<(typeof mediaRows)[number]>[] = [];

        for (const media of mediaRows) {
          if (!media || media.state !== MediaState.READY || !media.url) {
            return null;
          }

          result.push(media);
        }

        return result;
      },
    }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

function projectPostContentDocument(
  document: typeof PostContents.$inferSelect.document,
): typeof PostContents.$inferSelect.document {
  return {
    ...document,
    body: {
      ...document.body,
      content: document.body.content.map((block) => {
        if (block.type === 'media') {
          return {
            ...block,
            attrs: {
              ...block.attrs,
              mediaId: encodeGlobalId('Media', block.attrs.mediaId),
            },
          };
        }

        return {
          ...block,
          content: block.content?.map((node) =>
            node.type === 'mention'
              ? {
                  ...node,
                  attrs: {
                    ...node.attrs,
                    profileId: encodeGlobalId('Profile', node.attrs.profileId),
                  },
                }
              : node,
          ),
        };
      }),
    },
  };
}
