import { db, PostContents, Posts, Profiles, TableDiscriminator } from '@kosmo/core/db';
import { PostState, PostVisibility } from '@kosmo/core/enums';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { createObjectRef } from '@/graphql/utils';
import { postVisibilityAccessWhere } from './access/visibility';

export const Post = createObjectRef('Post', TableDiscriminator.Posts, (ids, ctx) => {
  return db
    .select(getColumns(Posts))
    .from(Posts)
    .innerJoin(Profiles, eq(Posts.profileId, Profiles.id))
    .where(and(inArray(Posts.id, ids), postVisibilityAccessWhere({ ctx })));
});

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
  (ids) => {
    // TODO(PROD-121): Prevent direct PostContent node loads from bypassing the parent
    // post's state and visibility policy. Historical content remains loadable.
    return db.select().from(PostContents).where(inArray(PostContents.id, ids));
  },
);

PostContent.implement({
  fields: (t) => ({
    bodyJson: t.expose('bodyJson', { type: 'TipTapDocument' }),
    bodyText: t.exposeString('bodyText'),
    spoilerText: t.exposeString('spoilerText', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});
