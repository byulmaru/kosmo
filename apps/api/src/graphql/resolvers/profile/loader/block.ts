import { db, Instances, ProfileBlocks, Profiles } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import type { UserContext } from '@/context';

export type ProfileBlockRow = typeof ProfileBlocks.$inferSelect;

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
        .innerJoin(Profiles, eq(Profiles.id, ProfileBlocks.ownerProfileId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            inArray(ProfileBlocks.id, ids),
            eq(ProfileBlocks.ownerProfileId, ownerProfileId),
            eq(Instances.kind, InstanceKind.LOCAL),
          ),
        );
    },
    key: (profileBlock) => profileBlock?.id ?? null,
  });
