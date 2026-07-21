import { db, Instances, Profiles, Reactions } from '@kosmo/core/db';
import { reactionTypeSchema } from '@kosmo/core/validation';
import { PothosValidationError } from '@pothos/core';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, lt, or } from 'drizzle-orm';
import { parse as parseUuid } from 'uuid';
import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { Profile, ProfileConnection } from '@/graphql/resolvers/profile';
import { visibleProfileWhere } from '@/profile/visibility';

type ReactionProfileRow = typeof Profiles.$inferSelect & {
  readonly reactionCreatedAt: Temporal.Instant;
  readonly reactionId: string;
};

type ReactionProfileCursor = {
  readonly createdAt: Temporal.Instant;
  readonly id: string;
};

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

const encodeReactionProfileCursor = ({ reactionCreatedAt, reactionId }: ReactionProfileRow) =>
  Buffer.from(JSON.stringify([reactionCreatedAt.toString(), reactionId])).toString('base64url');

const decodeReactionProfileCursor = (cursor: string): ReactionProfileCursor => {
  try {
    if (!base64UrlPattern.test(cursor)) {
      throw new Error('Invalid base64url');
    }

    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') !== cursor) {
      throw new Error('Non-canonical base64url');
    }

    const value: unknown = JSON.parse(decoded.toString('utf8'));
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      typeof value[0] !== 'string' ||
      typeof value[1] !== 'string'
    ) {
      throw new Error('Invalid cursor payload');
    }

    const [createdAt, id] = value;
    parseUuid(id);

    return { createdAt: Temporal.Instant.from(createdAt), id };
  } catch {
    throw new PothosValidationError('Invalid Reaction Profile cursor');
  }
};

const reactionProfileCursorWhere = (cursor: string | undefined, direction: 'after' | 'before') => {
  if (!cursor) {
    return undefined;
  }

  const { createdAt, id } = decodeReactionProfileCursor(cursor);

  return direction === 'after'
    ? or(
        lt(Reactions.createdAt, createdAt),
        and(eq(Reactions.createdAt, createdAt), lt(Reactions.id, id)),
      )
    : or(
        gt(Reactions.createdAt, createdAt),
        and(eq(Reactions.createdAt, createdAt), gt(Reactions.id, id)),
      );
};

builder.objectFields(Post, (t) => ({
  reactionProfiles: t.connection(
    {
      type: Profile,
      args: {
        type: t.arg.string({ required: true, validate: reactionTypeSchema }),
      },
      resolve: (post, args) =>
        resolveCursorConnection<Promise<ReactionProfileRow[]>>(
          {
            args,
            toCursor: encodeReactionProfileCursor,
          },
          ({ before, after, limit, inverted }) =>
            db
              .select({
                ...getColumns(Profiles),
                reactionCreatedAt: Reactions.createdAt,
                reactionId: Reactions.id,
              })
              .from(Reactions)
              .innerJoin(Profiles, eq(Profiles.id, Reactions.profileId))
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  eq(Reactions.postId, post.id),
                  eq(Reactions.type, args.type),
                  visibleProfileWhere({ profile: Profiles, instance: Instances }),
                  reactionProfileCursorWhere(after, 'after'),
                  reactionProfileCursorWhere(before, 'before'),
                ),
              )
              .orderBy(
                inverted ? asc(Reactions.createdAt) : desc(Reactions.createdAt),
                inverted ? asc(Reactions.id) : desc(Reactions.id),
              )
              .limit(limit),
        ),
    },
    ProfileConnection,
  ),
}));
