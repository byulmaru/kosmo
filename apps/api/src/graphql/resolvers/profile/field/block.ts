import { db, Instances, ProfileBlocks, Profiles } from '@kosmo/core/db';
import { PermissionDeniedError } from '@kosmo/core/error';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { visibleProfileWhere } from '@/profile/visibility';
import { requireSelectedLocalProfile } from '../access/block';
import { Profile, ProfileBlock, ProfileBlockConnection } from '../ref';
import type { ProfileBlockRow } from '../loader/block';

builder.objectField(ProfileBlock, 'targetProfile', (t) =>
  t.field({
    type: Profile,
    resolve: (profileBlock) => profileBlock.targetProfileId,
  }),
);

builder.objectField(Profile, 'profileBlocks', (t) =>
  t.withAuth({ usingProfile: true }).connection(
    {
      type: ProfileBlock,
      resolve: async (profile, args, ctx) => {
        const selected = await requireSelectedLocalProfile(ctx);
        if (selected.id !== profile.id) {
          throw new PermissionDeniedError('Profile Block owner is required');
        }

        return resolveCursorConnection<Promise<ProfileBlockRow[]>>(
          {
            args,
            toCursor: (profileBlock) => profileBlock.id,
          },
          ({ before, after, limit, inverted }) =>
            db
              .select(getColumns(ProfileBlocks))
              .from(ProfileBlocks)
              .innerJoin(Profiles, eq(Profiles.id, ProfileBlocks.targetProfileId))
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  eq(ProfileBlocks.ownerProfileId, profile.id),
                  visibleProfileWhere({ profile: Profiles, instance: Instances }),
                  before ? gt(ProfileBlocks.id, before) : undefined,
                  after ? lt(ProfileBlocks.id, after) : undefined,
                ),
              )
              .orderBy(inverted ? asc(ProfileBlocks.id) : desc(ProfileBlocks.id))
              .limit(limit),
        );
      },
    },
    ProfileBlockConnection as never,
  ),
);
