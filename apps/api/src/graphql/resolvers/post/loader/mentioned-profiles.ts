import { db, Instances, PostContents, Profiles } from '@kosmo/core/db';
import { getPostContentMentionProfileIds } from '@kosmo/core/post-content/server';
import { visibleProfileWhere } from '@kosmo/core/visibility';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import type { UserContext } from '@/context';

type MentionedProfileRow = typeof Profiles.$inferSelect & {
  postContentId: string;
};

export const mentionedProfilesLoader = (ctx: UserContext) =>
  ctx.loader<string, MentionedProfileRow, string, false, true>({
    name: 'postContent.mentionedProfiles',
    many: true,
    load: async (postContentIds) => {
      const contentRows = await db
        .select({ id: PostContents.id, document: PostContents.document })
        .from(PostContents)
        .where(inArray(PostContents.id, postContentIds));
      const profileIdsByContentId = new Map(
        contentRows.map(({ document, id }) => [id, getPostContentMentionProfileIds(document)]),
      );
      const profileIds = [...new Set([...profileIdsByContentId.values()].flat())];
      const profiles =
        profileIds.length === 0
          ? []
          : await db
              .select(getColumns(Profiles))
              .from(Profiles)
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  inArray(Profiles.id, profileIds),
                  visibleProfileWhere({ profile: Profiles, instance: Instances }),
                ),
              );
      const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

      return contentRows.flatMap(({ id: postContentId }) =>
        (profileIdsByContentId.get(postContentId) ?? []).flatMap((profileId) => {
          const profile = profilesById.get(profileId);
          return profile ? [{ ...profile, postContentId }] : [];
        }),
      );
    },
    key: (profile) => profile.postContentId,
  });
