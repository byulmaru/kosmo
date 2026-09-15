import { db, Instances, ProfileBlocks, Profiles } from '@kosmo/core/db';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { visibleProfileWhere } from '@/profile/visibility';
import type { UserContext } from '@/context';

export type ProfileBlockRow = typeof ProfileBlocks.$inferSelect;

export const profileBlockByIdLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileBlockRow, string, true>({
    name: `profileBlock.byId:${ctx.session?.profile?.id ?? 'anonymous'}`,
    nullable: true,
    load: async (ids) => {
      const ownerProfileId = ctx.session?.profile?.id;
      if (!ownerProfileId) {
        return [];
      }

      return db
        .select(getColumns(ProfileBlocks))
        .from(ProfileBlocks)
        .innerJoin(Profiles, eq(Profiles.id, ProfileBlocks.targetProfileId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            inArray(ProfileBlocks.id, ids),
            eq(ProfileBlocks.ownerProfileId, ownerProfileId),
            visibleProfileWhere({ profile: Profiles, instance: Instances }),
          ),
        );
    },
    key: (profileBlock) => profileBlock?.id ?? null,
  });

export const viewerProfileBlockLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileBlockRow, string, true>({
    name: `profileBlock.viewerProfileBlock:${ctx.session?.profile?.id ?? 'anonymous'}`,
    nullable: true,
    load: async (targetProfileIds) => {
      const ownerProfileId = ctx.session?.profile?.id;
      if (!ownerProfileId) {
        return [];
      }

      return db
        .select(getColumns(ProfileBlocks))
        .from(ProfileBlocks)
        .innerJoin(Profiles, eq(Profiles.id, ProfileBlocks.targetProfileId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            eq(ProfileBlocks.ownerProfileId, ownerProfileId),
            inArray(ProfileBlocks.targetProfileId, targetProfileIds),
            visibleProfileWhere({ profile: Profiles, instance: Instances }),
          ),
        );
    },
    key: (profileBlock) => profileBlock?.targetProfileId ?? null,
  });
