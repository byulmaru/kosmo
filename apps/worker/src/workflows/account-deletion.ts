import { proxyActivities } from '@temporalio/workflow';
import { workflowActivityOptions } from './activity-options';
import type { AccountDeletionInput } from '@kosmo/core/temporal/account-deletion';
import type * as activities from '../activities';

const { deleteAccountActivity } = proxyActivities<typeof activities>(workflowActivityOptions);

export async function accountDeletionWorkflow(input: AccountDeletionInput): Promise<boolean> {
  return deleteAccountActivity(input);
}
