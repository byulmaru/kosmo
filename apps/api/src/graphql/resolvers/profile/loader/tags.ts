import { db, Hashtags, Instances, ProfileHashtags, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { UserContext } from '@/context';

export type ProfileTagRow = {
  profileId: string;
  name: string;
};

export const profileTagsLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileTagRow, string, false, true>({
    name: 'profile.tags',
    many: true,
    load: (profileIds) =>
      db
        .select({ profileId: ProfileHashtags.profileId, name: Hashtags.name })
        .from(ProfileHashtags)
        .innerJoin(Hashtags, eq(Hashtags.id, ProfileHashtags.hashtagId))
        .innerJoin(Profiles, eq(Profiles.id, ProfileHashtags.profileId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            inArray(ProfileHashtags.profileId, profileIds),
            eq(Profiles.state, ProfileState.ACTIVE),
            eq(Instances.kind, InstanceKind.LOCAL),
            ne(Instances.state, InstanceState.SUSPENDED),
          ),
        ),
    key: (tag) => tag.profileId,
  });
