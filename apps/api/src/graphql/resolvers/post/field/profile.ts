import { db, Posts } from '@kosmo/core/db';
import { PostState } from '@kosmo/core/enums';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, gt, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { Post } from '../ref';

type PostRow = typeof Posts.$inferSelect;

builder.objectFields(Profile, (t) => ({
  posts: t.connection({
    type: Post,
    // 부모 profile은 이미 활성 상태로 로드되어 있어 profile.state를 다시 검사하지 않는다.
    // (profile_id, id desc) 인덱스를 활용해 최신순 cursor 페이지네이션한다.
    // TODO(PROD-102): viewer 기준 공개 범위(UNLISTED 목록 제외, FOLLOWERS/DIRECT 제한)를 적용한다.
    resolve: (profile, args) =>
      resolveCursorConnection<Promise<PostRow[]>>(
        {
          args,
          toCursor: (post) => post.id,
        },
        ({ before, after, limit, inverted }) =>
          db
            .select()
            .from(Posts)
            .where(
              and(
                eq(Posts.profileId, profile.id),
                eq(Posts.state, PostState.ACTIVE),
                before ? gt(Posts.id, before) : undefined,
                after ? lt(Posts.id, after) : undefined,
              ),
            )
            .orderBy(inverted ? asc(Posts.id) : desc(Posts.id))
            .limit(limit),
      ),
  }),
}));
