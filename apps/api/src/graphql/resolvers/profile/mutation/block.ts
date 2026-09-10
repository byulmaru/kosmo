import { db, first, Instances, Profiles } from '@kosmo/core/db';
import { AccountProfileRole } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { executeProfileBlock, executeProfileUnblock } from '@kosmo/core/temporal/profile-block';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { visibleProfileWhere } from '@/profile/visibility';
import { requireSelectedLocalProfile } from '../access/block';
import { profileBlockByIdLoader } from '../loader/block';
import { Profile, ProfileBlock } from '../ref';

builder.mutationField('blockProfile', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('BlockProfilePayload', {
      fields: (field) => ({
        profileBlock: field.field({ type: ProfileBlock }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: Profile }),
    },
    resolve: async (_, { input }, ctx) => {
      const selected = await requireSelectedLocalProfile(ctx);
      const target = await db
        .select({ id: Profiles.id })
        .from(Profiles)
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            eq(Profiles.id, input.id.id),
            visibleProfileWhere({ profile: Profiles, instance: Instances }),
          ),
        )
        .limit(1)
        .then(first);
      if (!target) {
        throw new NotFoundError('Profile not found');
      }

      const result = await executeProfileBlock({
        ownerProfileId: selected.id,
        targetProfileId: target.id,
        origin: 'LOCAL',
      });
      const profileBlock = await profileBlockByIdLoader(ctx).load(result.profileBlockId);
      if (!profileBlock) {
        throw new Error('Profile Block is missing after durable action');
      }

      return { profileBlock };
    },
  }),
);

builder.mutationField('unblockProfile', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('UnblockProfilePayload', {
      fields: (field) => ({
        profileBlockId: field.globalID({
          nullable: true,
          resolve: (payload) => {
            const { profileBlockId } = payload as { profileBlockId: string | null };
            return profileBlockId ? { id: profileBlockId, type: ProfileBlock } : null;
          },
        }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: ProfileBlock }),
    },
    resolve: async (_, { input }, ctx) => {
      const selected = await requireSelectedLocalProfile(ctx);
      const profileBlock = await profileBlockByIdLoader(ctx).load(input.id.id);
      if (!profileBlock) {
        throw new NotFoundError('Profile Block not found');
      }

      const result = await executeProfileUnblock({
        ownerProfileId: selected.id,
        targetProfileId: profileBlock.targetProfileId,
        profileBlockId: profileBlock.id,
        origin: 'LOCAL',
      });

      return { profileBlockId: result.removed ? result.profileBlockId : null };
    },
  }),
);
