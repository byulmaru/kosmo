import { db, Instances, PostContents, Posts, Profiles, TableDiscriminator } from '@kosmo/core/db';
import { PostState, PostVisibility } from '@kosmo/core/enums';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { createObjectRef } from '@/graphql/utils';
import { postVisibilityAccessWhere } from './access/visibility';

export const Post = createObjectRef('Post', TableDiscriminator.Posts, (ids, ctx) =>
  db
    .select(getColumns(Posts))
    .from(Posts)
    .innerJoin(Profiles, eq(Posts.profileId, Profiles.id))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(and(inArray(Posts.id, ids), postVisibilityAccessWhere({ ctx }))),
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

export const PostContent = createObjectRef(
  'PostContent',
  TableDiscriminator.PostContents,
  (ids, ctx) =>
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
    bodyText: t.exposeString('bodyText'),
    contentWarning: t.exposeString('contentWarning', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});
