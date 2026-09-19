import { db, first, Instances, Profiles } from '@kosmo/core/db';
import { AccountProfileRole } from '@kosmo/core/enums';
import {
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '@kosmo/core/error';
import { runWorkflow } from '@kosmo/core/temporal/client';
import {
  profileBlockWorkflow,
  profileUnblockUpdateId,
  profileUnblockWorkflow,
} from '@kosmo/core/temporal/profile-block';
import { ApplicationFailure } from '@temporalio/client';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { visibleProfileWhere } from '@/profile/visibility';
import { profileBlockByIdLoader } from '../loader/block';
import { Profile, ProfileBlock } from '../ref';

const rethrowProfileBlockFailure = (error: unknown): never => {
  if (!(error instanceof ApplicationFailure)) {
    throw error;
  }

  switch (error.type) {
    case 'CONFLICT':
      throw new ConflictError({ message: error.message });
    case 'NOT_FOUND':
      throw new NotFoundError(error.message);
    case 'PERMISSION_DENIED':
      throw new PermissionDeniedError(error.message);
    case 'VALIDATION':
      throw new ValidationError(error.message);
    default:
      throw error;
  }
};

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

      const command = {
        ownerProfileId: selectedProfileId,
        targetProfileId: target.id,
        origin: 'LOCAL',
      } as const;
      const result = await runWorkflow(profileBlockWorkflow, {
        args: [command],
        updateArgs: [command],
        mode: 'update-with-start',
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      }).catch(rethrowProfileBlockFailure);

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
        targetProfile: field.field({ type: Profile, nullable: true }),
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

      const command = {
        ownerProfileId: selectedProfileId,
        targetProfileId: profileBlock.targetProfileId,
        profileBlockId: profileBlock.id,
      };
      const result = await runWorkflow(profileUnblockWorkflow, {
        args: [command],
        updateArgs: [command],
        updateId: profileUnblockUpdateId(command),
        mode: 'update-with-start',
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      }).catch(rethrowProfileBlockFailure);

      return {
        profileBlockId: result.removed ? result.profileBlockId : null,
        targetProfile: profileBlock.targetProfileId,
        success: result.removed,
      };
    },
  }),
);
