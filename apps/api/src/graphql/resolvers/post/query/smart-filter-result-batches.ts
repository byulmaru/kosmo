import { db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { AccountProfileRole, PostState } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { readNaturalLanguageMuteDecisionBatch } from '@kosmo/core/home-timeline/natural-language-mute-cache';
import { and, eq, getColumns, inArray, isNotNull, ne } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { directPostAccessWhere } from '../access';
import { Post } from '../ref';

type PostRow = typeof Posts.$inferSelect;

type SmartFilterResultBatch = {
  readonly posts: readonly PostRow[];
};

const SmartFilterResultBatch = builder.objectRef<SmartFilterResultBatch>('SmartFilterResultBatch');

SmartFilterResultBatch.implement({
  fields: (t) => ({
    posts: t.field({ type: [Post], resolve: (batch) => batch.posts }),
  }),
});

const SmartFilterResultBatchConnection = builder.connectionObject(
  {
    type: SmartFilterResultBatch,
    name: 'SmartFilterResultBatchConnection',
  },
  {
    name: 'SmartFilterResultBatchConnectionEdge',
  },
);

const postIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const redisCursorPattern = /^(0|[1-9][0-9]*)$/;
const maximumRedisCursor = 0xffff_ffff_ffff_ffffn;

const parseCursor = (cursor: string): string => {
  if (
    !redisCursorPattern.test(cursor) ||
    cursor.length > 20 ||
    BigInt(cursor) > maximumRedisCursor
  ) {
    throw new ValidationError('Invalid Smart Filter result cursor', { field: 'after' });
  }

  return cursor;
};

builder.queryField('smartFilterResultBatches', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).field({
    type: SmartFilterResultBatchConnection,
    args: {
      first: t.arg.int({ required: false, defaultValue: 1 }),
      after: t.arg.string({ required: false }),
    },
    nullable: true,
    unauthorizedResolver: () => null,
    resolve: async (_, { first, after }, ctx) => {
      if (first != null && first !== 1) {
        throw new ValidationError('first must be 1', { field: 'first' });
      }

      const afterPresent = after != null;
      const redisCursor = afterPresent ? parseCursor(after) : '0';
      if (afterPresent && redisCursor === '0') {
        return {
          edges: [],
          pageInfo: {
            startCursor: null,
            endCursor: null,
            hasNextPage: false,
            hasPreviousPage: true,
          },
        };
      }

      const profileId = ctx.session.profile.id;
      const batch = await readNaturalLanguageMuteDecisionBatch(profileId, redisCursor);
      if (batch === null) {
        return null;
      }

      const postIds = [
        ...new Set(
          batch.entries
            .filter(({ postId, decision }) => postIdPattern.test(postId) && decision !== null)
            .map(({ postId }) => postId.toLowerCase()),
        ),
      ];
      const posts =
        postIds.length === 0
          ? []
          : await db
              .select(getColumns(Posts))
              .from(Posts)
              .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  inArray(Posts.id, postIds),
                  eq(Posts.state, PostState.ACTIVE),
                  isNotNull(Posts.currentContentId),
                  ne(Posts.profileId, profileId),
                  directPostAccessWhere({ ctx, profileMute: 'ignore' }),
                ),
              );
      const cursor = batch.cursor;

      return {
        edges: [{ cursor, node: { posts } }],
        pageInfo: {
          startCursor: cursor,
          endCursor: cursor,
          hasNextPage: batch.cursor !== '0',
          hasPreviousPage: afterPresent,
        },
      };
    },
  }),
);
