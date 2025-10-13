import { db, Profiles } from '@kosmo/db';
import { TimelineManager } from '@kosmo/manager';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { eq, sql } from 'drizzle-orm';
import * as I from 'iter-ops';
import { builder } from '@/graphql/builder';
import { filterNullAndError } from '@/utils/array';
import { PostConnection } from './connection';
import { getPostLoader } from './loader';
import type { ResolveCursorConnectionArgs } from '@pothos/plugin-relay';

builder.queryField('timeline', (t) =>
  t.withAuth({ profile: true }).field({
    type: PostConnection,
    nullable: true,
    args: {
      ...t.arg.connectionArgs(),
    },
    resolve: (_, args, ctx) => {
      return resolveCursorConnection(
        { args, toCursor: (post) => post.score },
        async ({ before, after, limit, inverted }: ResolveCursorConnectionArgs) => {
          db.update(Profiles)
            .set({ lastActivityAt: sql`now()` })
            .where(eq(Profiles.id, ctx.session.profileId))
            .execute();

          const postInfos = await TimelineManager.getPosts({
            profileId: ctx.session.profileId,
            before,
            after,
            limit,
            inverted,
          });

          const postScores = new Map<string, string>();

          const posts = await getPostLoader(ctx)
            .loadMany(
              I.pipe(
                postInfos,
                I.map((postInfo: { id: string; score: string }) => {
                  postScores.set(postInfo.id, postInfo.score);
                  return postInfo.id;
                }),
                I.toArray(),
              ).first!,
            )
            .then(filterNullAndError)
            .then((posts) =>
              posts.map((post) => ({
                ...post,
                score: postScores.get(post.id)!,
              })),
            );

          return posts;
        },
      );
    },

    unauthorizedResolver: () => null,
  }),
);
