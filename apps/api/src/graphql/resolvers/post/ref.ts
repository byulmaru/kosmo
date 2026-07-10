import { db, PostContents, Posts, Profiles, TableDiscriminator } from '@kosmo/core/db';
import { PostState, PostVisibility } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { createObjectRef } from '@/graphql/utils';
import { postVisibilityAccessWhere } from './access/visibility';

export const Post = createObjectRef('Post', TableDiscriminator.Posts, async (ids, ctx) => {
  const configuredLocalInstance = await resolveConfiguredLocalInstance();

  return db
    .select(getColumns(Posts))
    .from(Posts)
    .innerJoin(Profiles, eq(Posts.profileId, Profiles.id))
    .where(
      and(
        inArray(Posts.id, ids),
        postVisibilityAccessWhere({
          ctx,
          configuredLocalInstanceId: configuredLocalInstance.id,
        }),
      ),
    );
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
  async (ids, ctx) => {
    const configuredLocalInstance = await resolveConfiguredLocalInstance();

    return db
      .select(getColumns(PostContents))
      .from(PostContents)
      .innerJoin(Posts, eq(Posts.id, PostContents.postId))
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .where(
        and(
          inArray(PostContents.id, ids),
          postVisibilityAccessWhere({
            ctx,
            configuredLocalInstanceId: configuredLocalInstance.id,
          }),
        ),
      );
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
