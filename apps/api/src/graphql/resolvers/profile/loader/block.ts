import { db, Instances, ProfileBlocks, Profiles } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { visibleProfileWhere } from '@/profile/visibility';
import type { UserContext } from '@/context';

export type ProfileBlockRow = typeof ProfileBlocks.$inferSelect;

const OwnerProfiles = alias(Profiles, 'profile_block_owner_profile');
const OwnerInstances = alias(Instances, 'profile_block_owner_instance');
const TargetProfiles = alias(Profiles, 'profile_block_target_profile');
const TargetInstances = alias(Instances, 'profile_block_target_instance');

export const profileBlockByIdLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileBlockRow, string, true>({
    name: `profileBlock.byId:${ctx.session?.profileId ?? 'anonymous'}`,
    nullable: true,
    load: async (ids) => {
      const ownerProfileId = ctx.session?.profileId;
      if (!ownerProfileId) {
        return [];
      }

      return db
        .select(getColumns(ProfileBlocks))
        .from(ProfileBlocks)
        .innerJoin(OwnerProfiles, eq(OwnerProfiles.id, ProfileBlocks.ownerProfileId))
        .innerJoin(OwnerInstances, eq(OwnerInstances.id, OwnerProfiles.instanceId))
        .innerJoin(TargetProfiles, eq(TargetProfiles.id, ProfileBlocks.targetProfileId))
        .innerJoin(TargetInstances, eq(TargetInstances.id, TargetProfiles.instanceId))
        .where(
          and(
            inArray(ProfileBlocks.id, ids),
            eq(ProfileBlocks.ownerProfileId, ownerProfileId),
            eq(OwnerInstances.kind, InstanceKind.LOCAL),
            visibleProfileWhere({ profile: TargetProfiles, instance: TargetInstances }),
          ),
        );
    },
    key: (profileBlock) => profileBlock?.id ?? null,
  });
