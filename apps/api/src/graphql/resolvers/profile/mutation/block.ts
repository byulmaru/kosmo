import { db, first, Instances, Profiles } from '@kosmo/core/db';
import { AccountProfileRole } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { executeProfileBlock, executeProfileUnblock } from '@kosmo/core/temporal/profile-block';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { visibleProfileWhere } from '@/profile/visibility';
import { profileBlockByIdLoader } from '../loader/block';
import { Profile, ProfileBlock } from '../ref';

builder.mutationField('blockProfile', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('BlockProfilePayload', {
      fields: (field) => ({
        profileBlock: field.field({ type: ProfileBlock }),
        success: field.boolean(),
      }),
    }),
    input: {
      id: t.input.globalID({ for: Profile }),
    },
    resolve: async (_, { input }, ctx) => {
      const selectedProfileId = ctx.session.profile.id;
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
        ownerProfileId: selectedProfileId,
        targetProfileId: target.id,
        origin: 'LOCAL',
      });

      return {
        profileBlock: result.profileBlockId,
        success: true,
      };
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
        success: field.boolean(),
      }),
    }),
    input: {
      id: t.input.globalID({ for: ProfileBlock }),
    },
    resolve: async (_, { input }, ctx) => {
      const selectedProfileId = ctx.session.profile.id;
      const profileBlock = await profileBlockByIdLoader(ctx).load(input.id.id);
      if (!profileBlock) {
        throw new NotFoundError('Profile Block not found');
      }

      const result = await executeProfileUnblock({
        ownerProfileId: selectedProfileId,
        targetProfileId: profileBlock.targetProfileId,
        profileBlockId: profileBlock.id,
        origin: 'LOCAL',
      });

      return {
        profileBlockId: result.removed ? result.profileBlockId : null,
        success: result.removed,
      };
    },
  }),
);
