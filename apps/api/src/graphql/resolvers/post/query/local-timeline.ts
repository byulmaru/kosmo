import {
  db,
  first,
  Instances,
  NaturalLanguageMuteRules,
  Posts,
  ProfilePinnedPosts,
  Profiles,
} from '@kosmo/core/db';
import { PostVisibility } from '@kosmo/core/enums';
import { getNaturalLanguageMuteDecision } from '@kosmo/core/home-timeline/natural-language-mute-cache';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import {
  and,
  asc,
  desc,
  eq,
  getColumns,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  notExists,
} from 'drizzle-orm';
import { env } from '@/env';
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
                  inArray(Profiles.instanceId, [
                    localInstance.id,
                    ...env.KOSMO_LOCAL_TIMELINE_INSTANCE_IDS,
                  ]),
                  eq(Posts.visibility, PostVisibility.PUBLIC),
                  isNotNull(Posts.currentContentId),
                  isNull(Posts.replyParentId),
                  postAccessWhere({ ctx, profileMute: 'exclude' }),
                  notExists(
                    db
                      .select({ id: ProfilePinnedPosts.id })
                      .from(ProfilePinnedPosts)
                      .where(
                        and(
                          eq(ProfilePinnedPosts.profileId, Posts.profileId),
                          eq(ProfilePinnedPosts.postId, Posts.id),
                        ),
                      ),
                  ),
                  before ? gt(Posts.id, before) : undefined,
                  after ? lt(Posts.id, after) : undefined,
                ),
              )
              .orderBy(inverted ? asc(Posts.id) : desc(Posts.id))
              .limit(limit),
        );

        const profileId = ctx.session?.profile?.id;
        if (!profileId || connection.edges.length === 0) {
          return connection;
        }

        const activeRule = await db
          .select({ id: NaturalLanguageMuteRules.id })
          .from(NaturalLanguageMuteRules)
          .where(eq(NaturalLanguageMuteRules.ownerProfileId, profileId))
          .limit(1)
          .then(first);
        if (!activeRule) {
          return connection;
        }

        const excludedPostIds = new Set<string>();
        await Promise.all(
          connection.edges.map(async ({ node }) => {
            if (node.profileId === profileId) {
              return;
            }

            const decision = await getNaturalLanguageMuteDecision(profileId, node.id);
            if (decision?.decision === 'exclude') {
              excludedPostIds.add(node.id);
            }
          }),
        );

        return {
          ...connection,
          edges: connection.edges.filter(({ node }) => !excludedPostIds.has(node.id)),
        };
      },
    },
    PostConnection as never,
  ),
);
