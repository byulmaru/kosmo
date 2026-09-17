import { accountDeletionWorkflow } from '@kosmo/core/temporal/account-deletion';
import { runWorkflow } from '@kosmo/core/temporal/client';
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/client';
import { builder } from '@/graphql/builder';

builder.mutationField('deleteAccount', (t) =>
  t.withAuth({ login: true }).field({
    type: builder.simpleObject('DeleteAccountPayload', {
      fields: (field) => ({
        completed: field.boolean(),
      }),
    }),
    resolve: async (_, __, ctx) => {
      ctx.c.header('Cache-Control', 'no-store');
      ctx.c.header('Pragma', 'no-cache');

      const completed = await runWorkflow(accountDeletionWorkflow, {
        args: [{ accountId: ctx.session.accountId }],
        mode: 'execute',
        workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
        workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
      });

      return {
        completed,
      };
    },
  }),
);
