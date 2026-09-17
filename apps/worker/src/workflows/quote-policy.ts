import { proxyActivities } from '@temporalio/workflow';
import { workflowActivityOptions } from './activity-options';
import type * as activities from '../activities';

type PostQuotePolicyEffectsInput = {
  readonly postId: string;
  readonly receiptId: string;
  readonly revision: number;
};

const { sendLocalPostUpdateActivity } = proxyActivities<typeof activities>(workflowActivityOptions);

export async function postQuotePolicyEffectsWorkflow({
  postId,
  receiptId,
  revision,
}: PostQuotePolicyEffectsInput): Promise<void> {
  await sendLocalPostUpdateActivity({ postId, receiptId, revision });
}
