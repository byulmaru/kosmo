import { db, ProfileFollows } from '@kosmo/db';
import { and, eq, inArray } from 'drizzle-orm';
import type { Context } from '@/context';

export const followingLoader = (ctx: Context) =>
  ctx.loader({
    name: 'following',
    nullable: true,
    load: async (ids) => {
      if (!ctx.session?.profileId) {
        return [];
      }

      return await db
        .select()
        .from(ProfileFollows)
        .where(
          and(
            eq(ProfileFollows.profileId, ctx.session.profileId),
            inArray(ProfileFollows.targetProfileId, ids),
          ),
        );
    },

    key: (profileFollow) => profileFollow?.targetProfileId,
  });
