import { db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { eq, sql } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { postVisibilityAccessWhere } from '../access/visibility';
import { Post } from '../ref';
import type { UserContext } from '@/context';

type PostRow = typeof Posts.$inferSelect;

type RawReplyAncestorRow = Omit<PostRow, 'createdAt' | 'deletedAt'> & {
  readonly createdAt: string;
  readonly deletedAt: string | null;
  readonly depth: number;
};

const loadReplyAncestors = async (post: PostRow, ctx: UserContext): Promise<PostRow[]> => {
  if (!post.replyParentId) {
    return [];
  }

  const visibilityWhere = postVisibilityAccessWhere({ ctx });
  const ancestors = await db.execute<RawReplyAncestorRow>(sql`
    WITH RECURSIVE reply_ancestor AS (
      SELECT
        ${Posts.id},
        ${Posts.profileId},
        ${Posts.visibility},
        ${Posts.state},
        ${Posts.currentContentId},
        ${Posts.replyParentId},
        ${Posts.repostSourceId},
        ${Posts.createdAt},
        ${Posts.deletedAt},
        ARRAY[${post.id}::uuid, ${Posts.id}] AS path,
        1 AS depth
      FROM ${Posts}
      INNER JOIN ${Profiles} ON ${eq(Profiles.id, Posts.profileId)}
      INNER JOIN ${Instances} ON ${eq(Instances.id, Profiles.instanceId)}
      WHERE ${Posts.id} = ${post.replyParentId}
        AND ${visibilityWhere}

      UNION ALL

      SELECT
        ${Posts.id},
        ${Posts.profileId},
        ${Posts.visibility},
        ${Posts.state},
        ${Posts.currentContentId},
        ${Posts.replyParentId},
        ${Posts.repostSourceId},
        ${Posts.createdAt},
        ${Posts.deletedAt},
        array_append(reply_ancestor.path, ${Posts.id}),
        reply_ancestor.depth + 1
      FROM reply_ancestor
      INNER JOIN ${Posts} ON ${Posts.id} = reply_ancestor.reply_parent_id
      INNER JOIN ${Profiles} ON ${eq(Profiles.id, Posts.profileId)}
      INNER JOIN ${Instances} ON ${eq(Instances.id, Profiles.instanceId)}
      WHERE NOT (${Posts.id} = ANY(reply_ancestor.path))
        AND ${visibilityWhere}
    )
    SELECT
      id,
      profile_id AS "profileId",
      visibility,
      state,
      current_content_id AS "currentContentId",
      reply_parent_id AS "replyParentId",
      repost_source_id AS "repostSourceId",
      created_at AS "createdAt",
      deleted_at AS "deletedAt",
      depth
    FROM reply_ancestor
    ORDER BY depth
  `);

  return ancestors.map((ancestor) => ({
    id: ancestor.id,
    profileId: ancestor.profileId,
    visibility: ancestor.visibility,
    state: ancestor.state,
    currentContentId: ancestor.currentContentId,
    replyParentId: ancestor.replyParentId,
    repostSourceId: ancestor.repostSourceId,
    createdAt: Temporal.Instant.from(ancestor.createdAt),
    deletedAt: ancestor.deletedAt ? Temporal.Instant.from(ancestor.deletedAt) : null,
  }));
};

builder.objectFields(Post, (t) => ({
  replyAncestors: t.field({
    type: [Post],
    resolve: (post, _, ctx) => loadReplyAncestors(post, ctx),
  }),
}));
