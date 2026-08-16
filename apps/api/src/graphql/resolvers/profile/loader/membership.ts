import { AccountProfiles, db } from '@kosmo/core/db';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import type { UserContext } from '@/context';

type AccountProfileRow = typeof AccountProfiles.$inferSelect;

export const viewerAccountProfileLoader = (ctx: UserContext) =>
  ctx.loader<string, AccountProfileRow, string, true>({
    name: 'profile.viewer.membership',
    nullable: true,
    load: async (profileIds) => {
      const accountId = ctx.session?.accountId;
      if (!accountId) {
        return [];
      }

      return db
        .select(getColumns(AccountProfiles))
        .from(AccountProfiles)
        .where(
          and(
            eq(AccountProfiles.accountId, accountId),
            inArray(AccountProfiles.profileId, profileIds),
          ),
        );
    },
    key: (membership) => membership?.profileId ?? null,
  });
