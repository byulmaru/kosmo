import { db, Instances, ProfileHashtags, Profiles } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, eq, getColumns, gt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { ProfileConnection } from '@/graphql/resolvers/profile';
import { visibleProfileWhere } from '@/profile/visibility';
import { Hashtag } from '../ref';

type ProfileRow = typeof Profiles.$inferSelect;

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
          toCursor: (profile) => profile.id,
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
                eq(Instances.kind, InstanceKind.LOCAL),
                visibleProfileWhere({ profile: Profiles, instance: Instances }),
                after ? gt(Profiles.id, after) : undefined,
              ),
            )
            .orderBy(asc(Profiles.id))
            .limit(limit),
      ),
  }),
);
