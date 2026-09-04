import { db, Instances, ProfileMutes, Profiles } from '@kosmo/core/db';
import { PermissionDeniedError } from '@kosmo/core/error';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, isNull, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { visibleProfileWhere } from '@/profile/visibility';
import { Profile, ProfileMute, ProfileMuteConnection } from '../ref';
import type { ProfileMuteRow } from '../ref';

builder.objectField(ProfileMute, 'targetProfile', (t) =>
  t.field({
    type: Profile,
    resolve: (profileMute) => profileMute.targetProfileId,
  }),
);

builder.objectField(Profile, 'profileMutes', (t) =>
  t.withAuth({ usingProfile: true }).connection(
    {
      type: ProfileMute,
      resolve: (profile, args, ctx) => {
        if (profile.id !== ctx.session.profileId) {
          throw new PermissionDeniedError('Profile mute owner is required');
        }

        return resolveCursorConnection<Promise<ProfileMuteRow[]>>(
          {
            args,
            toCursor: (profileMute) => profileMute.id,
          },
          ({ before, after, limit, inverted }) =>
            db
              .select(getColumns(ProfileMutes))
              .from(ProfileMutes)
              .innerJoin(Profiles, eq(Profiles.id, ProfileMutes.targetProfileId))
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  eq(ProfileMutes.ownerProfileId, profile.id),
                  isNull(ProfileMutes.expiresAt),
                  visibleProfileWhere({ profile: Profiles, instance: Instances }),
                  before ? gt(ProfileMutes.id, before) : undefined,
                  after ? lt(ProfileMutes.id, after) : undefined,
                ),
              )
              .orderBy(inverted ? asc(ProfileMutes.id) : desc(ProfileMutes.id))
              .limit(limit),
        );
      },
    },
    ProfileMuteConnection as never,
  ),
);
