import { db, first, ProfileMigrations } from '@kosmo/core/db';
import { AccountProfileRole } from '@kosmo/core/enums';
import { eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '../ref';

builder.objectField(Profile, 'hasMigrationSource', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.OWNER }).field({
    type: 'Boolean',
    nullable: true,
    unauthorizedResolver: () => null,
    resolve: async (profile, _, ctx) => {
      if (profile.id !== ctx.session.profile.id) {
        return null;
      }

      const migration = await db
        .select({ targetProfileId: ProfileMigrations.targetProfileId })
        .from(ProfileMigrations)
        .where(eq(ProfileMigrations.targetProfileId, profile.id))
        .limit(1)
        .then(first);

      return migration !== undefined;
    },
  }),
);
