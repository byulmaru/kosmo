import { db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { PostVisibility } from '@kosmo/core/enums';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, isNotNull, isNull, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { postAccessWhere } from '../access';
import { filterNaturalLanguageMuteExcludes } from './filter-natural-language-mute-excludes';
import { Post, PostConnection } from '../ref';

type PostRow = typeof Posts.$inferSelect;

builder.queryField('federatedTimeline', (t) =>
  t.connection(
    {
      type: Post,
      nullable: true,
      resolve: async (_, args, ctx) => {
        const connection = await resolveCursorConnection<Promise<PostRow[]>>(
          {
            args,
            defaultSize: 20,
            maxSize: 20,
            toCursor: (post) => post.id,
          },
          ({ before, after, limit, inverted }) =>
            db
              .select(getColumns(Posts))
              .from(Posts)
              .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  eq(Posts.visibility, PostVisibility.PUBLIC),
                  isNotNull(Posts.currentContentId),
                  isNull(Posts.replyParentId),
                  postAccessWhere({ ctx, profileMute: 'exclude' }),
                  before ? gt(Posts.id, before) : undefined,
                  after ? lt(Posts.id, after) : undefined,
                ),
              )
              .orderBy(inverted ? asc(Posts.id) : desc(Posts.id))
              .limit(limit),
        );

        const edges = await filterNaturalLanguageMuteExcludes(
          connection.edges,
          ctx.session?.profile?.id,
        );
        return edges === connection.edges ? connection : { ...connection, edges };
      },
    },
    PostConnection as never,
  ),
);
