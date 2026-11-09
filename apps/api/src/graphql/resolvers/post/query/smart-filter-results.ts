import { db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { AccountProfileRole, PostState } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { readNaturalLanguageMuteDecisionCandidates } from '@kosmo/core/home-timeline/natural-language-mute-cache';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, eq, getColumns, inArray, isNotNull, ne } from 'drizzle-orm';
import { GraphQLError } from 'graphql';
import { builder } from '@/graphql/builder';
import { directPostAccessWhere } from '../access';
import { PostConnection } from '../ref';

type SmartFilterResultCandidate = NonNullable<
  Awaited<ReturnType<typeof readNaturalLanguageMuteDecisionCandidates>>
>[number];

const postIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const smartFilterCursorPattern =
  /^([0-9]{16}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const parseCursor = (cursor: string | null | undefined): string | undefined => {
  if (cursor == null) {
    return undefined;
  }

  const match = smartFilterCursorPattern.exec(cursor);
  if (!match) {
    throw new ValidationError('Invalid Smart Filter result cursor', { field: 'after' });
  }

  return `${match[1]}:${match[2]!.toLowerCase()}`;
};

builder.queryField('smartFilterResults', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).field({
    type: PostConnection,
    args: {
      first: t.arg.int({ required: false, defaultValue: 20 }),
      after: t.arg.string({ required: false }),
    },
    resolve: async (_, args, ctx) => {
      const after = parseCursor(args.after);
      const profileId = ctx.session.profile.id;
      const connection = await resolveCursorConnection<
        Promise<SmartFilterResultCandidate[] | null>
      >(
        {
          args: { ...args, after },
          defaultSize: 20,
          maxSize: 100,
          toCursor: (candidate) => candidate.cursor,
        },
        async ({ after: pageAfter, limit }) => {
          return readNaturalLanguageMuteDecisionCandidates(profileId, {
            ...(pageAfter === undefined ? {} : { after: pageAfter }),
            limit,
          });
        },
      );

      if (connection === null) {
        throw new GraphQLError('Smart Filter results are unavailable', {
          extensions: { code: 'SERVICE_UNAVAILABLE' },
        });
      }

      const candidates = connection.edges.map(({ node }) => node);
      const postIds = [
        ...new Set(
          candidates
            .filter(({ decision, postId }) => decision !== null && postIdPattern.test(postId))
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
      const postsById = new Map(posts.map((post) => [post.id, post]));

      return {
        ...connection,
        edges: connection.edges.flatMap(({ node, ...edge }) => {
          if (node.decision === null) {
            return [];
          }

          const post = postsById.get(node.postId.toLowerCase());
          return post ? [{ ...edge, node: post }] : [];
        }),
      };
    },
  }),
);
