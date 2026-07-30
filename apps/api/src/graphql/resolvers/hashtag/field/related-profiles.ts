import { db, Instances, ProfileHashtags, Profiles } from '@kosmo/core/db';
import { ValidationError } from '@kosmo/core/error';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, eq, getColumns, gt } from 'drizzle-orm';
import { parse as parseUuid } from 'uuid';
import { builder } from '@/graphql/builder';
import { ProfileConnection } from '@/graphql/resolvers/profile';
import { visibleProfileWhere } from '@/profile/visibility';
import { Hashtag } from '../ref';

type ProfileRow = typeof Profiles.$inferSelect;

const encodeRelatedProfileCursor = ({ id }: ProfileRow) => Buffer.from(id).toString('base64url');

const decodeRelatedProfileCursor = (cursor: string) => {
  try {
    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') !== cursor) {
      throw new Error('Non-canonical base64url');
    }

    const id = decoded.toString('utf8');
    parseUuid(id);

    return id;
  } catch {
    throw new ValidationError('Invalid Related Profile cursor');
  }
};

builder.objectField(Hashtag, 'relatedProfiles', (t) =>
  t.withAuth({ login: true }).field({
    type: ProfileConnection,
    args: {
      first: t.arg.int({ required: false }),
      after: t.arg.string({ required: false }),
    },
    resolve: (hashtag, args) =>
      resolveCursorConnection<Promise<ProfileRow[]>>(
        {
          args,
          defaultSize: 20,
          maxSize: 20,
          toCursor: encodeRelatedProfileCursor,
        },
        ({ after, limit }) =>
          db
            .select(getColumns(Profiles))
            .from(ProfileHashtags)
            .innerJoin(Profiles, eq(Profiles.id, ProfileHashtags.profileId))
            .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
            .where(
              and(
                eq(ProfileHashtags.hashtagId, hashtag.id),
                visibleProfileWhere({ profile: Profiles, instance: Instances }),
                after !== null && after !== undefined
                  ? gt(Profiles.id, decodeRelatedProfileCursor(after))
                  : undefined,
              ),
            )
            .orderBy(asc(Profiles.id))
            .limit(limit),
      ),
  }),
);
