import { Media, ProfileMedia } from '@kosmo/core/db';
import { MediaState } from '@kosmo/core/enums';
import { and, eq, getColumns, inArray, isNotNull } from 'drizzle-orm';
import type { UserContext } from '@/context';

export type ProfileMediaRow = typeof Media.$inferSelect & {
  kind: typeof ProfileMedia.$inferSelect.kind;
  profileId: string;
};

export const profileMediaLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileMediaRow, string, false, true>({
    name: 'profile.media',
    many: true,
    load: (profileIds) =>
      ctx.db
        .select({
          ...getColumns(Media),
          kind: ProfileMedia.kind,
          profileId: ProfileMedia.profileId,
        })
        .from(ProfileMedia)
        .innerJoin(Media, eq(Media.id, ProfileMedia.mediaId))
        .where(
          and(
            inArray(ProfileMedia.profileId, profileIds),
            eq(Media.state, MediaState.READY),
            isNotNull(Media.url),
          ),
        ),
    key: (media) => media.profileId,
  });
