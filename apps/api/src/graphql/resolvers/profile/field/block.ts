import { db, ProfileBlocks } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { NotFoundError, PermissionDeniedError } from '@kosmo/core/error';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { requireSelectedLocalProfile } from '../access/block';
import { profileBlockTargetLoader } from '../loader/block';
import { Profile, ProfileBlock, ProfileBlockConnection } from '../ref';
import type { ProfileBlockRow, ProfileBlockTargetRow } from '../loader/block';

const ProfileBlockTarget = builder.objectRef<ProfileBlockTargetRow>('ProfileBlockTarget');

ProfileBlockTarget.implement({
  fields: (t) => ({
    id: t.globalID({
      resolve: (target) => ({ id: target.id, type: 'ProfileBlockTarget' }),
    }),
    handle: t.exposeString('handle'),
    displayName: t.exposeString('displayName'),
    domain: t.exposeString('domain'),
    instanceKind: t.expose('kind', {
      type: InstanceKind,
    }),
  }),
});

builder.objectField(ProfileBlock, 'targetProfile', (t) =>
  t.field({
    type: ProfileBlockTarget,
    resolve: async (profileBlock, _, ctx) => {
      const target = await profileBlockTargetLoader(ctx).load(profileBlock.targetProfileId);
      if (!target) {
        throw new NotFoundError('Profile Block target not found');
      }

      return target;
    },
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
              .where(
                and(
                  eq(ProfileBlocks.ownerProfileId, profile.id),
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
