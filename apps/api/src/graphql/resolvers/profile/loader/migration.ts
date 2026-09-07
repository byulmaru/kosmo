import { db, Instances, ProfileMigrations, Profiles } from '@kosmo/core/db';
import { and, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { visibleProfileWhere } from '@/profile/visibility';
import type { UserContext } from '@/context';

const MigrationSourceProfiles = alias(Profiles, 'profile_migration_source_profile');

export type ProfileMigrationSourceRow = {
  source: typeof Profiles.$inferSelect;
  targetProfileId: string;
};

export const profileMigrationSourceByTargetIdLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileMigrationSourceRow, string, true>({
    name: 'profile.migrationSource',
    nullable: true,
    load: (targetProfileIds) =>
      db
        .select({
          source: MigrationSourceProfiles,
          targetProfileId: ProfileMigrations.targetProfileId,
        })
        .from(ProfileMigrations)
        .innerJoin(
          MigrationSourceProfiles,
          eq(MigrationSourceProfiles.id, ProfileMigrations.sourceProfileId),
        )
        .innerJoin(Instances, eq(Instances.id, MigrationSourceProfiles.instanceId))
        .where(
          and(
            inArray(ProfileMigrations.targetProfileId, targetProfileIds),
            visibleProfileWhere({ profile: MigrationSourceProfiles, instance: Instances }),
          ),
        ),
    key: (row) => row?.targetProfileId ?? null,
  });
