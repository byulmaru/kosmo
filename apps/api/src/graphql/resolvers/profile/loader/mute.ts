import { db, ProfileMutes } from '@kosmo/core/db';
import { and, eq, getColumns, inArray, isNull } from 'drizzle-orm';
import type { UserContext } from '@/context';
import type { ProfileMuteRow } from '../ref';

export const viewerProfileMuteLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileMuteRow, string, true>({
    name: 'profileMute.viewerProfileMute',
    nullable: true,
    load: async (targetProfileIds) => {
      if (!ctx.session?.profileId) {
        return [];
      }

      return db
        .select(getColumns(ProfileMutes))
        .from(ProfileMutes)
        .where(
          and(
            eq(ProfileMutes.ownerProfileId, ctx.session.profileId),
            inArray(ProfileMutes.targetProfileId, targetProfileIds),
            isNull(ProfileMutes.expiresAt),
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
      if (!ctx.session?.profileId) {
        return [];
      }

      return db
        .select(getColumns(ProfileMutes))
        .from(ProfileMutes)
        .where(
          and(
            inArray(ProfileMutes.id, ids),
            eq(ProfileMutes.ownerProfileId, ctx.session.profileId),
            isNull(ProfileMutes.expiresAt),
          ),
        );
    },
    key: (profileMute) => profileMute?.id ?? null,
  });
