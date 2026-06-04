import { db, PostContents, Posts, TableDiscriminator } from '@kosmo/core/db';
import { PostState, PostVisibility } from '@kosmo/core/enums';
import { and, eq, inArray } from 'drizzle-orm';
import { createObjectRef } from '@/graphql/utils';

export const Post = createObjectRef('Post', TableDiscriminator.Posts, (ids) => {
  // TODO(PROD-102): Apply viewer-specific visibility checks. PUBLIC and UNLISTED
  // are readable by ID, while FOLLOWERS and DIRECT need restricted access.
  return db
    .select()
    .from(Posts)
    .where(and(inArray(Posts.id, ids), eq(Posts.state, PostState.ACTIVE)));
});

Post.implement({
  fields: (t) => ({
    visibility: t.expose('visibility', { type: PostVisibility }),
    state: t.expose('state', { type: PostState }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

export const PostContent = createObjectRef(
  'PostContent',
  TableDiscriminator.PostContents,
  (ids) => {
    // TODO(PROD-102): Prevent direct PostContent node loads from bypassing the
    // parent post's current-content and visibility policy.
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
