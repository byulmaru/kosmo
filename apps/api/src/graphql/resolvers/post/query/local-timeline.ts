import { db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { PostVisibility } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { postAccessWhere } from '../access';
import { Post, PostConnection } from '../ref';

type PostRow = typeof Posts.$inferSelect;

builder.queryField('localTimeline', (t) =>
  t.connection(
    {
      type: Post,
      nullable: true,
      resolve: async (_, args, ctx) => {
        const localInstance = await resolveConfiguredLocalInstance();
        const additionalInstanceIds = (process.env.KOSMO_LOCAL_TIMELINE_INSTANCE_IDS ?? '')
          .split(',')
          .map((instanceId) => instanceId.trim())
          .filter(Boolean)
          .map((instanceId) => {
            if (!z.uuid().safeParse(instanceId).success) {
              throw new Error(
                'KOSMO_LOCAL_TIMELINE_INSTANCE_IDS configuration must contain only UUIDs',
              );
            }

            return instanceId;
          });

        return resolveCursorConnection<Promise<PostRow[]>>(
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
                  inArray(Profiles.instanceId, [localInstance.id, ...additionalInstanceIds]),
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
      },
    },
    PostConnection as never,
  ),
);
