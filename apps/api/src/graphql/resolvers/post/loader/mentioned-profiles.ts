import { db, Instances, PostMentions, Profiles } from '@kosmo/core/db';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { visibleProfileWhere } from '@/profile/visibility';
import type { UserContext } from '@/context';

type MentionedProfileRow = typeof Profiles.$inferSelect & {
  postContentId: string;
};

export const mentionedProfilesLoader = (ctx: UserContext) =>
  ctx.loader<string, MentionedProfileRow, string, false, true>({
    name: 'postContent.mentionedProfiles',
    many: true,
    load: (postContentIds) =>
      db
        .select({
          ...getColumns(Profiles),
          postContentId: PostMentions.postContentId,
        })
        .from(PostMentions)
        .innerJoin(Profiles, eq(Profiles.id, PostMentions.profileId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            inArray(PostMentions.postContentId, postContentIds),
            visibleProfileWhere({ profile: Profiles, instance: Instances }),
          ),
        ),
    key: (profile) => profile.postContentId,
  });
