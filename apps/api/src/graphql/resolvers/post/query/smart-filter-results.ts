import { db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { AccountProfileRole, PostState } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { scanNaturalLanguageMuteDecisions } from '@kosmo/core/home-timeline/natural-language-mute-cache';
import { and, eq, getColumns, inArray, isNotNull, ne } from 'drizzle-orm';
import { GraphQLError } from 'graphql';
import { builder } from '@/graphql/builder';
import { directPostAccessWhere } from '../access';
import { PostConnection } from '../ref';

const postIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const scanCursorPattern = /^(0|[1-9][0-9]{0,19})$/;
const maxScanCursor = 0xffffffffffffffffn;

const parseScanCursor = (cursor: string | null | undefined): string => {
  if (cursor == null) {
    return '0';
  }

  if (!scanCursorPattern.test(cursor) || BigInt(cursor) > maxScanCursor) {
    throw new ValidationError('Invalid Smart Filter result cursor', { field: 'after' });
  }

  return cursor;
};

builder.queryField('smartFilterResults', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).field({
    type: PostConnection,
    args: {
      first: t.arg.int({
        required: false,
        defaultValue: 20,
        description: 'Page-size hint; the number of returned posts may be higher or lower.',
      }),
      after: t.arg.string({ required: false }),
    },
    resolve: async (_, args, ctx) => {
      if (args.first != null && args.first < 1) {
        throw new ValidationError('Smart Filter scan work hint must be at least 1', {
          field: 'first',
        });
      }

      const after = parseScanCursor(args.after);
      if (args.after === '0') {
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

      const scan = await scanNaturalLanguageMuteDecisions(
        ctx.session.profile.id,
        after,
        Math.min(args.first ?? 20, 100),
      );
      if (scan === null) {
        throw new GraphQLError('Smart Filter results are unavailable', {
          extensions: { code: 'SERVICE_UNAVAILABLE' },
        });
      }

      const postIds = scan.entries
        .filter(({ decision, postId }) => decision !== null && postIdPattern.test(postId))
        .map(({ postId }) => postId.toLowerCase());
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
                  ne(Posts.profileId, ctx.session.profile.id),
                  directPostAccessWhere({ ctx, profileMute: 'ignore' }),
                ),
              );

      return {
        edges: posts.map((node) => ({ node, cursor: scan.cursor })),
        pageInfo: {
          startCursor: scan.cursor,
          endCursor: scan.cursor,
          hasNextPage: scan.cursor !== '0',
          hasPreviousPage: args.after != null,
        },
      };
    },
  }),
);
