import { db, Instances, Posts, ProfilePinnedPosts, Profiles } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { profilePostListAccessWhere } from '@kosmo/core/visibility';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, lt, or } from 'drizzle-orm';
import { parse as parseUuid } from 'uuid';
import { builder } from '@/graphql/builder';
import { Post, PostConnection } from '../../post/ref';
import { Profile } from '../ref';

type PinnedPostRow = typeof Posts.$inferSelect & {
  readonly pinId: string;
  readonly pinPosition: number | null;
};

type RemotePinnedPostCursor = readonly [position: number, pinId: string];

const decodePinnedPostCursor = (cursor: string) => {
  try {
    parseUuid(cursor);
    return cursor;
  } catch {
    throw new ValidationError('Invalid Pinned Post cursor');
  }
};

const encodeRemotePinnedPostCursor = ({ pinId, pinPosition }: PinnedPostRow) =>
  Buffer.from(JSON.stringify([pinPosition, pinId])).toString('base64url');

const decodeRemotePinnedPostCursor = (cursor: string): RemotePinnedPostCursor => {
  try {
    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') !== cursor) {
      throw new Error('Non-canonical base64url');
    }

    const value = JSON.parse(decoded.toString()) as unknown;
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      !Number.isSafeInteger(value[0]) ||
      value[0] < 0 ||
      typeof value[1] !== 'string'
    ) {
      throw new Error('Invalid remote pinned post cursor');
    }

    parseUuid(value[1]);
    return [value[0] as number, value[1] as string];
  } catch {
    throw new ValidationError('Invalid Pinned Post cursor');
  }
};

const pinnedPostCursorWhere = (
  cursor: string | undefined,
  direction: 'after' | 'before',
  remote: boolean,
) => {
  if (!cursor) {
    return undefined;
  }

  const compare = direction === 'after' ? gt : lt;

  if (remote) {
    const [position, pinId] = decodeRemotePinnedPostCursor(cursor);
    return or(
      compare(ProfilePinnedPosts.position, position),
      and(eq(ProfilePinnedPosts.position, position), compare(ProfilePinnedPosts.id, pinId)),
    );
  }

  return compare(ProfilePinnedPosts.id, decodePinnedPostCursor(cursor));
};

builder.objectField(Profile, 'pinnedPosts', (t) =>
  t.connection(
    {
      type: Post,
      resolve: async (profile, args, ctx) => {
        const instance = await db
          .select({ kind: Instances.kind })
          .from(Instances)
          .where(eq(Instances.id, profile.instanceId))
          .limit(1)
          .then((rows) => rows[0]);
        const remote = instance?.kind === InstanceKind.ACTIVITYPUB;

        return resolveCursorConnection<Promise<PinnedPostRow[]>>(
          {
            args,
            toCursor: remote ? encodeRemotePinnedPostCursor : ({ pinId }) => pinId,
          },
          ({ before, after, limit, inverted }) =>
            db
              .select({
                ...getColumns(Posts),
                pinId: ProfilePinnedPosts.id,
                pinPosition: ProfilePinnedPosts.position,
              })
              .from(ProfilePinnedPosts)
              .innerJoin(Posts, eq(Posts.id, ProfilePinnedPosts.postId))
              .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  eq(ProfilePinnedPosts.profileId, profile.id),
                  profilePostListAccessWhere({
                    db,
                    visitedProfileId: profile.id,
                    viewerProfileId: ctx.session?.profile?.id,
                  }),
                  pinnedPostCursorWhere(after, 'after', remote),
                  pinnedPostCursorWhere(before, 'before', remote),
                ),
              )
              .orderBy(
                ...(remote
                  ? inverted
                    ? [desc(ProfilePinnedPosts.position), desc(ProfilePinnedPosts.id)]
                    : [asc(ProfilePinnedPosts.position), asc(ProfilePinnedPosts.id)]
                  : inverted
                    ? [desc(ProfilePinnedPosts.id)]
                    : [asc(ProfilePinnedPosts.id)]),
              )
              .limit(limit),
        );
      },
    },
    PostConnection,
  ),
);
