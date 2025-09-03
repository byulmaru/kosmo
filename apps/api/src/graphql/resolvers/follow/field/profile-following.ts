import { db, ProfileFollows, Profiles } from '@kosmo/db';
import { ProfileRelationVisibility, ProfileState } from '@kosmo/enum';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getTableColumns, gt, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';
import { ProfileConnection } from '../../profile/connection';
import type { ResolveCursorConnectionArgs } from '@pothos/plugin-relay';

builder.objectField(Profile, 'following', (t) =>
  t.field({
    type: ProfileConnection,
    nullable: true,
    args: {
      ...t.arg.connectionArgs(),
    },
    resolve: (profile, args, ctx) => {
      if (
        ctx.session?.profileId !== profile.id &&
        profile.relationVisibility === ProfileRelationVisibility.PRIVATE
      ) {
        return null;
      }

      return resolveCursorConnection(
        { args, toCursor: (profile) => profile.profileFollowId },
        async ({ before, after, limit, inverted }: ResolveCursorConnectionArgs) => {
          return await db
            .select({
              ...getTableColumns(Profiles),
              profileFollowId: ProfileFollows.id,
            })
            .from(ProfileFollows)
            .innerJoin(Profiles, eq(ProfileFollows.targetProfileId, Profiles.id))
            .where(
              and(
                eq(ProfileFollows.profileId, profile.id),
                eq(Profiles.state, ProfileState.ACTIVE),
                before ? gt(ProfileFollows.id, before) : undefined,
                after ? lt(ProfileFollows.id, after) : undefined,
              ),
            )
            .orderBy(inverted ? asc(ProfileFollows.id) : desc(ProfileFollows.id))
            .limit(limit);
        },
      );
    },
  }),
);

builder.objectField(Profile, 'followingCount', (t) => t.exposeInt('followingCount'));
