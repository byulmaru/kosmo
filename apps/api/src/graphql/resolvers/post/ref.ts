import { db, PostContents, Posts, TableDiscriminator } from '@kosmo/core/db';
import { PostState, PostVisibility } from '@kosmo/core/enums';
import { and, eq, inArray } from 'drizzle-orm';
import { createObjectRef } from '@/graphql/utils';

export const Post = createObjectRef('Post', TableDiscriminator.Posts, (ids) =>
  db
    .select()
    .from(Posts)
    .where(and(inArray(Posts.id, ids), eq(Posts.state, PostState.ACTIVE))),
);

Post.implement({
  fields: (t) => ({
    visibility: t.expose('visibility', { type: PostVisibility }),
    state: t.expose('state', { type: PostState }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

export const PostContent = createObjectRef('PostContent', TableDiscriminator.PostContents, (ids) =>
  db.select().from(PostContents).where(inArray(PostContents.id, ids)),
);

PostContent.implement({
  fields: (t) => ({
    bodyJson: t.expose('bodyJson', { type: 'TipTapDocument' }),
    bodyText: t.exposeString('bodyText'),
    spoilerText: t.exposeString('spoilerText', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});
