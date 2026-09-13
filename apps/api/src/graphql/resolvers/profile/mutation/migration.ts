import { AccountProfileRole } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { parseProfileHandle } from '@kosmo/core/profile';
import { prepareProfileMigration } from '@kosmo/core/services';
import { runWorkflow } from '@kosmo/core/temporal/client';
import { remoteProfileLookupWorkflow } from '@kosmo/core/temporal/remote-profile';
import {
  ApplicationFailure,
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
} from '@temporalio/client';
import { builder } from '@/graphql/builder';
import { Profile } from '../ref';

const isExpectedSourceMaterializationError = (error: unknown) =>
  error instanceof ApplicationFailure &&
  ['ConflictError', 'NotFoundError', 'RemoteActorMaterializationError'].includes(error.type ?? '');

builder.mutationField('registerProfileMigrationSource', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.OWNER }).fieldWithInput({
    type: builder.simpleObject('RegisterProfileMigrationSourcePayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
      }),
    }),
    input: {
      sourceHandle: t.input.string(),
    },
    resolve: async (_, { input }, ctx) => {
      const targetProfileId = ctx.session.profile.id;
      const localInstance = await resolveConfiguredLocalInstance();
      const source = parseProfileHandle(input.sourceHandle, {
        configuredLocalDomain: localInstance.domain,
      });

      if (!source || source.kind !== 'remote') {
        throw new ValidationError('원본 Profile을 찾을 수 없어요.', { field: 'sourceHandle' });
      }

      let sourceProfileId: string;
      try {
        sourceProfileId = await runWorkflow(remoteProfileLookupWorkflow, {
          args: [
            {
              domain: source.domain,
              handle: source.handle,
              profileId: targetProfileId,
            },
          ],
          mode: 'execute',
          workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
          workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
        });
      } catch (error) {
        if (isExpectedSourceMaterializationError(error)) {
          throw new ValidationError('원본 Profile을 찾을 수 없어요.', { field: 'sourceHandle' });
        }
        throw error;
      }

      await prepareProfileMigration({
        targetProfileId,
        sourceProfileId,
      });

      return { profile: targetProfileId };
    },
  }),
);
