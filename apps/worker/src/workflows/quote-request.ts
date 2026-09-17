import { proxyActivities } from '@temporalio/workflow';
import { workflowActivityOptions } from './activity-options';
import type * as activities from '../activities';

type PostQuoteRequestEffectsInput = {
  readonly consentId: string;
  readonly postId: string;
  readonly receiptId: string;
  readonly revision: number;
};

const { sendLocalPostQuoteRequestActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function postQuoteRequestEffectsWorkflow({
  consentId,
  postId,
  receiptId,
  revision,
}: PostQuoteRequestEffectsInput): Promise<void> {
  await sendLocalPostQuoteRequestActivity({
    consentId,
    postId,
    receiptId,
    revision,
  });
}
