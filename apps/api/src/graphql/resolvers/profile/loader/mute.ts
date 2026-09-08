import { db, Instances, ProfileMutes, Profiles } from '@kosmo/core/db';
import { and, eq, getColumns, inArray, isNull } from 'drizzle-orm';
import { visibleProfileWhere } from '@/profile/visibility';
import type { InstanceKind } from '@kosmo/core/enums';
import type { UserContext } from '@/context';
import type { ProfileMuteRow } from '../ref';

export type ProfileMuteTargetRow = {
  readonly id: string;
  readonly handle: string;
  readonly displayName: string;
  readonly domain: string;
  readonly kind: InstanceKind;
};

export const viewerProfileMuteLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileMuteRow, string, true>({
    name: 'profileMute.viewerProfileMute',
    nullable: true,
    load: async (targetProfileIds) => {
      if (!ctx.session?.profile?.id) {
        return [];
      }

      return db
        .select(getColumns(ProfileMutes))
        .from(ProfileMutes)
        .innerJoin(Profiles, eq(Profiles.id, ProfileMutes.targetProfileId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            eq(ProfileMutes.ownerProfileId, ctx.session.profile.id),
            inArray(ProfileMutes.targetProfileId, targetProfileIds),
            isNull(ProfileMutes.expiresAt),
            visibleProfileWhere({
              profile: Profiles,
              instance: Instances,
            }),
          ),
        );
    },
    key: (profileMute) => profileMute?.targetProfileId ?? null,
  });

export const profileMuteByIdLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileMuteRow, string, true>({
    name: 'profileMute.byId',
    nullable: true,
    load: async (ids) => {
      if (!ctx.session?.profile?.id) {
        return [];
      }

      return db
        .select(getColumns(ProfileMutes))
        .from(ProfileMutes)
        .innerJoin(Profiles, eq(Profiles.id, ProfileMutes.targetProfileId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            inArray(ProfileMutes.id, ids),
            eq(ProfileMutes.ownerProfileId, ctx.session.profile.id),
            isNull(ProfileMutes.expiresAt),
            visibleProfileWhere({
              profile: Profiles,
              instance: Instances,
            }),
          ),
        );
    },
    key: (profileMute) => profileMute?.id ?? null,
  });

export const profileMuteTargetLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileMuteTargetRow, string, true>({
    name: 'profileMute.target',
    nullable: true,
    load: async (ids) =>
      db
        .select({
          id: Profiles.id,
          handle: Profiles.handle,
          displayName: Profiles.displayName,
          domain: Instances.domain,
          kind: Instances.kind,
        })
        .from(Profiles)
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(inArray(Profiles.id, ids)),
    key: (target) => target?.id ?? null,
  });
