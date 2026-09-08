import { db, Instances, ProfileMutes, Profiles } from '@kosmo/core/db';
import { AccountProfileRole, InstanceKind } from '@kosmo/core/enums';
import { NotFoundError, PermissionDeniedError } from '@kosmo/core/error';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, isNull, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { visibleProfileWhere } from '@/profile/visibility';
import { profileMuteTargetLoader } from '../loader/mute';
import { Profile, ProfileMute, ProfileMuteConnection } from '../ref';
import type { ProfileMuteTargetRow } from '../loader/mute';
import type { ProfileMuteRow } from '../ref';

const ProfileMuteTarget = builder.objectRef<ProfileMuteTargetRow>('ProfileMuteTarget');

ProfileMuteTarget.implement({
  fields: (t) => ({
    id: t.globalID({
      resolve: (target) => ({ id: target.id, type: 'ProfileMuteTarget' }),
    }),
    handle: t.exposeString('handle'),
    displayName: t.exposeString('displayName'),
    domain: t.exposeString('domain'),
    instanceKind: t.expose('kind', {
      type: InstanceKind,
    }),
  }),
});

builder.objectField(ProfileMute, 'targetProfile', (t) =>
  t.field({
    type: ProfileMuteTarget,
    resolve: async (profileMute, _, ctx) => {
      const target = await profileMuteTargetLoader(ctx).load(profileMute.targetProfileId);
      if (!target) {
        throw new NotFoundError('Profile Mute target not found');
      }

      return target;
    },
  }),
);

builder.objectField(Profile, 'profileMutes', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).connection(
    {
      type: ProfileMute,
      resolve: (profile, args, ctx) => {
        if (profile.id !== ctx.session.profile.id) {
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
                  visibleProfileWhere({
                    profile: Profiles,
                    instance: Instances,
                  }),
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
