import { db, Instances, PostContents, Posts, Profiles } from '@kosmo/core/db';
import { PostState, PostVisibility } from '@kosmo/core/enums';
import { postContentDocumentToText } from '@kosmo/core/post-content/server';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { createObjectRef } from '@/graphql/utils';
import { postRepostSourceAccessWhere } from './access/repost-source';
import { postVisibilityAccessWhere } from './access/visibility';

export const Post = createObjectRef('Post', (ids, ctx) =>
  db
    .select(getColumns(Posts))
    .from(Posts)
    .innerJoin(Profiles, eq(Posts.profileId, Profiles.id))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        inArray(Posts.id, ids),
        postVisibilityAccessWhere({ ctx }),
        postRepostSourceAccessWhere({ ctx }),
      ),
    ),
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
    document: t.expose('document', { type: 'PostContentDocument' }),
    bodyText: t.string({
      resolve: (content) => postContentDocumentToText(content.document),
    }),
    contentWarning: t.string({
      nullable: true,
      resolve: (content) => content.document.summary,
    }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});
